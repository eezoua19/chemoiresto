const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { startServer, stopServer, api, login, unique, prisma } = require('./helpers');

/**
 * Remise a zero.
 *
 * Ces tests ne touchent JAMAIS au restaurant de developpement : ils montent un
 * second restaurant complet, le remettent a zero, et verifient que le premier
 * n'a pas bouge d'une ligne. C'est aussi la meilleure preuve que l'operation
 * est bien cloisonnee par restaurant.
 */
test('Remise à zéro des données', async (suite) => {
  await startServer();

  const admin = await login('admin@chemoiresto.ci', 'Admin@2026');
  const serveuse = await login('marie@chemoiresto.ci', 'Serveuse@2026');

  const marque = unique('Maquis');
  const motDePasse = 'Essai@2026';
  let voisin = null;
  let sonAdmin = null;
  let saTable = null;
  let sonProduit = null;

  suite.after(async () => {
    if (voisin) {
      // Cascade sur restaurantId : tout le second restaurant part avec lui.
      await prisma.restaurant.delete({ where: { id: voisin.id } }).catch(() => {});
    }
    await stopServer();
  });

  await suite.test('mise en place d\'un second restaurant complet', async () => {
    voisin = await prisma.restaurant.create({
      data: { name: marque, slug: marque.toLowerCase(), currency: 'FCFA' },
    });

    await prisma.user.create({
      data: {
        restaurantId: voisin.id,
        firstName: 'Patron',
        lastName: marque,
        email: `${marque.toLowerCase()}@essai.ci`,
        password: await bcrypt.hash(motDePasse, 10),
        role: 'ADMIN',
      },
    });

    saTable = await prisma.restaurantTable.create({
      data: { restaurantId: voisin.id, number: 'V1', token: unique('t').replace(/-/g, '').slice(0, 32) },
    });

    sonProduit = await prisma.product.create({
      data: { restaurantId: voisin.id, name: 'Poisson braisé', basePrice: 3000 },
    });

    const commande = await prisma.order.create({
      data: {
        restaurantId: voisin.id,
        tableId: saTable.id,
        orderNumber: `${marque}-1`,
        trackingToken: unique('x').replace(/-/g, '').slice(0, 32),
        status: 'SERVED',
        subtotal: 3000,
        total: 3000,
        items: {
          create: {
            productId: sonProduit.id,
            productName: sonProduit.name,
            unitPrice: 3000,
            quantity: 1,
            lineTotal: 3000,
          },
        },
      },
    });

    await prisma.serviceRequest.create({
      data: { restaurantId: voisin.id, tableId: saTable.id, type: 'CALL_SERVER', status: 'PENDING' },
    });

    await prisma.subscription.create({
      data: {
        restaurantId: voisin.id,
        number: `ABO-ESSAI-${Date.now().toString().slice(-6)}`,
        verifyToken: unique('v').replace(/-/g, '').slice(0, 32),
        firstName: 'Awa',
        lastName: 'Essai',
        phone: '0700000001',
        plan: 'MENSUEL',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 86400000),
      },
    });

    await prisma.dailyClosing.create({
      data: {
        restaurantId: voisin.id,
        date: new Date('2025-01-02T00:00:00.000Z'),
        revenue: 3000,
        ordersCount: 1,
        cancelledCount: 0,
        averageTicket: 3000,
        dineInRevenue: 3000,
        takeawayRevenue: 0,
      },
    });

    sonAdmin = await login(`${marque.toLowerCase()}@essai.ci`, motDePasse);
    assert.equal(sonAdmin.user.role, 'ADMIN');
    assert.ok(commande.id);
  });

  // ------------------------------------------------------------ garde-fous

  await suite.test('une serveuse ne peut pas remettre à zéro', async () => {
    const result = await api('/api/reset', {
      method: 'POST',
      token: serveuse.token,
      body: { confirmation: 'CHEMOIRESTO' },
    });
    assert.equal(result.status, 403);
  });

  await suite.test('sans jeton, la route est inaccessible', async () => {
    const result = await api('/api/reset', { method: 'POST', body: { confirmation: marque } });
    assert.equal(result.status, 401);
  });

  await suite.test('un nom de restaurant erroné est refusé, sans rien effacer', async () => {
    const result = await api('/api/reset', {
      method: 'POST',
      token: sonAdmin.token,
      body: { confirmation: 'nimporte quoi' },
    });

    assert.equal(result.status, 400);
    assert.match(result.message, new RegExp(marque));

    const commandes = await prisma.order.count({ where: { restaurantId: voisin.id } });
    assert.equal(commandes, 1, 'la commande est toujours là');
  });

  // ------------------------------------------------------------ l'operation

  let avantChezNous = null;

  await suite.test('la remise à zéro efface et laisse une sauvegarde', async () => {
    // Etat du restaurant de developpement AVANT : il ne doit pas bouger.
    avantChezNous = {
      commandes: await prisma.order.count({ where: { restaurantId: admin.user.restaurantId } }),
      produits: await prisma.product.count({ where: { restaurantId: admin.user.restaurantId } }),
    };

    const result = await api('/api/reset', {
      method: 'POST',
      token: sonAdmin.token,
      // Casse differente et espaces en trop : la confirmation reste humaine.
      body: { confirmation: `  ${marque.toUpperCase()}  ` },
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.deleted.orders, 1);
    assert.equal(result.data.deleted.orderItems, 1);
    assert.equal(result.data.deleted.serviceRequests, 1);
    assert.equal(result.data.deleted.subscriptions, 1);
    assert.equal(result.data.deleted.closings, 1);
    assert.ok(result.data.total >= 5);

    // Le filet : une sauvegarde existe, prise avant la suppression.
    assert.ok(result.data.backup.id, 'une sauvegarde a été conservée');
    assert.ok(result.data.backup.sizeBytes > 0);

    const sauvegarde = await prisma.backupSnapshot.findUnique({
      where: { id: result.data.backup.id },
    });
    assert.equal(sauvegarde.trigger, 'AVANT_RAZ');
    const contenu = JSON.parse(sauvegarde.content);
    assert.equal(contenu.donnees.orders.length, 1, 'la commande effacée est dans la sauvegarde');
  });

  await suite.test('les données d\'exploitation ont disparu', async () => {
    const parRestaurant = { where: { restaurantId: voisin.id } };
    assert.equal(await prisma.order.count(parRestaurant), 0);
    assert.equal(await prisma.orderItem.count({ where: { order: { restaurantId: voisin.id } } }), 0);
    assert.equal(await prisma.serviceRequest.count(parRestaurant), 0);
    assert.equal(await prisma.subscription.count(parRestaurant), 0);
    assert.equal(await prisma.dailyClosing.count(parRestaurant), 0);
  });

  await suite.test('la configuration est restée debout', async () => {
    const parRestaurant = { where: { restaurantId: voisin.id } };
    assert.equal(await prisma.product.count(parRestaurant), 1, 'la carte est intacte');
    assert.equal(await prisma.user.count(parRestaurant), 1, 'le compte existe toujours');

    const table = await prisma.restaurantTable.findUnique({ where: { id: saTable.id } });
    assert.ok(table, 'la table existe toujours');
    assert.equal(table.token, saTable.token, 'le QR Code collé reste valable');
  });

  await suite.test('le journal repart avec la remise à zéro comme première ligne', async () => {
    // L'ecriture du journal est asynchrone : on laisse respirer.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const entrees = await prisma.auditLog.findMany({
      where: { restaurantId: voisin.id },
      orderBy: { createdAt: 'desc' },
    });
    assert.equal(entrees.length, 1, 'une seule ligne, la nouvelle');
    assert.equal(entrees[0].action, 'REMISE_A_ZERO');
    assert.match(entrees[0].label, /Remise à zéro/);
  });

  await suite.test('le restaurant voisin n\'a pas été touché', async () => {
    const apres = {
      commandes: await prisma.order.count({ where: { restaurantId: admin.user.restaurantId } }),
      produits: await prisma.product.count({ where: { restaurantId: admin.user.restaurantId } }),
    };
    assert.deepEqual(apres, avantChezNous, 'aucune ligne du restaurant voisin n\'a bougé');
  });
});
