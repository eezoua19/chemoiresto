const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { startServer, stopServer, api, login, unique, prisma } = require('./helpers');

/**
 * Deux regressions trouvees lors d'un audit de fiabilite :
 * - `markAsRead` ne filtrait pas par destinataire : n'importe quel membre du
 *   personnel pouvait marquer comme lue la notification ciblee d'un·e collegue
 *   en devinant son id.
 * - `GET /servers/:id/activity` plantait (500) des qu'une des commandes
 *   recentes de la serveuse etait une vente a emporter (`table` vaut alors
 *   `null`, jamais gere).
 */
test('Notifications ciblées et activité du personnel', async (suite) => {
  await startServer();

  const admin = await login('admin@chemoiresto.ci', 'Admin@2026');
  const serveuseA = await login('marie@chemoiresto.ci', 'Serveuse@2026');
  const restaurantId = admin.user.restaurantId;
  const marque = unique('Activite');
  const motDePasse = 'Serveuse@2026';

  const cree = { commandes: [], utilisateurs: [] };

  // Deuxieme serveuse, propre a ce test : la fuite ne se voit qu'entre deux
  // comptes distincts, pas via l'admin qui a d'autres droits.
  const serveuseB = await prisma.user.create({
    data: {
      restaurantId,
      firstName: 'Fatou',
      lastName: marque,
      email: `serveuse-b-${marque.toLowerCase()}@essai.ci`,
      password: await bcrypt.hash(motDePasse, 10),
      role: 'SERVER',
    },
  });
  cree.utilisateurs.push(serveuseB.id);
  const b = await login(serveuseB.email, motDePasse);

  suite.after(async () => {
    await prisma.order.deleteMany({ where: { id: { in: cree.commandes } } });
    await prisma.user.deleteMany({ where: { id: { in: cree.utilisateurs } } });
    await stopServer();
  });

  let notificationId = null;
  let commandeId = null;

  await suite.test('attribuer une commande à emporter crée une notification ciblée', async () => {
    const commande = await prisma.order.create({
      data: {
        restaurantId,
        orderNumber: unique(`${marque}-cmd`),
        trackingToken: unique('t').replace(/-/g, '').slice(0, 32),
        status: 'NEW',
        subtotal: 1000,
        total: 1000,
        type: 'TAKEAWAY',
      },
    });
    cree.commandes.push(commande.id);
    commandeId = commande.id;

    const result = await api(`/api/orders/${commande.id}/assign`, {
      method: 'PUT',
      token: admin.token,
      body: { serverId: serveuseA.user.id },
    });
    assert.equal(result.status, 200);

    const notif = await prisma.notification.findFirst({
      where: { restaurantId, userId: serveuseA.user.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(notif, 'la notification ciblée existe');
    assert.equal(JSON.parse(notif.data).orderId, commande.id);
    notificationId = notif.id;
  });

  await suite.test("une autre serveuse ne peut pas marquer lue la notification d'une collègue", async () => {
    const result = await api(`/api/notifications/${notificationId}/read`, {
      method: 'PUT',
      token: b.token,
    });
    assert.equal(result.status, 404);

    const encore = await prisma.notification.findUnique({ where: { id: notificationId } });
    assert.equal(encore.isRead, false, "la notification n'a pas été marquée lue par erreur");
  });

  await suite.test('une notification sans destinataire (diffusée) reste marquable par tous', async () => {
    const diffusee = await prisma.notification.create({
      data: { restaurantId, userId: null, type: 'SYSTEM', title: 'Diffusion test' },
    });

    const result = await api(`/api/notifications/${diffusee.id}/read`, {
      method: 'PUT',
      token: b.token,
    });
    assert.equal(result.status, 200);

    await prisma.notification.delete({ where: { id: diffusee.id } });
  });

  await suite.test('la destinataire peut marquer sa propre notification comme lue', async () => {
    const result = await api(`/api/notifications/${notificationId}/read`, {
      method: 'PUT',
      token: serveuseA.token,
    });
    assert.equal(result.status, 200);

    const apres = await prisma.notification.findUnique({ where: { id: notificationId } });
    assert.equal(apres.isRead, true);
  });

  await suite.test("l'activité d'une serveuse ne plante plus sur une vente à emporter", async () => {
    const result = await api(`/api/users/servers/${serveuseA.user.id}/activity`, {
      token: admin.token,
    });
    assert.equal(result.status, 200);

    const entree = result.data.recentOrders.find((o) => o.id === commandeId);
    assert.ok(entree, 'la commande à emporter apparaît dans l\'activité');
    assert.equal(entree.tableNumber, null);
  });
});
