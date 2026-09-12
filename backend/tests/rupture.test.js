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

test('Rupture de stock declaree en salle', async (suite) => {
  await startServer();

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

  // Un plat sans option obligatoire : la commande d'essai doit pouvoir passer
  // sans avoir a deviner les choix a fournir.
  const item = menu.items.find(
    (entry) => entry.product.isActive && !entry.product.options.some((option) => option.isRequired)
  );
  assert.ok(item, 'aucun plat sans option obligatoire dans le menu du jour');
  const produit = item.product;

  let socket = null;

  suite.after(async () => {
    if (socket) socket.disconnect();
    await prisma.product.update({ where: { id: produit.id }, data: { isAvailable: true } });
    await stopServer();
  });

  await suite.test('la serveuse declare la rupture elle-même', async () => {
    const result = await api(`/api/products/${produit.id}/availability`, {
      method: 'PATCH',
      token: serveuse.token,
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.isAvailable, false);
  });

  await suite.test('le plat en rupture ne peut plus être commande', async () => {
    const result = await api('/api/orders', {
      method: 'POST',
      body: {
        tableToken: table.token,
        items: [{ productId: produit.id, quantity: 1, optionValueIds: [] }],
      },
    });
    assert.equal(result.status, 400);
    assert.match(result.message, /indisponible/i);
  });

  await suite.test('le retour en stock est diffusé aux autres appareils', async () => {
    socket = await connectSocket(serveuse.token);
    const attendu = waitForEvent(socket, 'product_availability');

    const result = await api(`/api/products/${produit.id}/availability`, {
      method: 'PATCH',
      token: serveuse.token,
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.isAvailable, true);

    const evenement = await attendu;
    assert.equal(evenement.id, produit.id);
    assert.equal(evenement.isAvailable, true);
    assert.equal(evenement.name, produit.name);
  });

  await suite.test('le plat redevenu disponible se commande a nouveau', async () => {
    const result = await api('/api/orders', {
      method: 'POST',
      body: {
        tableToken: table.token,
        items: [{ productId: produit.id, quantity: 1, optionValueIds: [] }],
      },
    });
    assert.equal(result.status, 201);
  });
});
