const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login, unique, prisma } = require('./helpers');

test('Catalogue : produits, tables et QR Codes', async (suite) => {
  await startServer();
  suite.after(() => stopServer());

  const { token, user } = await login('admin@chemoiresto.ci', 'Admin@2026');
  const restaurantId = user.restaurantId;
  const created = { products: [], tables: [], categories: [] };

  suite.after(async () => {
    await prisma.product.deleteMany({ where: { id: { in: created.products } } });
    await prisma.restaurantTable.deleteMany({ where: { id: { in: created.tables } } });
    await prisma.category.deleteMany({ where: { id: { in: created.categories } } });
  });

  // ------------------------------ Catégories -----------------------------
  let categoryId;

  await suite.test('creation d\'une catégorie', async () => {
    const result = await api('/api/categories', {
      method: 'POST',
      token,
      body: { name: unique('Catégorie test') },
    });
    assert.equal(result.status, 201);
    assert.ok(result.data.slug, 'un slug doit être généré');
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
        description: 'Produit créé par les tests automatiques',
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
            name: 'Suppléments',
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

  await suite.test('prix negatif refusé (400)', async () => {
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
      body: { basePrice: 3500, description: 'Description mise à jour' },
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

  await suite.test('catégorie utilisée par un produit : suppression refusée (409)', async () => {
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
    assert.ok(result.data.token.match(/^[a-f0-9]{32}$/), 'le jeton doit être aleatoire');
    assert.ok(result.data.qrCode, 'un QR Code doit être généré automatiquement');
    assert.ok(
      result.data.qrCode.dataUrl.startsWith('data:image/png;base64,'),
      'le QR Code doit être une image PNG'
    );
    assert.ok(
      result.data.qrCode.url.includes(result.data.token),
      'l\'URL du QR Code doit contenir le jeton de la table'
    );

    tableId = result.data.id;
    tableToken = result.data.token;
    created.tables.push(tableId);
  });

  await suite.test('numéro de table en double refusé (409)', async () => {
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
    assert.notEqual(newToken, tableToken, 'un nouveau jeton doit être généré');

    const oldAccess = await api(`/api/menu/table/${tableToken}`);
    assert.equal(oldAccess.status, 404, 'l\'ancien QR Code ne doit plus fonctionner');

    const newAccess = await api(`/api/menu/table/${newToken}`);
    assert.equal(newAccess.success, true);

    tableToken = newToken;
  });

  await suite.test('table désactivée : le menu est bloque (403)', async () => {
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
    assert.equal(presentBefore, false, 'un produit neuf ne doit pas être au menu automatiquement');

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
    assert.equal(stillThere, false, 'le plat retire ne doit plus être propose');
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

  // ------------------------------- Réordonnancement -----------------------

  await suite.test('reorder des catégories', async () => {
    const autre = await api('/api/categories', {
      method: 'POST',
      token,
      body: { name: unique('Catégorie ordre') },
    });
    created.categories.push(autre.data.id);

    const result = await api('/api/categories/reorder', {
      method: 'PUT',
      token,
      body: {
        items: [
          { id: categoryId, sortOrder: 5 },
          { id: autre.data.id, sortOrder: 1 },
        ],
      },
    });
    assert.equal(result.status, 200);

    const [premiere, seconde] = await Promise.all([
      prisma.category.findUnique({ where: { id: categoryId } }),
      prisma.category.findUnique({ where: { id: autre.data.id } }),
    ]);
    assert.equal(premiere.sortOrder, 5);
    assert.equal(seconde.sortOrder, 1);
  });

  await suite.test('reorder refusé si une catégorie n\'appartient pas au restaurant (403)', async () => {
    const result = await api('/api/categories/reorder', {
      method: 'PUT',
      token,
      body: { items: [{ id: 99999999, sortOrder: 0 }] },
    });
    assert.equal(result.status, 403);
  });

  // ---------------- Suppression vs archivage : table et produit -----------
  // Meme besoin (« retirer ce qui a un historique »), deux comportements
  // différents et volontaires : une table refuse, un produit archive.

  await suite.test('une table sans historique se supprime vraiment', async () => {
    const cree = await api('/api/tables', { method: 'POST', token, body: { number: unique('S') } });
    const result = await api(`/api/tables/${cree.data.id}`, { method: 'DELETE', token });
    assert.equal(result.status, 200);

    const encore = await prisma.restaurantTable.findUnique({ where: { id: cree.data.id } });
    assert.equal(encore, null);
  });

  await suite.test('une table avec un historique de commandes refuse la suppression (409)', async () => {
    const cree = await api('/api/tables', { method: 'POST', token, body: { number: unique('H') } });
    created.tables.push(cree.data.id);

    const commande = await prisma.order.create({
      data: {
        restaurantId,
        tableId: cree.data.id,
        orderNumber: unique('cmd'),
        trackingToken: unique('t').replace(/-/g, '').slice(0, 32),
        status: 'SERVED',
        subtotal: 1000,
        total: 1000,
      },
    });

    const result = await api(`/api/tables/${cree.data.id}`, { method: 'DELETE', token });
    assert.equal(result.status, 409);

    await prisma.order.delete({ where: { id: commande.id } });
    const toujoursLa = await prisma.restaurantTable.findUnique({ where: { id: cree.data.id } });
    assert.ok(toujoursLa, 'la table doit toujours exister');
  });

  await suite.test('un produit sans historique se supprime vraiment', async () => {
    const cree = await api('/api/products', { method: 'POST', token, body: { name: unique('Plat seul'), basePrice: 1500 } });

    const result = await api(`/api/products/${cree.data.id}`, { method: 'DELETE', token });
    assert.equal(result.status, 200);

    const encore = await prisma.product.findUnique({ where: { id: cree.data.id } });
    assert.equal(encore, null);
  });

  await suite.test('un produit déjà commandé est archivé plutôt que supprimé', async () => {
    const cree = await api('/api/products', { method: 'POST', token, body: { name: unique('Plat commandé'), basePrice: 2500 } });
    created.products.push(cree.data.id);

    const commande = await prisma.order.create({
      data: {
        restaurantId,
        orderNumber: unique('cmd'),
        trackingToken: unique('t').replace(/-/g, '').slice(0, 32),
        status: 'SERVED',
        subtotal: 2500,
        total: 2500,
        items: {
          create: {
            productId: cree.data.id,
            productName: cree.data.name,
            unitPrice: 2500,
            quantity: 1,
            lineTotal: 2500,
          },
        },
      },
    });

    const result = await api(`/api/products/${cree.data.id}`, { method: 'DELETE', token });
    assert.equal(result.status, 200);
    assert.match(result.message, /archivé/);

    const archive = await prisma.product.findUnique({ where: { id: cree.data.id } });
    assert.ok(archive, 'le produit existe toujours');
    assert.equal(archive.isActive, false);

    await prisma.orderItem.deleteMany({ where: { orderId: commande.id } });
    await prisma.order.delete({ where: { id: commande.id } });
  });
});
