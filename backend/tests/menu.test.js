const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login, prisma } = require('./helpers');

/** Dates volontairement lointaines pour ne pas perturber les donnees reelles. */
const DAY_1 = '2029-03-10';
const DAY_2 = '2029-03-11';
const DAY_EMPTY = '2029-03-12';

test('Menus quotidiens : programmation, prix du jour et copie', async (suite) => {
  await startServer();
  suite.after(() => stopServer());

  const { token, user } = await login('admin@chemoiresto.ci', 'Admin@2026');

  const products = await prisma.product.findMany({
    where: { restaurantId: user.restaurantId, isActive: true },
    take: 3,
  });
  assert.ok(products.length >= 2, 'le seed doit avoir cree des produits');

  /**
   * Nettoie les menus de test avant et apres.
   * Passe directement par Prisma : le nettoyage final s'execute apres l'arret
   * du serveur HTTP, l'API n'est donc plus joignable a ce moment-la.
   */
  const cleanup = async () => {
    await prisma.dailyMenu.deleteMany({
      where: {
        restaurantId: user.restaurantId,
        date: { in: [DAY_1, DAY_2, DAY_EMPTY].map((date) => new Date(`${date}T00:00:00.000Z`)) },
      },
    });
  };

  await cleanup();
  suite.after(cleanup);

  let menuId;

  await suite.test('creation du menu du 10/03/2029 avec un prix du jour', async () => {
    const result = await api('/api/menus', {
      method: 'POST',
      token,
      body: {
        date: DAY_1,
        title: 'Menu de test',
        items: [
          { productId: products[0].id, price: 4500, isDishOfDay: true },
          { productId: products[1].id },
        ],
      },
    });

    assert.equal(result.status, 201);
    assert.equal(result.data.date, DAY_1);
    assert.equal(result.data.items.length, 2);

    const withSpecialPrice = result.data.items.find((item) => item.productId === products[0].id);
    assert.equal(withSpecialPrice.price, 4500, 'le prix du jour doit etre enregistre');
    assert.equal(withSpecialPrice.isDishOfDay, true);

    const withoutPrice = result.data.items.find((item) => item.productId === products[1].id);
    assert.equal(withoutPrice.price, null, 'sans prix du jour, le prix de base s\'applique');

    menuId = result.data.id;
  });

  await suite.test('deux menus pour la meme date sont impossibles (409)', async () => {
    const result = await api('/api/menus', {
      method: 'POST',
      token,
      body: { date: DAY_1, items: [] },
    });
    assert.equal(result.status, 409);
  });

  await suite.test('recuperation du menu par sa date', async () => {
    const result = await api(`/api/menus/date/${DAY_1}`, { token });
    assert.equal(result.success, true);
    assert.equal(result.data.menu.id, menuId);
    assert.equal(result.data.menu.items.length, 2);
  });

  await suite.test('une date sans menu renvoie null avec un message clair', async () => {
    const result = await api(`/api/menus/date/${DAY_EMPTY}`, { token });
    assert.equal(result.success, true);
    assert.equal(result.data.menu, null);
    assert.match(result.message, /Aucun menu/i);
  });

  await suite.test('copie du menu vers le 11/03/2029', async () => {
    const result = await api(`/api/menus/${menuId}/duplicate`, {
      method: 'POST',
      token,
      body: { targetDate: DAY_2 },
    });

    assert.equal(result.status, 201);
    assert.equal(result.data.date, DAY_2);
    assert.equal(result.data.items.length, 2, 'les produits doivent etre copies');

    const copiedPrice = result.data.items.find((item) => item.productId === products[0].id);
    assert.equal(copiedPrice.price, 4500, 'le prix du jour doit etre copie');
    assert.equal(copiedPrice.isDishOfDay, true, 'le plat du jour doit etre copie');
  });

  await suite.test('le menu source reste inchange apres la copie', async () => {
    const source = await api(`/api/menus/date/${DAY_1}`, { token });
    assert.equal(source.data.menu.items.length, 2);
    assert.equal(source.data.menu.title, 'Menu de test');
  });

  await suite.test('copier sur une date deja occupee est refuse sans "overwrite" (409)', async () => {
    const result = await api(`/api/menus/${menuId}/duplicate`, {
      method: 'POST',
      token,
      body: { targetDate: DAY_2 },
    });
    assert.equal(result.status, 409);
  });

  await suite.test('copier avec "overwrite" remplace le menu de destination', async () => {
    const result = await api(`/api/menus/${menuId}/duplicate`, {
      method: 'POST',
      token,
      body: { targetDate: DAY_2, overwrite: true },
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.items.length, 2);
  });

  await suite.test('modification : la liste des produits est remplacee', async () => {
    const result = await api(`/api/menus/${menuId}`, {
      method: 'PUT',
      token,
      body: {
        title: 'Menu modifie',
        items: [{ productId: products[1].id, price: 2000 }],
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data.title, 'Menu modifie');
    assert.equal(result.data.items.length, 1);
    assert.equal(result.data.items[0].productId, products[1].id);
  });

  await suite.test('le calendrier liste les menus du mois', async () => {
    const result = await api('/api/menus?month=2029-03', { token });
    assert.equal(result.success, true);

    const dates = result.data.menus.map((menu) => menu.date);
    assert.ok(dates.includes(DAY_1));
    assert.ok(dates.includes(DAY_2));
    assert.ok(!dates.includes(DAY_EMPTY));
  });

  await suite.test('copier vers la meme date est refuse (400)', async () => {
    const result = await api(`/api/menus/${menuId}/duplicate`, {
      method: 'POST',
      token,
      body: { targetDate: DAY_1 },
    });
    assert.equal(result.status, 400);
  });

  await suite.test('format de date invalide refuse (400)', async () => {
    const result = await api('/api/menus', {
      method: 'POST',
      token,
      body: { date: '10-03-2029', items: [] },
    });
    assert.equal(result.status, 400);
  });

  await suite.test('suppression du menu', async () => {
    const result = await api(`/api/menus/${menuId}`, { method: 'DELETE', token });
    assert.equal(result.success, true);

    const after = await api(`/api/menus/date/${DAY_1}`, { token });
    assert.equal(after.data.menu, null);
  });
});
