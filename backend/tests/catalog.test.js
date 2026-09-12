const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login, unique, prisma } = require('./helpers');

test('Catalogue : produits, tables et QR Codes', async (suite) => {
  await startServer();
  suite.after(() => stopServer());

  const { token } = await login('admin@chemoiresto.ci', 'Admin@2026');
  const created = { products: [], tables: [], categories: [] };

  suite.after(async () => {
    await prisma.product.deleteMany({ where: { id: { in: created.products } } });
    await prisma.restaurantTable.deleteMany({ where: { id: { in: created.tables } } });
    await prisma.category.deleteMany({ where: { id: { in: created.categories } } });
  });

  // ------------------------------ Categories -----------------------------
  let categoryId;

  await suite.test('creation d\'une categorie', async () => {
    const result = await api('/api/categories', {
      method: 'POST',
      token,
      body: { name: unique('Categorie test') },
    });
    assert.equal(result.status, 201);
    assert.ok(result.data.slug, 'un slug doit etre genere');
    categoryId = result.data.id;
    created.categories.push(categoryId);
  });

  // ------------------------------- Produits ------------------------------
  let productId;

  await suite.test('creation d\'un produit avec options', async () => {
    const result = await api('/api/products', {
      method: 'POST',
      token,
      body: {
        name: unique('Produit test'),
        description: 'Produit cree par les tests automatiques',
        basePrice: 3000,
        categoryId,
        options: [
          {
            name: 'Cuisson',
            type: 'SINGLE',
            isRequired: true,
            values: [
              { name: 'Saignant', priceDelta: 0 },
              { name: 'A point', priceDelta: 0 },
            ],
          },
          {
            name: 'Supplements',
            type: 'MULTIPLE',
            isRequired: false,
            values: [{ name: 'Fromage', priceDelta: 500 }],
          },
        ],
      },
    });

    assert.equal(result.status, 201);
    assert.equal(result.data.basePrice, 3000);
    assert.equal(result.data.options.length, 2);
    assert.equal(result.data.options[0].values.length, 2);
    assert.equal(result.data.options[1].values[0].priceDelta, 500);

    productId = result.data.id;
    created.products.push(productId);
  });

  await suite.test('prix negatif refuse (400)', async () => {
    const result = await api('/api/products', {
      method: 'POST',
      token,
      body: { name: 'Produit invalide', basePrice: -100 },
    });
    assert.equal(result.status, 400);
  });

  await suite.test('modification du produit', async () => {
    const result = await api(`/api/products/${productId}`, {
      method: 'PUT',
      token,
      body: { basePrice: 3500, description: 'Description mise a jour' },
    });
    assert.equal(result.success, true);
    assert.equal(result.data.basePrice, 3500);
  });

  await suite.test('bascule de disponibilite', async () => {
    const first = await api(`/api/products/${productId}/availability`, { method: 'PATCH', token });
    assert.equal(first.data.isAvailable, false);

    const second = await api(`/api/products/${productId}/availability`, { method: 'PATCH', token });
    assert.equal(second.data.isAvailable, true);
  });

  await suite.test('categorie utilisee par un produit : suppression refusee (409)', async () => {
    const result = await api(`/api/categories/${categoryId}`, { method: 'DELETE', token });
    assert.equal(result.status, 409);
  });

  // -------------------------------- Tables -------------------------------
  let tableId;
  let tableToken;

  await suite.test('creation d\'une table avec generation du QR Code', async () => {
    const result = await api('/api/tables', {
      method: 'POST',
      token,
      body: { number: unique('T'), label: 'Table de test', capacity: 4 },
    });

    assert.equal(result.status, 201);
    assert.ok(result.data.token.match(/^[a-f0-9]{32}$/), 'le jeton doit etre aleatoire');
    assert.ok(result.data.qrCode, 'un QR Code doit etre genere automatiquement');
    assert.ok(
      result.data.qrCode.dataUrl.startsWith('data:image/png;base64,'),
      'le QR Code doit etre une image PNG'
    );
    assert.ok(
      result.data.qrCode.url.includes(result.data.token),
      'l\'URL du QR Code doit contenir le jeton de la table'
    );

    tableId = result.data.id;
    tableToken = result.data.token;
    created.tables.push(tableId);
  });

  await suite.test('numero de table en double refuse (409)', async () => {
    const table = await prisma.restaurantTable.findUnique({ where: { id: tableId } });
    const result = await api('/api/tables', {
      method: 'POST',
      token,
      body: { number: table.number },
    });
    assert.equal(result.status, 409);
  });

  await suite.test('le menu est accessible publiquement via le jeton de la table', async () => {
    const result = await api(`/api/menu/table/${tableToken}`);
    assert.equal(result.success, true);
    assert.equal(result.data.table.token, tableToken);
    assert.ok(result.data.restaurant.name);
  });

  await suite.test('jeton de table inconnu renvoie 404', async () => {
    const result = await api('/api/menu/table/00000000000000000000000000000000');
    assert.equal(result.status, 404);
  });

  await suite.test('regeneration du QR Code : l\'ancien jeton devient invalide', async () => {
    const result = await api(`/api/tables/${tableId}/qrcode/regenerate`, { method: 'POST', token });
    assert.equal(result.success, true);

    const newToken = result.data.table.token;
    assert.notEqual(newToken, tableToken, 'un nouveau jeton doit etre genere');

    const oldAccess = await api(`/api/menu/table/${tableToken}`);
    assert.equal(oldAccess.status, 404, 'l\'ancien QR Code ne doit plus fonctionner');

    const newAccess = await api(`/api/menu/table/${newToken}`);
    assert.equal(newAccess.success, true);

    tableToken = newToken;
  });

  await suite.test('table desactivee : le menu est bloque (403)', async () => {
    await api(`/api/tables/${tableId}/status`, { method: 'PATCH', token });

    const result = await api(`/api/menu/table/${tableToken}`);
    assert.equal(result.status, 403);

    await api(`/api/tables/${tableId}/status`, { method: 'PATCH', token });
  });

  // -------------------- Mise au menu du jour en un clic -------------------
  await suite.test('un nouveau plat devient commandable via le menu du jour', async () => {
    const activeTable = await prisma.restaurantTable.findFirst({
      where: { restaurantId: (await prisma.product.findUnique({ where: { id: productId } })).restaurantId, status: 'ACTIVE' },
      orderBy: { number: 'asc' },
    });

    // Avant : le plat existe au catalogue mais n'est pas propose au client
    const before = await api(`/api/menu/table/${activeTable.token}`);
    const presentBefore = (before.data.menu?.items || []).some((item) => item.productId === productId);
    assert.equal(presentBefore, false, 'un produit neuf ne doit pas etre au menu automatiquement');

    // Mise au menu du jour
    const added = await api('/api/menus/today/products', {
      method: 'POST',
      token,
      body: { productId },
    });
    assert.equal(added.success, true);
    assert.ok(added.data.items.some((item) => item.productId === productId));

    // Apres : le client le voit et peut le commander
    const after = await api(`/api/menu/table/${activeTable.token}`);
    const item = after.data.menu.items.find((entry) => entry.productId === productId);
    assert.ok(item, 'le plat doit apparaitre dans le menu du client');

    const order = await api('/api/orders', {
      method: 'POST',
      body: {
        tableToken: activeTable.token,
        items: [
          {
            productId,
            quantity: 1,
            optionValueIds: [item.options[0].values[0].id],
          },
        ],
      },
    });
    assert.equal(order.status, 201, order.message);
    await prisma.order.delete({ where: { id: order.data.id } });

    // Retrait du menu du jour
    const removed = await api(`/api/menus/today/products/${productId}`, { method: 'DELETE', token });
    assert.equal(removed.success, true);

    const final = await api(`/api/menu/table/${activeTable.token}`);
    const stillThere = (final.data.menu?.items || []).some((entry) => entry.productId === productId);
    assert.equal(stillThere, false, 'le plat retire ne doit plus etre propose');
  });

  await suite.test('mettre au menu du jour un produit inexistant renvoie 404', async () => {
    const result = await api('/api/menus/today/products', {
      method: 'POST',
      token,
      body: { productId: 999999 },
    });
    assert.equal(result.status, 404);
  });

  await suite.test('une serveuse ne peut pas modifier le menu du jour (403)', async () => {
    const serveuse = await login('marie@chemoiresto.ci', 'Serveuse@2026');
    const result = await api('/api/menus/today/products', {
      method: 'POST',
      token: serveuse.token,
      body: { productId },
    });
    assert.equal(result.status, 403);
  });

  await suite.test('la liste des QR Codes est complete pour l\'impression', async () => {
    const result = await api('/api/tables/qrcodes/all', { token });
    assert.equal(result.success, true);
    assert.ok(result.data.tables.length > 0);
    assert.ok(result.data.tables.every((table) => table.dataUrl.startsWith('data:image/png')));
  });
});
