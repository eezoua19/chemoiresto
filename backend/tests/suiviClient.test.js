const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login, connectSocket, waitForEvent, prisma } = require('./helpers');

/**
 * Le suivi de commande côté client, et la course qui le cassait.
 *
 * Socket.IO vide la file d'attente du client dès que la connexion est
 * établie. Une demande d'inscription partie avant que la page soit prête
 * arrive donc à l'instant même de la connexion. Tant que le serveur posait
 * ses écoutes APRÈS avoir vérifié un jeton et interrogé la base, cet
 * événement tombait dans le vide : aucune erreur, aucun journal, et un suivi
 * de commande qui n'avançait jamais.
 *
 * Le test reproduit exactement ce moment : on demande le salon sans attendre
 * la connexion.
 */
test('Suivi de commande en direct', async (suite) => {
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
    if (produit) await prisma.product.delete({ where: { id: produit.id } }).catch(() => {});
    if (table) await prisma.restaurantTable.delete({ where: { id: table.id } }).catch(() => {});
    await stopServer();
  });

  await suite.test('mise en place', async () => {
    const creee = await api('/api/tables', {
      method: 'POST',
      token: admin.token,
      body: { number: `S${Date.now().toString().slice(-6)}`, label: 'Table suivi' },
    });
    table = creee.data;

    produit = await prisma.product.create({
      data: { restaurantId: admin.user.restaurantId, name: `Suivi ${Date.now()}`, basePrice: 1500 },
    });

    // Le plat doit etre au menu du jour pour etre commandable.
    const jour = new Date();
    const date = `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`;
    await api('/api/menus/today/products', {
      method: 'POST',
      token: admin.token,
      body: { productId: produit.id },
    });

    const passee = await api('/api/orders', {
      method: 'POST',
      body: { tableToken: table.token, items: [{ productId: produit.id, quantity: 1 }] },
    });
    assert.equal(passee.status, 201, `commande refusée : ${passee.message} (menu du ${date})`);
    commande = passee.data;
  });

  await suite.test(
    'une inscription envoyée avant la connexion arrive quand même',
    async () => {
      // Un jeton du personnel : c'est ce cas-la qui declenchait la course,
      // car le serveur devait d'abord verifier le jeton en base.
      const socket = connectSocket(serveuse.token, { attendre: false });
      sockets.push(socket);

      // Sans attendre : la demande part dans la file d'attente et sera vidée
      // à la seconde où la connexion s'établit.
      socket.emit('track_order', commande.trackingToken);

      const attendu = waitForEvent(socket, 'order_status');

      await api(`/api/orders/${commande.id}/status`, {
        method: 'PUT',
        token: serveuse.token,
        body: { status: 'ACCEPTED' },
      });

      const evenement = await attendu;
      assert.equal(evenement.trackingToken, commande.trackingToken);
      assert.equal(evenement.status, 'ACCEPTED');
    }
  );

  await suite.test('le client suit sa commande jusqu\'à « prête »', async () => {
    const socket = connectSocket(serveuse.token, { attendre: false });
    sockets.push(socket);
    socket.emit('track_order', commande.trackingToken);

    for (const statut of ['PREPARING', 'READY']) {
      const attendu = waitForEvent(socket, 'order_status');
      // eslint-disable-next-line no-await-in-loop
      await api(`/api/orders/${commande.id}/status`, {
        method: 'PUT',
        token: serveuse.token,
        body: { status: statut },
      });
      // eslint-disable-next-line no-await-in-loop
      const evenement = await attendu;
      assert.equal(evenement.status, statut);
    }
  });

  await suite.test('quitter le salon coupe le suivi', async () => {
    const socket = await connectSocket(serveuse.token);
    sockets.push(socket);
    socket.emit('track_order', commande.trackingToken);
    await new Promise((resolve) => setTimeout(resolve, 120));

    socket.emit('untrack_order', commande.trackingToken);
    await new Promise((resolve) => setTimeout(resolve, 120));

    let recu = false;
    socket.on('order_status', () => {
      recu = true;
    });

    await api(`/api/orders/${commande.id}/status`, {
      method: 'PUT',
      token: serveuse.token,
      body: { status: 'SERVED' },
    });
    await new Promise((resolve) => setTimeout(resolve, 400));

    assert.equal(recu, false, 'plus aucun événement après avoir quitté le salon');
  });
});
