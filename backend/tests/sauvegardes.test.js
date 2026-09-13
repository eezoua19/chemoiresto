const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login, unique, prisma } = require('./helpers');
const { rattraper } = require('../src/services/closing.service');

/** "AAAA-MM-JJ" a partir d'un decalage en jours. */
function jour(decalage) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
}

test('Sauvegardes automatiques et clôtures de journée', async (suite) => {
  await startServer();

  const admin = await login('admin@chemoiresto.ci', 'Admin@2026');
  const serveuse = await login('marie@chemoiresto.ci', 'Serveuse@2026');
  const restaurantId = admin.user.restaurantId;

  const marque = unique('Cloture');
  // Une journee ancienne et deserte : aucune vraie commande ne s'y trouve, les
  // chiffres attendus sont donc connus a l'avance.
  const jourTest = jour(-400);
  const cree = { commandes: [], produits: [], sauvegardes: [] };

  suite.after(async () => {
    await prisma.orderItem.deleteMany({ where: { orderId: { in: cree.commandes } } });
    await prisma.order.deleteMany({ where: { id: { in: cree.commandes } } });
    await prisma.product.deleteMany({ where: { id: { in: cree.produits } } });
    await prisma.dailyClosing.deleteMany({
      where: { restaurantId, date: new Date(`${jourTest}T00:00:00.000Z`) },
    });
    await prisma.backupSnapshot.deleteMany({ where: { id: { in: cree.sauvegardes } } });
    await stopServer();
  });

  // ------------------------------------------------------------------ acces

  await suite.test('une serveuse n\'accède ni aux sauvegardes ni aux recettes', async () => {
    assert.equal((await api('/api/backup/list', { token: serveuse.token })).status, 403);
    assert.equal((await api('/api/backup', { method: 'POST', token: serveuse.token })).status, 403);
    assert.equal((await api('/api/closings', { token: serveuse.token })).status, 403);
    assert.equal((await api('/api/closings/today', { token: serveuse.token })).status, 403);
  });

  // ------------------------------------------------------------ sauvegardes

  let sauvegardeId = null;

  await suite.test('une sauvegarde manuelle enregistre un instantané complet', async () => {
    const result = await api('/api/backup', { method: 'POST', token: admin.token });

    assert.equal(result.status, 200);
    assert.equal(result.data.trigger, 'MANUEL');
    assert.ok(result.data.sizeBytes > 0, 'la sauvegarde a une taille');
    assert.ok(result.data.downloadable, 'elle peut être retéléchargée');
    assert.ok(result.data.counts.products >= 0, 'le détail par table est présent');
    sauvegardeId = result.data.id;
    cree.sauvegardes.push(sauvegardeId);
  });

  await suite.test('la sauvegarde se retrouve dans la liste', async () => {
    const result = await api('/api/backup/list', { token: admin.token });

    assert.equal(result.status, 200);
    assert.ok(result.data.snapshots.some((s) => s.id === sauvegardeId));
    assert.equal(result.data.last.id, sauvegardeId, 'la plus récente est en tête');
    assert.equal(result.data.hoursSinceLast, 0);
    assert.equal(result.data.kept, 14);
  });

  await suite.test('elle se retélécharge et contient bien les données', async () => {
    const result = await api(`/api/backup/${sauvegardeId}/download`, { token: admin.token });

    assert.equal(result.status, 200);
    assert.equal(result.metadonnees.motsDePasseExclus, true);
    assert.ok(Array.isArray(result.donnees.products));
    assert.ok(Array.isArray(result.donnees.subscriptions), 'les abonnements sont inclus');
    assert.ok(Array.isArray(result.donnees.auditLogs), 'le journal est inclus');
    // La garantie qui compte : aucun mot de passe ne circule.
    assert.ok(result.donnees.users.every((u) => u.password === undefined));
  });

  await suite.test('une sauvegarde inexistante répond 404', async () => {
    const result = await api('/api/backup/99999999/download', { token: admin.token });
    assert.equal(result.status, 404);
  });

  // ------------------------------------------------------------- clôtures

  await suite.test('une journée sans service se clôture à zéro', async () => {
    const result = await api(`/api/closings/${jourTest}`, { method: 'POST', token: admin.token });

    assert.equal(result.status, 200);
    assert.equal(result.data.revenue, 0);
    assert.equal(result.data.ordersCount, 0);
    assert.equal(result.data.closed, true);
  });

  await suite.test('les commandes de la journée alimentent la clôture', async () => {
    const produit = await prisma.product.create({
      data: { restaurantId, name: `${marque} attiéké`, basePrice: 2000 },
    });
    cree.produits.push(produit.id);

    const quand = new Date(`${jourTest}T12:30:00.000Z`);

    // Deux commandes servies + une annulee : seules les deux premieres comptent
    // dans la recette, l'annulee est comptee a part.
    for (const [index, montant] of [3000, 5000].entries()) {
      // eslint-disable-next-line no-await-in-loop
      const commande = await prisma.order.create({
        data: {
          restaurantId,
          orderNumber: `${marque}-${index}`,
          trackingToken: unique('t').replace(/-/g, '').slice(0, 32),
          status: 'SERVED',
          subtotal: montant,
          total: montant,
          createdAt: quand,
          serverId: serveuse.user.id,
          items: {
            create: {
              productId: produit.id,
              productName: produit.name,
              unitPrice: montant,
              quantity: 1,
              lineTotal: montant,
            },
          },
        },
      });
      cree.commandes.push(commande.id);
    }

    const annulee = await prisma.order.create({
      data: {
        restaurantId,
        orderNumber: `${marque}-annulee`,
        trackingToken: unique('x').replace(/-/g, '').slice(0, 32),
        status: 'CANCELLED',
        subtotal: 9000,
        total: 9000,
        createdAt: quand,
      },
    });
    cree.commandes.push(annulee.id);

    const result = await api(`/api/closings/${jourTest}`, { method: 'POST', token: admin.token });

    assert.equal(result.data.revenue, 8000, 'la recette ignore la commande annulée');
    assert.equal(result.data.ordersCount, 2);
    assert.equal(result.data.cancelledCount, 1);
    assert.equal(result.data.averageTicket, 4000);
    assert.equal(result.data.dineInRevenue, 8000);
    assert.equal(result.data.takeawayRevenue, 0);
    assert.equal(result.data.peakHour, 12);

    const plat = result.data.topProducts.find((p) => p.name === produit.name);
    assert.ok(plat, 'le plat vendu apparaît');
    assert.equal(plat.quantity, 2);

    const servie = result.data.servers.find((s) => s.id === serveuse.user.id);
    assert.equal(servie.orders, 2, 'la serveuse est créditée de ses commandes');
  });

  await suite.test('une journée clôturée se relit telle quelle', async () => {
    const result = await api(`/api/closings/${jourTest}`, { token: admin.token });

    assert.equal(result.status, 200);
    assert.equal(result.data.closed, true, 'la journée est figée');
    assert.equal(result.data.revenue, 8000);
    assert.ok(result.data.closedAt);
  });

  await suite.test('la journée apparaît dans la liste, avec le cumul', async () => {
    const result = await api(`/api/closings?from=${jourTest}&to=${jourTest}`, {
      token: admin.token,
    });

    assert.equal(result.data.closings.length, 1);
    assert.equal(result.data.closings[0].date, jourTest);
    assert.equal(result.data.totals.revenue, 8000);
    assert.equal(result.data.totals.orders, 2);
    assert.equal(result.data.totals.days, 1);
  });

  await suite.test('la journée en cours se lit sans être figée', async () => {
    const result = await api('/api/closings/today', { token: admin.token });

    assert.equal(result.status, 200);
    assert.equal(result.data.closed, false, 'aujourd\'hui n\'est jamais figé');
    assert.equal(result.data.date, jour(0));
    assert.ok(typeof result.data.revenue === 'number');
  });

  await suite.test('une journée jamais clôturée est calculée, pas refusée', async () => {
    // Le rattrapage d'une execution precedente a pu figer cette journee : on
    // repart d'une journee reellement ouverte, sinon le test depend de l'ordre
    // dans lequel la suite a ete lancee.
    await prisma.dailyClosing.deleteMany({
      where: { restaurantId, date: new Date(`${jour(-399)}T00:00:00.000Z`) },
    });

    const result = await api(`/api/closings/${jour(-399)}`, { token: admin.token });

    assert.equal(result.status, 200);
    assert.equal(result.data.closed, false);
    assert.equal(result.data.revenue, 0);
  });

  await suite.test('on ne clôture pas une journée à venir', async () => {
    const result = await api(`/api/closings/${jour(3)}`, { method: 'POST', token: admin.token });
    assert.equal(result.status, 400);
  });

  await suite.test('une date invalide est refusée', async () => {
    const result = await api('/api/closings/hier', { token: admin.token });
    assert.equal(result.status, 400);
  });

  await suite.test('le rattrapage ne fabrique jamais la journée en cours', async () => {
    await rattraper(restaurantId);

    const aujourdhui = await prisma.dailyClosing.findFirst({
      where: { restaurantId, date: new Date(`${jour(0)}T00:00:00.000Z`) },
    });
    assert.equal(aujourdhui, null, 'la journée en cours reste ouverte');
  });
});
