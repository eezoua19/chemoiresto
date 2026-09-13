const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login, unique, prisma } = require('./helpers');

/**
 * Le journal des actions de gestion.
 *
 * L'ecriture est asynchrone volontairement (le client n'attend pas le
 * journal) : on laisse donc respirer avant de relire.
 */
const respirer = () => new Promise((resolve) => setTimeout(resolve, 150));

/** Derniere entree correspondant a une action donnee. */
async function derniere(token, action) {
  await respirer();
  const result = await api(`/api/audit?action=${action}&pageSize=5`, { token });
  return result.data.entries[0] || null;
}

test('Journal des actions de gestion', async (suite) => {
  await startServer();

  const admin = await login('admin@chemoiresto.ci', 'Admin@2026');
  const serveuse = await login('marie@chemoiresto.ci', 'Serveuse@2026');

  const marque = unique('Journal');
  const creees = { produits: [], categories: [], comptes: [] };

  suite.after(async () => {
    await prisma.auditLog.deleteMany({ where: { label: { contains: marque } } });
    await prisma.product.deleteMany({ where: { id: { in: creees.produits } } });
    await prisma.category.deleteMany({ where: { id: { in: creees.categories } } });
    await prisma.user.deleteMany({ where: { id: { in: creees.comptes } } });
    await stopServer();
  });

  // ------------------------------------------------------------------ acces

  await suite.test('une serveuse n\'accède pas au journal', async () => {
    const result = await api('/api/audit', { token: serveuse.token });
    assert.equal(result.status, 403);
  });

  await suite.test('sans jeton, le journal est inaccessible', async () => {
    const result = await api('/api/audit');
    assert.equal(result.status, 401);
  });

  // ---------------------------------------------------------------- ecriture

  await suite.test('une action de gestion laisse une trace nominative', async () => {
    const creation = await api('/api/categories', {
      method: 'POST',
      token: admin.token,
      body: { name: `${marque} categorie` },
    });
    assert.equal(creation.status, 201);
    creees.categories.push(creation.data.id);

    const entree = await derniere(admin.token, 'CATEGORIE_CREEE');
    assert.ok(entree, 'une entrée existe');
    assert.match(entree.label, new RegExp(marque));
    assert.equal(entree.entity, 'Categorie');
    assert.equal(entree.entityId, creation.data.id);
    assert.equal(entree.author.id, admin.user.id);
    assert.equal(entree.author.role, 'ADMIN');
    assert.ok(entree.createdAt);
  });

  await suite.test('une action qui échoue ne laisse aucune trace', async () => {
    const avant = await api('/api/audit?pageSize=1', { token: admin.token });

    const echec = await api('/api/products/99999999', {
      method: 'DELETE',
      token: admin.token,
    });
    assert.equal(echec.status, 404);

    await respirer();
    const apres = await api('/api/audit?pageSize=1', { token: admin.token });
    assert.equal(
      apres.data.pagination.total,
      avant.data.pagination.total,
      'le journal ne bouge pas sur un échec'
    );
  });

  // --------------------------------------------------------------- contenu

  let produitId = null;

  await suite.test('un changement de prix garde les deux montants', async () => {
    const cree = await api('/api/products', {
      method: 'POST',
      token: admin.token,
      body: { name: `${marque} plat`, basePrice: 2000 },
    });
    produitId = cree.data.id;
    creees.produits.push(produitId);

    await api(`/api/products/${produitId}`, {
      method: 'PUT',
      token: admin.token,
      body: { basePrice: 2500 },
    });

    const entree = await derniere(admin.token, 'PRODUIT_MODIFIE');
    assert.match(entree.label, /2000 → 2500/);
    assert.deepEqual(entree.details, { ancienPrix: 2000, nouveauPrix: 2500 });
  });

  await suite.test('le nom de ce qui est supprimé survit à la suppression', async () => {
    const suppression = await api(`/api/products/${produitId}`, {
      method: 'DELETE',
      token: admin.token,
    });
    assert.equal(suppression.status, 200);

    const entree = await derniere(admin.token, 'PRODUIT_SUPPRIME');
    // C'est tout l'interet : l'objet n'existe plus, son nom reste lisible.
    assert.match(entree.label, new RegExp(`${marque} plat`));
    assert.equal(entree.entityId, produitId);
  });

  // ------------------------------------------------------- auteur disparu

  await suite.test('le nom de l\'auteur survit à la suppression de son compte', async () => {
    const email = `${unique('serveuse')}@chemoiresto.ci`;
    const compte = await api('/api/users/servers', {
      method: 'POST',
      token: admin.token,
      body: {
        firstName: 'Awa',
        lastName: marque,
        email,
        password: 'Serveuse@2026',
        phone: '0700000077',
      },
    });
    assert.equal(compte.status, 201);
    creees.comptes.push(compte.data.id);

    // Elle declare une rupture de stock : une vraie action tracee.
    const sien = await login(email, 'Serveuse@2026');
    const plat = await api('/api/products', {
      method: 'POST',
      token: admin.token,
      body: { name: `${marque} plat du soir`, basePrice: 1500 },
    });
    creees.produits.push(plat.data.id);

    await api(`/api/products/${plat.data.id}/availability`, {
      method: 'PATCH',
      token: sien.token,
    });

    const avant = await derniere(admin.token, 'PRODUIT_DISPONIBILITE');
    assert.equal(avant.author.id, compte.data.id);
    assert.equal(avant.author.fullName, `Awa ${marque}`);
    assert.equal(avant.author.stillExists, true);

    // Le compte disparait ; la trace de ce qu'il a fait, non.
    const suppression = await api(`/api/users/servers/${compte.data.id}`, {
      method: 'DELETE',
      token: admin.token,
    });
    assert.equal(suppression.status, 200);

    const apres = await derniere(admin.token, 'PRODUIT_DISPONIBILITE');
    assert.equal(apres.id, avant.id, 'la meme ligne');
    assert.equal(apres.author.fullName, `Awa ${marque}`, 'le nom reste lisible');
    assert.equal(apres.author.stillExists, false, 'le compte, lui, a disparu');
  });

  // -------------------------------------------------------------- lecture

  await suite.test('recherche et filtres', async () => {
    const parTexte = await api(`/api/audit?q=${encodeURIComponent(marque)}`, { token: admin.token });
    assert.ok(parTexte.data.entries.length >= 3);
    assert.ok(parTexte.data.entries.every((e) => e.label.includes(marque) || e.author.fullName.includes(marque)));

    const parEntite = await api('/api/audit?entity=Produit&pageSize=5', { token: admin.token });
    assert.ok(parEntite.data.entries.every((e) => e.entity === 'Produit'));

    const filtres = await api('/api/audit/filters', { token: admin.token });
    assert.ok(filtres.data.actions.some((a) => a.value === 'PRODUIT_SUPPRIME'));
    assert.ok(filtres.data.entities.some((e) => e.value === 'Produit'));
  });

  await suite.test('le journal est trié du plus récent au plus ancien', async () => {
    const result = await api('/api/audit?pageSize=10', { token: admin.token });
    const dates = result.data.entries.map((e) => new Date(e.createdAt).getTime());
    const trie = [...dates].sort((a, b) => b - a);
    assert.deepEqual(dates, trie);
  });

  await suite.test('le journal ne s\'efface pas : aucune route pour cela', async () => {
    const result = await api('/api/audit/1', { method: 'DELETE', token: admin.token });
    assert.equal(result.status, 404);
  });
});
