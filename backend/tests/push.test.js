const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login, unique, ensureTodayMenu, prisma } = require('./helpers');

test('Notifications push : abonnement et désabonnement', async (suite) => {
  await startServer();
  suite.after(() => stopServer());

  const server = await login('marie@chemoiresto.ci', 'Serveuse@2026');
  const endpoint = `https://fcm.googleapis.com/fcm/send/${unique('test')}`;

  suite.after(() => prisma.pushSubscription.deleteMany({ where: { endpoint } }));

  await suite.test('abonnement refusé sans authentification (401)', async () => {
    const result = await api('/api/push/subscribe', {
      method: 'POST',
      body: { endpoint, keys: { p256dh: 'clé-p256dh', auth: 'clé-auth' } },
    });
    assert.equal(result.status, 401);
  });

  await suite.test('abonnement enregistré', async () => {
    const result = await api('/api/push/subscribe', {
      method: 'POST',
      token: server.token,
      body: { endpoint, keys: { p256dh: 'clé-p256dh', auth: 'clé-auth' } },
    });
    assert.equal(result.status, 201);

    const row = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    assert.ok(row);
    assert.equal(row.userId, server.user.id);
  });

  await suite.test('un second abonnement sur le même endpoint met à jour la ligne (pas de doublon)', async () => {
    await api('/api/push/subscribe', {
      method: 'POST',
      token: server.token,
      body: { endpoint, keys: { p256dh: 'nouvelle-clé', auth: 'clé-auth' } },
    });
    const count = await prisma.pushSubscription.count({ where: { endpoint } });
    assert.equal(count, 1);
  });

  await suite.test('désabonnement : la ligne disparaît', async () => {
    const result = await api('/api/push/unsubscribe', {
      method: 'POST',
      token: server.token,
      body: { endpoint },
    });
    assert.equal(result.status, 200);

    const row = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    assert.equal(row, null);
  });

  await suite.test('endpoint invalide refusé (400)', async () => {
    const result = await api('/api/push/subscribe', {
      method: 'POST',
      token: server.token,
      body: { endpoint: 'pas-une-url', keys: { p256dh: 'x', auth: 'y' } },
    });
    assert.equal(result.status, 400);
  });
});

test('Notifications push : abonnement automatique du client (sans compte)', async (suite) => {
  await startServer();
  suite.after(() => stopServer());

  const admin = await login('admin@chemoiresto.ci', 'Admin@2026');
  const restaurantId = admin.user.restaurantId;
  await ensureTodayMenu(restaurantId);

  const table = await prisma.restaurantTable.findFirst({
    where: { restaurantId, status: 'ACTIVE' },
    orderBy: { number: 'asc' },
  });
  const menuResponse = await api(`/api/menu/table/${table.token}`);
  const menuItems = menuResponse.data.menu.items;
  const product = menuItems.find((item) => item.options.length === 0) || menuItems[0];

  const createdOrderIds = [];
  suite.after(() => prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }));

  async function passerCommande() {
    const result = await api('/api/orders', {
      method: 'POST',
      body: { tableToken: table.token, items: [{ productId: product.productId, quantity: 1 }] },
    });
    assert.equal(result.status, 201);
    createdOrderIds.push(result.data.id);
    return result.data;
  }

  const endpoint = `https://fcm.googleapis.com/fcm/send/${unique('client')}`;
  suite.after(() => prisma.pushSubscription.deleteMany({ where: { endpoint } }));

  await suite.test('jeton de suivi introuvable refusé (404)', async () => {
    const result = await api('/api/push/subscribe-client', {
      method: 'POST',
      body: { trackingToken: 'a'.repeat(32), endpoint, keys: { p256dh: 'clé-p256dh', auth: 'clé-auth' } },
    });
    assert.equal(result.status, 404);
  });

  await suite.test('abonnement enregistré, rattaché à la commande (pas à un compte)', async () => {
    const order = await passerCommande();
    const result = await api('/api/push/subscribe-client', {
      method: 'POST',
      body: { trackingToken: order.trackingToken, endpoint, keys: { p256dh: 'clé-p256dh', auth: 'clé-auth' } },
    });
    assert.equal(result.status, 201);

    const row = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    assert.equal(row.orderId, order.id);
    assert.equal(row.userId, null);
  });

  await suite.test('un nouvel abonnement sur le même appareil déplace l\'endpoint vers la nouvelle commande', async () => {
    const autreCommande = await passerCommande();
    await api('/api/push/subscribe-client', {
      method: 'POST',
      body: {
        trackingToken: autreCommande.trackingToken,
        endpoint,
        keys: { p256dh: 'clé-p256dh', auth: 'clé-auth' },
      },
    });

    const count = await prisma.pushSubscription.count({ where: { endpoint } });
    assert.equal(count, 1);
    const row = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    assert.equal(row.orderId, autreCommande.id);
  });

  await suite.test('endpoint invalide refusé (400)', async () => {
    const result = await api('/api/push/subscribe-client', {
      method: 'POST',
      body: { trackingToken: 'a'.repeat(32), endpoint: 'pas-une-url', keys: { p256dh: 'x', auth: 'y' } },
    });
    assert.equal(result.status, 400);
  });

  await suite.test('désabonnement client : la ligne disparaît, sans authentification', async () => {
    const result = await api('/api/push/unsubscribe-client', { method: 'POST', body: { endpoint } });
    assert.equal(result.status, 200);

    const row = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    assert.equal(row, null);
  });
});
