const test = require('node:test');
const assert = require('node:assert/strict');
const {
  startServer,
  stopServer,
  api,
  login,
  ensureTodayMenu,
  unique,
  prisma,
} = require('./helpers');

/** Fait avancer une commande jusqu'a SERVED, etape par etape (transitions imposees). */
async function serveOrder(token, orderId) {
  for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'SERVED']) {
    const result = await api(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      token,
      body: { status },
    });
    assert.equal(result.status, 200, `transition vers ${status} refusée`);
  }
}

test('Fidélité : attribution des points, récompense, ajustement', async (suite) => {
  await startServer();
  suite.after(() => stopServer());

  const admin = await login('admin@chemoiresto.ci', 'Admin@2026');
  const server = await login('marie@chemoiresto.ci', 'Serveuse@2026');
  const restaurantId = admin.user.restaurantId;

  await ensureTodayMenu(restaurantId);
  const table = await prisma.restaurantTable.findFirst({
    where: { restaurantId, status: 'ACTIVE' },
    orderBy: { number: 'asc' },
  });
  const menuResponse = await api(`/api/menu/table/${table.token}`);
  const menuItems = menuResponse.data.menu.items;
  const product = menuItems.find((item) => item.options.length === 0) || menuItems[0];

  const originalRestaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  const phone = unique('070');
  const createdOrderIds = [];

  suite.after(async () => {
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        loyaltyEnabled: originalRestaurant.loyaltyEnabled,
        loyaltyRewardThreshold: originalRestaurant.loyaltyRewardThreshold,
        loyaltyRewardLabel: originalRestaurant.loyaltyRewardLabel,
      },
    });
    const account = await prisma.loyaltyAccount.findUnique({
      where: { restaurantId_phone: { restaurantId, phone } },
    });
    if (account) {
      await prisma.loyaltyTransaction.deleteMany({ where: { loyaltyAccountId: account.id } });
      await prisma.loyaltyAccount.delete({ where: { id: account.id } });
    }
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  });

  await suite.test('activation de la fidélité, seuil à 2 commandes', async () => {
    const result = await api('/api/restaurant', {
      method: 'PUT',
      token: admin.token,
      body: { loyaltyEnabled: true, loyaltyRewardThreshold: 2, loyaltyRewardLabel: 'Un plat offert' },
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.loyaltyEnabled, true);
  });

  async function passerCommande() {
    const result = await api('/api/orders', {
      method: 'POST',
      body: {
        tableToken: table.token,
        customerName: 'Cliente fidèle',
        customerPhone: phone,
        items: [{ productId: product.productId, quantity: 1 }],
      },
    });
    assert.equal(result.status, 201);
    createdOrderIds.push(result.data.id);
    return result.data;
  }

  await suite.test('1ère commande servie : 1 point, pas encore de récompense', async () => {
    const order = await passerCommande();
    await serveOrder(server.token, order.id);

    const account = await prisma.loyaltyAccount.findUnique({
      where: { restaurantId_phone: { restaurantId, phone } },
    });
    assert.ok(account, 'un compte fidélité doit être créé au premier point');
    assert.equal(account.points, 1);
    assert.equal(account.rewardsAvailable, 0);
  });

  let accountId;

  await suite.test('2ᵉ commande servie : le seuil est franchi, une récompense est débloquée', async () => {
    const order = await passerCommande();
    await serveOrder(server.token, order.id);

    const account = await prisma.loyaltyAccount.findUnique({
      where: { restaurantId_phone: { restaurantId, phone } },
    });
    assert.equal(account.points, 2);
    assert.equal(account.rewardsAvailable, 1);
    accountId = account.id;
  });

  await suite.test('le suivi client affiche la fidélité une fois la commande servie', async () => {
    const order = await passerCommande();
    await serveOrder(server.token, order.id);

    const tracking = await api(`/api/orders/track/${order.trackingToken}`);
    assert.equal(tracking.data.loyalty.points, 3);
    assert.equal(tracking.data.loyalty.rewardsAvailable, 1);
  });

  await suite.test('GET /api/loyalty : le compte apparaît, recherche par téléphone', async () => {
    const result = await api(`/api/loyalty?search=${phone}`, { token: server.token });
    assert.equal(result.status, 200);
    assert.ok(result.data.accounts.some((a) => a.id === accountId));
  });

  await suite.test('GET /api/loyalty/:id : historique des transactions', async () => {
    const result = await api(`/api/loyalty/${accountId}`, { token: server.token });
    assert.equal(result.status, 200);
    assert.ok(result.data.transactions.some((t) => t.type === 'REWARD_GRANTED'));
  });

  await suite.test('redeem : la récompense est consommée', async () => {
    const result = await api(`/api/loyalty/${accountId}/redeem`, { method: 'POST', token: server.token });
    assert.equal(result.status, 200);
    assert.equal(result.data.rewardsAvailable, 0);
    assert.equal(result.data.rewardsRedeemed, 1);
  });

  await suite.test('redeem sans récompense disponible refusé (400)', async () => {
    const result = await api(`/api/loyalty/${accountId}/redeem`, { method: 'POST', token: server.token });
    assert.equal(result.status, 400);
  });

  await suite.test('ajustement manuel réservé à l\'administration (403 pour une serveuse)', async () => {
    const result = await api(`/api/loyalty/${accountId}/adjust`, {
      method: 'POST',
      token: server.token,
      body: { delta: 5, note: 'Test' },
    });
    assert.equal(result.status, 403);
  });

  await suite.test('ajustement manuel par l\'administration', async () => {
    const result = await api(`/api/loyalty/${accountId}/adjust`, {
      method: 'POST',
      token: admin.token,
      body: { delta: 5, note: 'Geste commercial' },
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.points, 8);
  });

  await suite.test('un ajustement qui rendrait le solde négatif est refusé (400)', async () => {
    const result = await api(`/api/loyalty/${accountId}/adjust`, {
      method: 'POST',
      token: admin.token,
      body: { delta: -100, note: 'Trop grand' },
    });
    assert.equal(result.status, 400);
  });

  await suite.test('commande sans téléphone : aucun compte créé', async () => {
    const result = await api('/api/orders', {
      method: 'POST',
      body: {
        tableToken: table.token,
        customerName: 'Anonyme',
        items: [{ productId: product.productId, quantity: 1 }],
      },
    });
    createdOrderIds.push(result.data.id);
    await serveOrder(server.token, result.data.id);

    const count = await prisma.loyaltyAccount.count({ where: { restaurantId, phone: '' } });
    assert.equal(count, 0);
  });
});
