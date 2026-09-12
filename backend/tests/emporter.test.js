const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login, ensureTodayMenu, prisma } = require('./helpers');

test('Commandes à emporter', async (suite) => {
  await startServer();

  const admin = await login('admin@chemoiresto.ci', 'Admin@2026');
  const serveuse = await login('marie@chemoiresto.ci', 'Serveuse@2026');

  const restaurant = await prisma.restaurant.findFirst();
  await ensureTodayMenu(restaurant.id);

  const table = await prisma.restaurantTable.findFirst({
    where: { restaurantId: restaurant.id, status: 'ACTIVE' },
  });
  const menu = await prisma.dailyMenu.findFirst({
    where: { restaurantId: restaurant.id, isPublished: true },
    include: { items: { include: { product: { include: { options: true } } } } },
    orderBy: { date: 'desc' },
  });

  // Un plat sans option obligatoire, pour que le panier d'essai reste minimal.
  const item = menu.items.find(
    (entry) =>
      entry.product.isActive &&
      entry.product.isAvailable &&
      !entry.product.options.some((option) => option.isRequired)
  );
  assert.ok(item, 'aucun plat sans option obligatoire dans le menu du jour');
  const panier = [{ productId: item.productId, quantity: 1, optionValueIds: [] }];

  // Etat de depart connu : la vente à emporter est fermee.
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { takeawayEnabled: false },
  });

  let jeton = null;

  suite.after(async () => {
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { takeawayEnabled: false },
    });
    await stopServer();
  });

  await suite.test('fermée par defaut : le jeton existant ne donne rien', async () => {
    const actuel = await prisma.restaurant.findUnique({ where: { id: restaurant.id } });
    if (!actuel.takeawayToken) return; // jamais ouverte : rien à vérifier ici
    const result = await api(`/api/menu/emporter/${actuel.takeawayToken}`);
    assert.equal(result.status, 403);
  });

  await suite.test('une serveuse ne peut pas ouvrir la vente à emporter', async () => {
    const result = await api('/api/restaurant/emporter', {
      method: 'PATCH',
      token: serveuse.token,
      body: { enabled: true },
    });
    assert.equal(result.status, 403);
  });

  await suite.test('l\'administrateur ouvre la vente et reçoit une adresse + un QR Code', async () => {
    const result = await api('/api/restaurant/emporter', {
      method: 'PATCH',
      token: admin.token,
      body: { enabled: true },
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.takeaway.enabled, true);
    assert.match(result.data.takeaway.url, /\/menu\/emporter\/[a-f0-9]{32}$/);
    assert.match(result.data.takeaway.qrDataUrl, /^data:image\/png;base64,/);
    jeton = result.data.takeawayToken;
  });

  await suite.test('le menu à emporter s\'ouvre sans table', async () => {
    const result = await api(`/api/menu/emporter/${jeton}`);
    assert.equal(result.status, 200);
    assert.equal(result.data.service, 'TAKEAWAY');
    assert.equal(result.data.table, null);
    assert.equal(result.data.restaurant.name, restaurant.name);
    assert.ok(result.data.menu);
  });

  await suite.test('un jeton inconnu est refusé', async () => {
    const result = await api(`/api/menu/emporter/${'0'.repeat(32)}`);
    assert.equal(result.status, 404);
  });

  await suite.test('la commande à emporter reçoit un code de retrait', async () => {
    const result = await api('/api/orders', {
      method: 'POST',
      body: {
        takeawayToken: jeton,
        customerName: 'Awa',
        customerPhone: '0700000001',
        items: panier,
      },
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.type, 'TAKEAWAY');
    assert.equal(result.data.table, null);
    assert.match(result.data.pickupCode, /^\d{4}$/);
    // Le code de retrait est la fin du numéro du jour : les deux doivent
    // concorder, sinon le comptoir et la cuisine annoncent des codes differents.
    assert.ok(result.data.orderNumber.endsWith(result.data.pickupCode));
  });

  await suite.test('une commande a table reste une commande a table', async () => {
    const result = await api('/api/orders', {
      method: 'POST',
      body: { tableToken: table.token, items: panier },
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.type, 'DINE_IN');
    assert.equal(result.data.pickupCode, null);
    assert.equal(result.data.table.number, table.number);
  });

  await suite.test('fournir les deux jetons est refusé', async () => {
    const result = await api('/api/orders', {
      method: 'POST',
      body: { tableToken: table.token, takeawayToken: jeton, items: panier },
    });
    assert.equal(result.status, 400);
  });

  await suite.test('ne fournir aucun jeton est refusé', async () => {
    const result = await api('/api/orders', { method: 'POST', body: { items: panier } });
    assert.equal(result.status, 400);
  });

  await suite.test('le personnel peut filtrer les commandes à emporter', async () => {
    const result = await api('/api/orders?type=TAKEAWAY&period=today', { token: admin.token });
    assert.equal(result.status, 200);
    assert.ok(result.data.orders.length > 0);
    for (const commande of result.data.orders) {
      assert.equal(commande.type, 'TAKEAWAY');
      assert.equal(commande.table, null);
    }
  });

  await suite.test('refermer la vente bloque le menu et les commandes', async () => {
    const fermeture = await api('/api/restaurant/emporter', {
      method: 'PATCH',
      token: admin.token,
      body: { enabled: false },
    });
    assert.equal(fermeture.status, 200);

    const menuFerme = await api(`/api/menu/emporter/${jeton}`);
    assert.equal(menuFerme.status, 403);

    const commande = await api('/api/orders', {
      method: 'POST',
      body: { takeawayToken: jeton, items: panier },
    });
    assert.equal(commande.status, 403);
  });

  await suite.test('rouvrir conserve le jeton : l\'affiche imprimee reste valable', async () => {
    const result = await api('/api/restaurant/emporter', {
      method: 'PATCH',
      token: admin.token,
      body: { enabled: true },
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.takeawayToken, jeton);
  });

  await suite.test('regenerer le jeton invalide l\'ancienne adresse', async () => {
    const result = await api('/api/restaurant/emporter', {
      method: 'PATCH',
      token: admin.token,
      body: { enabled: true, regenerate: true },
    });
    assert.equal(result.status, 200);
    assert.notEqual(result.data.takeawayToken, jeton);

    const ancienne = await api(`/api/menu/emporter/${jeton}`);
    assert.equal(ancienne.status, 404);

    const nouvelle = await api(`/api/menu/emporter/${result.data.takeawayToken}`);
    assert.equal(nouvelle.status, 200);
  });
});
