const test = require('node:test');
const assert = require('node:assert/strict');
const {
  startServer,
  stopServer,
  api,
  login,
  connectSocket,
  waitForEvent,
  ensureTodayMenu,
  prisma,
} = require('./helpers');

test('Commandes : calcul, temps réel, workflow et historique des prix', async (suite) => {
  await startServer();
  suite.after(() => stopServer());

  const admin = await login('admin@chemoiresto.ci', 'Admin@2026');
  const server = await login('marie@chemoiresto.ci', 'Serveuse@2026');

  await ensureTodayMenu(admin.user.restaurantId);

  const table = await prisma.restaurantTable.findFirst({
    where: { restaurantId: admin.user.restaurantId, status: 'ACTIVE' },
    orderBy: { number: 'asc' },
  });
  assert.ok(table, 'le seed doit avoir créé des tables');

  const menuResponse = await api(`/api/menu/table/${table.token}`);
  assert.ok(menuResponse.data.menu, 'un menu du jour doit être publié');

  const menuItems = menuResponse.data.menu.items;
  const withOptions = menuItems.find((item) => item.options.some((group) => group.values.length > 0));
  const simple = menuItems.find((item) => item.options.length === 0) || menuItems[0];

  const createdOrderIds = [];
  suite.after(async () => {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  });

  let staffSocket;
  let clientSocket;

  suite.after(() => {
    staffSocket?.close();
    clientSocket?.close();
  });

  await suite.test('la serveuse se connecte a Socket.IO avec son JWT', async () => {
    staffSocket = await connectSocket(server.token);
    assert.ok(staffSocket.connected);
  });

  let order;
  let expectedTotal;

  await suite.test('creation de commande : le total est recalcule par le serveur', async () => {
    const optionGroup = withOptions.options[0];
    const optionValue = optionGroup.values[0];

    expectedTotal = (withOptions.price + optionValue.priceDelta) * 2 + simple.price * 1;

    const notified = waitForEvent(staffSocket, 'new_order');

    const result = await api('/api/orders', {
      method: 'POST',
      body: {
        tableToken: table.token,
        customerName: 'Client automatique',
        comment: 'Sans piment',
        items: [
          { productId: withOptions.productId, quantity: 2, optionValueIds: [optionValue.id] },
          { productId: simple.productId, quantity: 1 },
        ],
        // Champs parasites : le serveur doit les ignorer completement.
        total: 1,
        subtotal: 1,
      },
    });

    assert.equal(result.status, 201);
    assert.equal(result.data.total, expectedTotal, 'le total doit être recalcule côté serveur');
    assert.match(result.data.orderNumber, /^CMD-\d{8}-\d{4}$/);
    assert.ok(result.data.trackingToken, 'un jeton de suivi doit être fourni');

    order = result.data;
    createdOrderIds.push(order.id);

    // -- temps réel : la serveuse reçoit la commande
    const event = await notified;
    assert.equal(event.orderNumber, order.orderNumber);
    assert.equal(event.table.number, table.number);
  });

  await suite.test('le prix des options est bien ajouté a chaque ligne', async () => {
    const line = order.items.find((item) => item.productId === withOptions.productId);
    assert.equal(line.quantity, 2);
    assert.equal(line.lineTotal, (line.unitPrice + line.optionsTotal) * 2);
    assert.ok(line.options.length > 0, 'les options choisies doivent être enregistrées');
  });

  await suite.test('panier vide refusé (400)', async () => {
    const result = await api('/api/orders', {
      method: 'POST',
      body: { tableToken: table.token, items: [] },
    });
    assert.equal(result.status, 400);
  });

  await suite.test('quantité invalide refusée (400)', async () => {
    const result = await api('/api/orders', {
      method: 'POST',
      body: { tableToken: table.token, items: [{ productId: simple.productId, quantity: 0 }] },
    });
    assert.equal(result.status, 400);
  });

  await suite.test('produit absent du menu du jour refusé (400)', async () => {
    const menuProductIds = new Set(menuItems.map((item) => item.productId));
    const outside = await prisma.product.findFirst({
      where: { restaurantId: admin.user.restaurantId, id: { notIn: [...menuProductIds] } },
    });

    if (!outside) return; // tous les produits sont au menu : rien à vérifier

    const result = await api('/api/orders', {
      method: 'POST',
      body: { tableToken: table.token, items: [{ productId: outside.id, quantity: 1 }] },
    });
    assert.equal(result.status, 400);
    assert.match(result.message, /menu du jour/i);
  });

  await suite.test('produit indisponible refusé (400)', async () => {
    await api(`/api/products/${simple.productId}/availability`, {
      method: 'PATCH',
      token: admin.token,
    });

    const result = await api('/api/orders', {
      method: 'POST',
      body: { tableToken: table.token, items: [{ productId: simple.productId, quantity: 1 }] },
    });

    assert.equal(result.status, 400);
    assert.match(result.message, /indisponible/i);

    await api(`/api/products/${simple.productId}/availability`, {
      method: 'PATCH',
      token: admin.token,
    });
  });

  await suite.test('option inconnue refusée (400)', async () => {
    const result = await api('/api/orders', {
      method: 'POST',
      body: {
        tableToken: table.token,
        items: [{ productId: simple.productId, quantity: 1, optionValueIds: [999999] }],
      },
    });
    assert.equal(result.status, 400);
  });

  await suite.test('le client suit sa commande en temps réel', async () => {
    clientSocket = await connectSocket(null);
    clientSocket.emit('track_order', order.trackingToken);
    await new Promise((resolve) => setTimeout(resolve, 300));

    const received = [];
    clientSocket.on('order_status', (payload) => received.push(payload.status));

    for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'SERVED']) {
      const result = await api(`/api/orders/${order.id}/status`, {
        method: 'PUT',
        token: server.token,
        body: { status },
      });
      assert.equal(result.success, true);
      assert.equal(result.data.status, status);
    }

    await new Promise((resolve) => setTimeout(resolve, 600));

    for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'SERVED']) {
      assert.ok(received.includes(status), `le client doit recevoir le statut ${status}`);
    }
  });

  await suite.test('transition de statut invalide refusée (400)', async () => {
    const result = await api(`/api/orders/${order.id}/status`, {
      method: 'PUT',
      token: server.token,
      body: { status: 'PREPARING' },
    });
    assert.equal(result.status, 400);
    assert.match(result.message, /Transition impossible/i);
  });

  await suite.test('la commande est attribuée automatiquement à la serveuse qui accepté', async () => {
    const result = await api(`/api/orders/${order.id}`, { token: admin.token });
    assert.equal(result.data.server.id, server.user.id);
  });

  await suite.test('historique des statuts complet', async () => {
    const result = await api(`/api/orders/${order.id}`, { token: admin.token });
    const statuses = result.data.statusHistory.map((entry) => entry.status);
    assert.deepEqual(statuses, ['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED']);
  });

  await suite.test('historique des prix : changer le prix ne modifie pas les commandes passées', async () => {
    const productId = withOptions.productId;
    const before = await api(`/api/products/${productId}`, { token: admin.token });
    const oldPrice = before.data.basePrice;

    const orderBefore = await api(`/api/orders/${order.id}`, { token: admin.token });
    const lineBefore = orderBefore.data.items.find((item) => item.productId === productId);

    await api(`/api/products/${productId}`, {
      method: 'PUT',
      token: admin.token,
      body: { basePrice: oldPrice + 2000 },
    });

    const orderAfter = await api(`/api/orders/${order.id}`, { token: admin.token });
    const lineAfter = orderAfter.data.items.find((item) => item.productId === productId);

    assert.equal(lineAfter.unitPrice, lineBefore.unitPrice, 'le prix enregistré ne doit pas bouger');
    assert.equal(orderAfter.data.total, orderBefore.data.total, 'le total ne doit pas bouger');

    await api(`/api/products/${productId}`, {
      method: 'PUT',
      token: admin.token,
      body: { basePrice: oldPrice },
    });
  });

  await suite.test('l\'administrateur attribue une commande à une serveuse', async () => {
    const fresh = await api('/api/orders', {
      method: 'POST',
      body: { tableToken: table.token, items: [{ productId: simple.productId, quantity: 1 }] },
    });
    createdOrderIds.push(fresh.data.id);

    const assigned = waitForEvent(staffSocket, 'order_assigned');

    const result = await api(`/api/orders/${fresh.data.id}/assign`, {
      method: 'PUT',
      token: admin.token,
      body: { serverId: server.user.id },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.server.id, server.user.id);

    const event = await assigned;
    assert.equal(event.id, fresh.data.id);
  });

  await suite.test('une serveuse ne peut pas attribuer une commande (403)', async () => {
    const result = await api(`/api/orders/${order.id}/assign`, {
      method: 'PUT',
      token: server.token,
      body: { serverId: null },
    });
    assert.equal(result.status, 403);
  });

  await suite.test('le suivi public fonctionne avec le jeton de suivi', async () => {
    const result = await api(`/api/orders/track/${order.trackingToken}`);
    assert.equal(result.success, true);
    assert.equal(result.data.orderNumber, order.orderNumber);
    assert.equal(result.data.statusHistory, undefined, 'pas de données internes côté client');
  });

  await suite.test('le tableau Kanban regroupe les commandes par statut', async () => {
    const result = await api('/api/orders/board', { token: server.token });
    assert.equal(result.success, true);
    assert.ok(result.data.columns.NEW);
    assert.ok(result.data.columns.READY);
    assert.equal(typeof result.data.stats.served, 'number');
  });

  await suite.test('des notifications ont été enregistrées', async () => {
    const result = await api('/api/notifications', { token: server.token });
    assert.equal(result.success, true);
    assert.ok(result.data.length > 0);
    assert.ok(result.data.some((notification) => notification.type === 'NEW_ORDER'));
  });
});
