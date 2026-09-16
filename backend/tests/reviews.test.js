const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login, ensureTodayMenu, prisma } = require('./helpers');

async function serveOrder(token, orderId) {
  for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'SERVED']) {
    const result = await api(`/api/orders/${orderId}/status`, { method: 'PUT', token, body: { status } });
    assert.equal(result.status, 200, `transition vers ${status} refusée`);
  }
}

test('Avis clients : dépôt, doublon, filtres', async (suite) => {
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

  const createdOrderIds = [];
  suite.after(async () => {
    await prisma.review.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  });

  async function passerCommande() {
    const result = await api('/api/orders', {
      method: 'POST',
      body: { tableToken: table.token, items: [{ productId: product.productId, quantity: 1 }] },
    });
    assert.equal(result.status, 201);
    createdOrderIds.push(result.data.id);
    return result.data;
  }

  let order;

  await suite.test('avis refusé avant que la commande soit servie (400)', async () => {
    order = await passerCommande();
    const result = await api('/api/reviews', {
      method: 'POST',
      body: { trackingToken: order.trackingToken, rating: 5 },
    });
    assert.equal(result.status, 400);
  });

  await suite.test('note hors 1-5 refusée (400)', async () => {
    await serveOrder(server.token, order.id);
    const result = await api('/api/reviews', {
      method: 'POST',
      body: { trackingToken: order.trackingToken, rating: 7 },
    });
    assert.equal(result.status, 400);
  });

  await suite.test('avis accepté une fois la commande servie', async () => {
    const result = await api('/api/reviews', {
      method: 'POST',
      body: { trackingToken: order.trackingToken, rating: 4, comment: 'Très bon accueil' },
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.rating, 4);
  });

  await suite.test('un deuxième avis sur la même commande est refusé (409)', async () => {
    const result = await api('/api/reviews', {
      method: 'POST',
      body: { trackingToken: order.trackingToken, rating: 5 },
    });
    assert.equal(result.status, 409);
  });

  await suite.test('le suivi client renvoie l\'avis déposé', async () => {
    const tracking = await api(`/api/orders/track/${order.trackingToken}`);
    assert.equal(tracking.data.review.rating, 4);
  });

  await suite.test('jeton de commande introuvable refusé (404)', async () => {
    const result = await api('/api/reviews', {
      method: 'POST',
      body: { trackingToken: 'a'.repeat(32), rating: 3 },
    });
    assert.equal(result.status, 404);
  });

  await suite.test('liste réservée au personnel (401 sans jeton)', async () => {
    const result = await api('/api/reviews');
    assert.equal(result.status, 401);
  });

  await suite.test('GET /api/reviews : filtre par note', async () => {
    const result = await api('/api/reviews?rating=4', { token: admin.token });
    assert.equal(result.status, 200);
    assert.ok(result.data.reviews.some((r) => r.order.id === order.id));
    assert.ok(result.data.reviews.every((r) => r.rating === 4));
  });
});
