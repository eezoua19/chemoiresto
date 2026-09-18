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

test('Codes promo : validation, remise serveur, plafond, CRUD admin', async (suite) => {
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

  const createdPromoIds = [];
  const createdOrderIds = [];

  suite.after(async () => {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.promoCode.deleteMany({ where: { id: { in: createdPromoIds } } });
  });

  async function makePromo(overrides = {}) {
    const promoCode = await prisma.promoCode.create({
      data: {
        restaurantId,
        code: unique('PROMO').toUpperCase(),
        type: 'PERCENT',
        value: 10,
        ...overrides,
      },
    });
    createdPromoIds.push(promoCode.id);
    return promoCode;
  }

  async function passerCommande(body) {
    const result = await api('/api/orders', {
      method: 'POST',
      body: {
        tableToken: table.token,
        customerName: 'Client test',
        items: [{ productId: product.productId, quantity: 2 }],
        ...body,
      },
    });
    if (result.status === 201) createdOrderIds.push(result.data.id);
    return result;
  }

  await suite.test('apercu public : code pourcentage valide', async () => {
    const promo = await makePromo({ type: 'PERCENT', value: 10 });
    const result = await api('/api/menu/promo/validate', {
      method: 'POST',
      body: { token: table.token, code: promo.code, subtotal: 1000 },
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.valid, true);
    assert.equal(result.data.discountAmount, 100);
  });

  await suite.test('apercu public : code montant fixe, plafonne au sous-total', async () => {
    const promo = await makePromo({ type: 'FIXED', value: 5000 });
    const result = await api('/api/menu/promo/validate', {
      method: 'POST',
      body: { token: table.token, code: promo.code, subtotal: 1000 },
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.discountAmount, 1000);
  });

  await suite.test('code expiré rejeté', async () => {
    const promo = await makePromo({ expiresAt: new Date(Date.now() - 60000) });
    const result = await api('/api/menu/promo/validate', {
      method: 'POST',
      body: { token: table.token, code: promo.code, subtotal: 1000 },
    });
    assert.equal(result.status, 400);
    assert.match(result.message, /expiré/);
  });

  await suite.test('montant minimum non atteint rejeté', async () => {
    const promo = await makePromo({ minOrderAmount: 5000 });
    const result = await api('/api/menu/promo/validate', {
      method: 'POST',
      body: { token: table.token, code: promo.code, subtotal: 1000 },
    });
    assert.equal(result.status, 400);
    assert.match(result.message, /minimum/);
  });

  await suite.test('code inconnu rejeté', async () => {
    const result = await api('/api/menu/promo/validate', {
      method: 'POST',
      body: { token: table.token, code: 'INCONNU-XYZ', subtotal: 1000 },
    });
    assert.equal(result.status, 400);
    assert.match(result.message, /invalide/);
  });

  await suite.test('commande : la remise et le total sont recalcules par le serveur', async () => {
    const promo = await makePromo({ type: 'PERCENT', value: 20 });
    const result = await passerCommande({
      promoCode: promo.code,
      // Le client tente d'envoyer sa propre remise/total : doit être ignoré.
      discountAmount: 999999,
      total: 1,
    });
    assert.equal(result.status, 201);
    const expectedDiscount = Math.round(result.data.subtotal * 0.2 * 100) / 100;
    assert.equal(result.data.discountAmount, expectedDiscount);
    assert.equal(result.data.total, Math.round((result.data.subtotal - expectedDiscount) * 100) / 100);

    const dbOrder = await prisma.order.findUnique({ where: { id: result.data.id } });
    assert.equal(Number(dbOrder.discountAmount), expectedDiscount);
    assert.equal(Number(dbOrder.total), result.data.total);
    assert.equal(dbOrder.promoCodeId, promo.id);
  });

  await suite.test('plafond d\'utilisation : la commande echoue et aucune commande n\'est creee (course)', async () => {
    const promo = await makePromo({ maxUses: 1, usesCount: 1 });
    const before = await prisma.order.count({ where: { restaurantId } });
    const result = await passerCommande({ promoCode: promo.code });
    assert.equal(result.status, 400);
    assert.match(result.message, /limite/);
    const after = await prisma.order.count({ where: { restaurantId } });
    assert.equal(after, before, 'aucune commande ne doit avoir ete creee');
  });

  await suite.test('code invalide a la commande : rejeté, aucune commande créée', async () => {
    const before = await prisma.order.count({ where: { restaurantId } });
    const result = await passerCommande({ promoCode: 'NIMPORTEQUOI' });
    assert.equal(result.status, 400);
    const after = await prisma.order.count({ where: { restaurantId } });
    assert.equal(after, before);
  });

  // ---- CRUD admin ---------------------------------------------------------

  await suite.test('CRUD admin réservé (403 pour une serveuse)', async () => {
    const result = await api('/api/promo-codes', { token: server.token });
    assert.equal(result.status, 403);
  });

  let created;
  await suite.test('création par un admin', async () => {
    const result = await api('/api/promo-codes', {
      method: 'POST',
      token: admin.token,
      body: { code: unique('ADMPROMO'), type: 'PERCENT', value: 15 },
    });
    assert.equal(result.status, 201);
    created = result.data;
    createdPromoIds.push(created.id);
  });

  await suite.test('code dupliqué refusé (409)', async () => {
    const result = await api('/api/promo-codes', {
      method: 'POST',
      token: admin.token,
      body: { code: created.code, type: 'PERCENT', value: 5 },
    });
    assert.equal(result.status, 409);
  });

  await suite.test('pourcentage > 100 refusé', async () => {
    const result = await api('/api/promo-codes', {
      method: 'POST',
      token: admin.token,
      body: { code: unique('BADPCT'), type: 'PERCENT', value: 150 },
    });
    assert.equal(result.status, 400);
  });

  await suite.test('mise à jour par un admin', async () => {
    const result = await api(`/api/promo-codes/${created.id}`, {
      method: 'PUT',
      token: admin.token,
      body: { value: 25 },
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.value, 25);
  });

  await suite.test('suppression sans utilisation : suppression réelle', async () => {
    const result = await api(`/api/promo-codes/${created.id}`, {
      method: 'DELETE',
      token: admin.token,
    });
    assert.equal(result.status, 200);
    const stillExists = await prisma.promoCode.findUnique({ where: { id: created.id } });
    assert.equal(stillExists, null);
    createdPromoIds.splice(createdPromoIds.indexOf(created.id), 1);
  });

  await suite.test('suppression après utilisation : désactivation au lieu de suppression', async () => {
    const promo = await makePromo({ usesCount: 1 });
    const result = await api(`/api/promo-codes/${promo.id}`, {
      method: 'DELETE',
      token: admin.token,
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.isActive, false);
    const stillExists = await prisma.promoCode.findUnique({ where: { id: promo.id } });
    assert.ok(stillExists, 'le code doit toujours exister en base');
    assert.equal(stillExists.isActive, false);
  });
});
