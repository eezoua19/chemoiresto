const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login, unique, prisma } = require('./helpers');

/**
 * Contrôle de mise en service.
 *
 * Comme pour la remise à zéro, les tests montent un second restaurant : on
 * veut pouvoir créer de vrais problèmes (tables désactivées, aucun menu) sans
 * abîmer les données de développement.
 */
test('Contrôle de mise en service', async (suite) => {
  await startServer();

  const serveuse = await login('marie@chemoiresto.ci', 'Serveuse@2026');

  const marque = unique('Controle');
  const motDePasse = 'Essai@2026';
  let voisin = null;
  let sonAdmin = null;
  let tables = [];

  suite.after(async () => {
    if (voisin) await prisma.restaurant.delete({ where: { id: voisin.id } }).catch(() => {});
    await stopServer();
  });

  await suite.test('mise en place d\'un restaurant tout neuf', async () => {
    const bcrypt = require('bcryptjs');
    voisin = await prisma.restaurant.create({
      data: { name: marque, slug: marque.toLowerCase(), phone: '+225 07 00 00 00 00' },
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

    tables = await Promise.all(
      ['01', '02', '03'].map((numero, index) =>
        prisma.restaurantTable.create({
          data: {
            restaurantId: voisin.id,
            number: numero,
            token: unique(`t${index}`).replace(/-/g, '').slice(0, 32),
            // Deux tables laissees hors service : le cas reel.
            status: index === 0 ? 'ACTIVE' : 'INACTIVE',
          },
        })
      )
    );

    sonAdmin = await login(`${marque.toLowerCase()}@essai.ci`, motDePasse);
    assert.equal(sonAdmin.user.role, 'ADMIN');
  });

  await suite.test('une serveuse n\'accède pas au contrôle', async () => {
    const result = await api('/api/setup', { token: serveuse.token });
    assert.equal(result.status, 403);
  });

  await suite.test('les points bloquants sont vus', async () => {
    const result = await api('/api/setup', { token: sonAdmin.token });
    assert.equal(result.status, 200);

    const par = Object.fromEntries(result.data.checks.map((c) => [c.id, c]));

    // Aucun menu publie : c'est LE point qui empeche de commander.
    assert.equal(par.menu_du_jour.ok, false);
    assert.equal(par.menu_du_jour.niveau, 'bloquant');
    assert.match(par.menu_du_jour.detail, /ne peut rien commander/);

    // Deux tables hors service, nommees.
    assert.equal(par.tables_actives.ok, false);
    assert.match(par.tables_actives.detail, /02, 03/);
    assert.equal(par.tables_actives.cibles.length, 2);

    // Aucun plat : la carte est vide.
    assert.equal(par.plats_disponibles.ok, false);

    assert.equal(result.data.summary.ready, false);
    assert.ok(result.data.summary.blocking >= 3);
  });

  await suite.test('un numéro de démonstration est repéré', async () => {
    const result = await api('/api/setup', { token: sonAdmin.token });
    const telephone = result.data.checks.find((c) => c.id === 'telephone');

    assert.equal(telephone.ok, false);
    assert.equal(telephone.niveau, 'attention');
    assert.match(telephone.detail, /démonstration/);
  });

  await suite.test('un vrai numéro passe le contrôle', async () => {
    await prisma.restaurant.update({
      where: { id: voisin.id },
      data: { phone: '+225 27 22 49 51 30', address: 'Cocody, Abidjan' },
    });

    const result = await api('/api/setup', { token: sonAdmin.token });
    const par = Object.fromEntries(result.data.checks.map((c) => [c.id, c]));
    assert.equal(par.telephone.ok, true);
    assert.equal(par.adresse.ok, true);
  });

  await suite.test('les tables se remettent toutes en service d\'un geste', async () => {
    const result = await api('/api/setup/tables/activate', {
      method: 'POST',
      token: sonAdmin.token,
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.activated, 2);

    const restantes = await prisma.restaurantTable.count({
      where: { restaurantId: voisin.id, status: 'INACTIVE' },
    });
    assert.equal(restantes, 0);

    const apres = await api('/api/setup', { token: sonAdmin.token });
    const contr = apres.data.checks.find((c) => c.id === 'tables_actives');
    assert.equal(contr.ok, true);
    assert.match(contr.detail, /3 tables en service/);
  });

  await suite.test('une serveuse ne peut pas réactiver les tables', async () => {
    const result = await api('/api/setup/tables/activate', {
      method: 'POST',
      token: serveuse.token,
    });
    assert.equal(result.status, 403);
  });

  await suite.test('le geste laisse une trace dans le journal', async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const entrees = await prisma.auditLog.findMany({
      where: { restaurantId: voisin.id, action: 'TABLES_REACTIVEES' },
    });
    assert.equal(entrees.length, 1);
    assert.match(entrees[0].label, /2 table\(s\) remise\(s\) en service/);
  });

  await suite.test('tout en ordre : le restaurant est déclaré prêt', async () => {
    // On complete ce qui manquait : un plat, un menu publie, une serveuse.
    const bcrypt = require('bcryptjs');
    const produit = await prisma.product.create({
      data: { restaurantId: voisin.id, name: 'Attiéké poisson', basePrice: 2500 },
    });
    await prisma.user.create({
      data: {
        restaurantId: voisin.id,
        firstName: 'Awa',
        lastName: marque,
        email: `serveuse-${marque.toLowerCase()}@essai.ci`,
        password: await bcrypt.hash(motDePasse, 10),
        role: 'SERVER',
      },
    });

    const aujourdhui = new Date();
    aujourdhui.setUTCHours(0, 0, 0, 0);
    await prisma.dailyMenu.create({
      data: {
        restaurantId: voisin.id,
        date: aujourdhui,
        isPublished: true,
        items: { create: { productId: produit.id, price: 2500 } },
      },
    });

    const result = await api('/api/setup', { token: sonAdmin.token });
    assert.equal(result.data.summary.blocking, 0, 'plus rien ne bloque');
    assert.equal(result.data.summary.ready, true);
  });
});
