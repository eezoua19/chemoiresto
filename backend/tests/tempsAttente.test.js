const test = require('node:test');
const assert = require('node:assert/strict');
const {
  startServer,
  stopServer,
  api,
  login,
  connectSocket,
  waitForEvent,
  unique,
  prisma,
} = require('./helpers');

/**
 * Temps d'attente annoncé au client.
 *
 * C'est la serveuse qui le pose — elle voit la cuisine, une moyenne calculée
 * ne la voit pas. Le client doit le recevoir en direct, sans recharger.
 */
test("Temps d'attente annoncé", async (suite) => {
  await startServer();

  const admin = await login('admin@chemoiresto.ci', 'Admin@2026');
  const serveuse = await login('marie@chemoiresto.ci', 'Serveuse@2026');

  let table = null;
  let produit = null;
  let commande = null;
  const sockets = [];

  suite.after(async () => {
    sockets.forEach((socket) => socket.close());
    if (commande) {
      await prisma.orderItem.deleteMany({ where: { orderId: commande.id } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: commande.id } });
      await prisma.order.delete({ where: { id: commande.id } }).catch(() => {});
    }
    if (produit) {
      await prisma.dailyMenuItem.deleteMany({ where: { productId: produit.id } });
      await prisma.product.delete({ where: { id: produit.id } }).catch(() => {});
    }
    if (table) await prisma.restaurantTable.delete({ where: { id: table.id } }).catch(() => {});
    await stopServer();
  });

  await suite.test('mise en place', async () => {
    const creee = await api('/api/tables', {
      method: 'POST',
      token: admin.token,
      body: { number: `A${Date.now().toString().slice(-6)}`, label: 'Table attente' },
    });
    table = creee.data;

    produit = await prisma.product.create({
      data: { restaurantId: admin.user.restaurantId, name: `Attente ${Date.now()}`, basePrice: 2000 },
    });
    await api('/api/menus/today/products', {
      method: 'POST',
      token: admin.token,
      body: { productId: produit.id },
    });

    const passee = await api('/api/orders', {
      method: 'POST',
      body: { tableToken: table.token, items: [{ productId: produit.id, quantity: 1 }] },
    });
    assert.equal(passee.status, 201, `commande refusée : ${passee.message}`);
    commande = passee.data;

    // Rien n'est annoncé tant que personne n'a rien dit.
    assert.equal(commande.estimatedMinutes, null);
    assert.equal(commande.estimatedReadyAt, null);
  });

  await suite.test('la serveuse annonce un temps, le client le reçoit en direct', async () => {
    // On attend la connexion avant de s'inscrire : ce test porte sur
    // l'annonce, pas sur la course au demarrage - celle-ci a son propre test
    // dans suiviClient.test.js.
    const socketClient = await connectSocket(null);
    sockets.push(socketClient);
    socketClient.emit('track_order', commande.trackingToken);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const attendu = waitForEvent(socketClient, 'order_status');

    const avant = Date.now();
    const result = await api(`/api/orders/${commande.id}/estimate`, {
      method: 'PATCH',
      token: serveuse.token,
      body: { minutes: 20 },
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.estimatedMinutes, 20);
    assert.match(result.message, /20 min/);

    // L'heure d'arrivee prevue est enregistree, pas seulement la duree : c'est
    // elle qui rend le compte a rebours juste apres un rechargement de page.
    const prevu = new Date(result.data.estimatedReadyAt).getTime();
    const ecart = prevu - (avant + 20 * 60000);
    assert.ok(Math.abs(ecart) < 5000, `heure prévue cohérente (écart ${ecart} ms)`);

    const evenement = await attendu;
    assert.equal(evenement.estimatedMinutes, 20, 'le client voit l\'annonce sans recharger');
    assert.ok(evenement.estimatedReadyAt);
  });

  await suite.test('le client retrouve l\'annonce en rechargeant', async () => {
    const suivi = await api(`/api/orders/track/${commande.trackingToken}`);
    assert.equal(suivi.data.estimatedMinutes, 20);
    assert.ok(suivi.data.estimatedReadyAt);
  });

  await suite.test('rallonger remplace l\'annonce précédente', async () => {
    const result = await api(`/api/orders/${commande.id}/estimate`, {
      method: 'PATCH',
      token: serveuse.token,
      body: { minutes: 30 },
    });
    assert.equal(result.data.estimatedMinutes, 30);
  });

  await suite.test('zéro retire l\'annonce au lieu de promettre « tout de suite »', async () => {
    const result = await api(`/api/orders/${commande.id}/estimate`, {
      method: 'PATCH',
      token: serveuse.token,
      body: { minutes: 0 },
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.estimatedMinutes, null);
    assert.equal(result.data.estimatedReadyAt, null);
    assert.match(result.message, /retiré/);
  });

  await suite.test('un temps déraisonnable est refusé', async () => {
    for (const minutes of [-5, 600]) {
      // eslint-disable-next-line no-await-in-loop
      const result = await api(`/api/orders/${commande.id}/estimate`, {
        method: 'PATCH',
        token: serveuse.token,
        body: { minutes },
      });
      assert.equal(result.status, 400, `${minutes} min doit être refusé`);
    }
  });

  await suite.test('le client ne peut pas annoncer son propre temps', async () => {
    const result = await api(`/api/orders/${commande.id}/estimate`, {
      method: 'PATCH',
      body: { minutes: 5 },
    });
    assert.equal(result.status, 401);
  });

  await suite.test('une commande servie n\'attend plus rien', async () => {
    for (const statut of ['ACCEPTED', 'PREPARING', 'READY', 'SERVED']) {
      // eslint-disable-next-line no-await-in-loop
      await api(`/api/orders/${commande.id}/status`, {
        method: 'PUT',
        token: serveuse.token,
        body: { status: statut },
      });
    }

    const result = await api(`/api/orders/${commande.id}/estimate`, {
      method: 'PATCH',
      token: serveuse.token,
      body: { minutes: 15 },
    });
    assert.equal(result.status, 400);
    assert.match(result.message, /terminée/);
  });
});
