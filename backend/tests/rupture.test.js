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
  let notificationRuptureId = null;

  // Le produit est un plat du seed, reutilise d'une execution a l'autre : les
  // notifications de rupture d'une execution precedente doivent disparaitre
  // avant de compter quoi que ce soit ici.
  await prisma.notification.deleteMany({
    where: { restaurantId: restaurant.id, type: 'SYSTEM', title: { contains: produit.name } },
  });

  suite.after(async () => {
    if (socket) socket.disconnect();
    await prisma.product.update({ where: { id: produit.id }, data: { isAvailable: true } });
    await prisma.notification.deleteMany({
      where: { restaurantId: restaurant.id, type: 'SYSTEM', title: { contains: produit.name } },
    });
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

  await suite.test(
    "une notification persistante (visible meme app fermee, via le push) est créée pour la rupture",
    async () => {
      const notification = await prisma.notification.findFirst({
        where: { restaurantId: restaurant.id, type: 'SYSTEM', title: { contains: produit.name } },
        orderBy: { createdAt: 'desc' },
      });
      assert.ok(notification, 'aucune notification de rupture enregistrée');
      assert.match(notification.body, /Marie/);
      notificationRuptureId = notification.id;
    }
  );

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

    // Le retour en stock n'a pas l'urgence d'une rupture : rien a pousser sur
    // les téléphones, la seule notification doit rester celle de la rupture.
    const derniere = await prisma.notification.findFirst({
      where: { restaurantId: restaurant.id, type: 'SYSTEM', title: { contains: produit.name } },
      orderBy: { createdAt: 'desc' },
    });
    assert.equal(derniere.id, notificationRuptureId);
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
