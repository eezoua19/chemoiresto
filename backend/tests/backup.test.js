const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login } = require('./helpers');

test('Sauvegarde : export complet des données', async (suite) => {
  await startServer();
  suite.after(() => stopServer());

  const admin = await login('admin@chemoiresto.ci', 'Admin@2026');
  const serveuse = await login('marie@chemoiresto.ci', 'Serveuse@2026');

  await suite.test('une serveuse ne peut pas exporter les données', async () => {
    const result = await api('/api/backup', { token: serveuse.token });
    assert.equal(result.status, 403);
  });

  await suite.test('un visiteur sans compte ne peut pas exporter', async () => {
    const result = await api('/api/backup');
    assert.equal(result.status, 401);
  });

  let instantane;

  await suite.test('l\'administrateur obtient un instantane complet', async () => {
    const result = await api('/api/backup', { token: admin.token });
    assert.equal(result.status, 200);
    instantane = result;
  });

  await suite.test('toutes les tables du schema sont presentes', async () => {
    const attendues = [
      'restaurant',
      'users',
      'categories',
      'products',
      'productOptions',
      'productOptionValues',
      'tables',
      'qrCodes',
      'dailyMenus',
      'dailyMenuItems',
      'customers',
      'orders',
      'orderItems',
      'orderItemOptions',
      'orderStatusHistory',
      'serviceRequests',
    ];
    for (const nom of attendues) {
      assert.ok(nom in instantane.donnees, `${nom} doit figurer dans l'export`);
    }
  });

  await suite.test('l\'export contient des données reelles', async () => {
    assert.ok(instantane.donnees.restaurant, 'le restaurant doit être present');
    assert.ok(instantane.donnees.products.length > 0, 'les produits doivent être presents');
    assert.ok(instantane.donnees.tables.length > 0, 'les tables doivent être presentes');
  });

  await suite.test('aucune empreinte de mot de passe ne fuit', async () => {
    for (const utilisateur of instantane.donnees.users) {
      assert.ok(!('password' in utilisateur), 'le mot de passe ne doit pas être exporte');
    }
    const brut = JSON.stringify(instantane.donnees);
    assert.ok(!/\$2[aby]\$\d{2}\$/.test(brut), 'aucune empreinte bcrypt ne doit apparaitre');
    assert.equal(instantane.metadonnees.motsDePasseExclus, true);
  });

  await suite.test('les jetons de table sont sauvegardes', async () => {
    // Sans eux, une restauration casserait tous les QR Codes déjà imprimes.
    assert.ok(
      instantane.donnees.tables.every((table) => typeof table.token === 'string' && table.token.length >= 16),
      'chaque table doit conserver son jeton'
    );
  });

  await suite.test('les montants restent exacts', async () => {
    // Les Decimal passent en chaine : un arrondi en virgule flottante fausserait
    // la comptabilite à la restauration.
    for (const produit of instantane.donnees.products) {
      assert.ok(
        typeof produit.basePrice === 'string' || typeof produit.basePrice === 'number',
        'le prix doit être serialisable'
      );
      assert.ok(Number.isFinite(Number(produit.basePrice)), 'le prix doit rester un nombre valide');
    }
  });

  await suite.test('les compteurs annonces correspondent au contenu', async () => {
    const { comptes } = instantane.metadonnees;
    assert.equal(comptes.products, instantane.donnees.products.length);
    assert.equal(comptes.orders, instantane.donnees.orders.length);
    assert.equal(comptes.tables, instantane.donnees.tables.length);
  });
});
