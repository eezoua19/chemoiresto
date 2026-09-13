const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login, unique, prisma } = require('./helpers');

/** "2026-09-13" a partir d'un decalage en jours par rapport a aujourd'hui. */
function jour(decalage = 0) {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('Abonnements CHEMOIRESTO', async (suite) => {
  await startServer();

  const admin = await login('admin@chemoiresto.ci', 'Admin@2026');
  const serveuse = await login('marie@chemoiresto.ci', 'Serveuse@2026');

  const nom = unique('Kouadio');
  const telephone = `07${String(Date.now()).slice(-8)}`;
  let abonnement = null;

  suite.after(async () => {
    // Ne pas laisser trainer les abonnements d'essai dans la base de dev.
    await prisma.subscriptionUsage.deleteMany({ where: { subscription: { lastName: nom } } });
    await prisma.subscription.deleteMany({ where: { lastName: nom } });
    await stopServer();
  });

  // ---------------------------------------------------------------- acces

  await suite.test('une serveuse ne peut pas gérer les abonnements', async () => {
    const liste = await api('/api/subscriptions', { token: serveuse.token });
    assert.equal(liste.status, 403);

    const creation = await api('/api/subscriptions', {
      method: 'POST',
      token: serveuse.token,
      body: { firstName: 'Awa', lastName: nom, phone: telephone, plan: 'MENSUEL' },
    });
    assert.equal(creation.status, 403);
  });

  await suite.test('sans jeton, rien n\'est accessible', async () => {
    const result = await api('/api/subscriptions');
    assert.equal(result.status, 401);
  });

  // -------------------------------------------------------------- creation

  await suite.test('l\'administrateur crée un abonnement complet', async () => {
    const result = await api('/api/subscriptions', {
      method: 'POST',
      token: admin.token,
      body: {
        firstName: 'Awa',
        lastName: nom,
        phone: telephone,
        plan: 'MENSUEL',
        amount: 25000,
      },
    });

    assert.equal(result.status, 201);
    abonnement = result.data;

    assert.match(abonnement.number, /^ABO-\d{4}-\d{4}$/);
    assert.match(abonnement.verifyToken, /^[a-f0-9]{32}$/);
    assert.equal(abonnement.state, 'VALIDE');
    assert.equal(abonnement.isUsable, true);
    assert.equal(abonnement.amount, 25000);
    assert.equal(abonnement.usageCount, 0);
    assert.equal(abonnement.renewalCount, 0);
  });

  await suite.test('le ticket porte une adresse et un QR Code', async () => {
    assert.match(abonnement.ticket.url, /\/abonnement\/[a-f0-9]{32}$/);
    assert.match(abonnement.ticket.qrDataUrl, /^data:image\/png;base64,/);
    // Le QR encode bien l'adresse du ticket, pas autre chose.
    assert.ok(abonnement.ticket.url.endsWith(abonnement.verifyToken));
  });

  await suite.test('la formule mensuelle propose 30 jours, expiration incluse', async () => {
    assert.equal(abonnement.daysLeft, 29, 'jour 1 compris, un mensuel court jusqu\'a J+29');
    const fin = new Date(abonnement.endDate);
    assert.equal(fin.getHours(), 23, 'la date d\'expiration couvre toute la journée');
  });

  await suite.test('deux abonnements ne portent jamais le même numéro', async () => {
    const second = await api('/api/subscriptions', {
      method: 'POST',
      token: admin.token,
      body: { firstName: 'Yao', lastName: nom, phone: telephone, plan: 'HEBDOMADAIRE' },
    });
    assert.equal(second.status, 201);
    assert.notEqual(second.data.number, abonnement.number);
    assert.notEqual(second.data.verifyToken, abonnement.verifyToken);
    assert.equal(second.data.daysLeft, 6);
  });

  // ---------------------------------------------------------- verification

  await suite.test('la serveuse scanne et lit ABONNEMENT VALIDE', async () => {
    const result = await api(`/api/subscriptions/verify/${abonnement.verifyToken}`, {
      token: serveuse.token,
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.found, true);
    assert.equal(result.data.state, 'VALIDE');
    assert.equal(result.data.stateLabel, 'ABONNEMENT VALIDE');
    assert.equal(result.data.fullName, `Awa ${nom}`);
  });

  await suite.test('consulter un ticket ne consomme pas de passage', async () => {
    await api(`/api/subscriptions/verify/${abonnement.verifyToken}`, { token: serveuse.token });
    await api(`/api/subscriptions/verify/${abonnement.verifyToken}`, { token: serveuse.token });

    const detail = await api(`/api/subscriptions/${abonnement.id}`, { token: admin.token });
    assert.equal(detail.data.usageCount, 0, 'trois consultations, aucun passage enregistré');
  });

  await suite.test('un jeton inconnu répond ABONNEMENT INTROUVABLE', async () => {
    const result = await api(`/api/subscriptions/verify/${'0'.repeat(32)}`, {
      token: serveuse.token,
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.found, false);
    assert.equal(result.data.state, 'INTROUVABLE');
    assert.equal(result.data.isUsable, false);
  });

  // ------------------------------------------------------------ utilisation

  await suite.test('la serveuse enregistre un passage', async () => {
    const result = await api(`/api/subscriptions/verify/${abonnement.verifyToken}/use`, {
      method: 'POST',
      token: serveuse.token,
      body: { type: 'REPAS', note: 'Midi' },
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.usages.length, 1);

    const passage = result.data.usages[0];
    assert.equal(passage.type, 'REPAS');
    assert.equal(passage.note, 'Midi');
    assert.equal(passage.user.fullName, 'Marie Kouassi', 'le passage retient qui a scanné');
    assert.ok(passage.createdAt, 'le passage porte une date et une heure');
  });

  await suite.test('un passage peut être rattaché à une commande', async () => {
    const commande = await prisma.order.findFirst({ orderBy: { id: 'desc' } });
    if (!commande) return; // base sans commande : rien a verifier

    const result = await api(`/api/subscriptions/verify/${abonnement.verifyToken}/use`, {
      method: 'POST',
      token: serveuse.token,
      body: { type: 'BOISSON', orderId: commande.id },
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.usages[0].order.orderNumber, commande.orderNumber);
  });

  await suite.test('une commande inconnue est refusée', async () => {
    const result = await api(`/api/subscriptions/verify/${abonnement.verifyToken}/use`, {
      method: 'POST',
      token: serveuse.token,
      body: { orderId: 99999999 },
    });
    assert.equal(result.status, 400);
  });

  // ------------------------------------------------------------- suspension

  await suite.test('suspendu : le scan affiche ABONNEMENT SUSPENDU et refuse le passage', async () => {
    const suspension = await api(`/api/subscriptions/${abonnement.id}/status`, {
      method: 'PATCH',
      token: admin.token,
      body: { status: 'SUSPENDED' },
    });
    assert.equal(suspension.status, 200);

    const scan = await api(`/api/subscriptions/verify/${abonnement.verifyToken}`, {
      token: serveuse.token,
    });
    assert.equal(scan.data.state, 'SUSPENDU');
    assert.equal(scan.data.stateLabel, 'ABONNEMENT SUSPENDU');
    assert.equal(scan.data.isUsable, false);

    const passage = await api(`/api/subscriptions/verify/${abonnement.verifyToken}/use`, {
      method: 'POST',
      token: serveuse.token,
      body: {},
    });
    assert.equal(passage.status, 400);
    assert.match(passage.message, /SUSPENDU/);
  });

  await suite.test('désactivé : le scan affiche ABONNEMENT INACTIF', async () => {
    await api(`/api/subscriptions/${abonnement.id}/status`, {
      method: 'PATCH',
      token: admin.token,
      body: { status: 'INACTIVE' },
    });
    const scan = await api(`/api/subscriptions/verify/${abonnement.verifyToken}`, {
      token: serveuse.token,
    });
    assert.equal(scan.data.state, 'INACTIF');
    assert.equal(scan.data.stateLabel, 'ABONNEMENT INACTIF');

    const passage = await api(`/api/subscriptions/verify/${abonnement.verifyToken}/use`, {
      method: 'POST',
      token: serveuse.token,
      body: {},
    });
    assert.equal(passage.status, 400);
  });

  await suite.test('réactivé : le scan redevient VALIDE', async () => {
    await api(`/api/subscriptions/${abonnement.id}/status`, {
      method: 'PATCH',
      token: admin.token,
      body: { status: 'ACTIVE' },
    });
    const scan = await api(`/api/subscriptions/verify/${abonnement.verifyToken}`, {
      token: serveuse.token,
    });
    assert.equal(scan.data.state, 'VALIDE');
    assert.equal(scan.data.isUsable, true);
  });

  // --------------------------------------------------------------- dates

  await suite.test('expiré : le scan affiche ABONNEMENT EXPIRÉ et refuse le passage', async () => {
    const perime = await api('/api/subscriptions', {
      method: 'POST',
      token: admin.token,
      body: {
        firstName: 'Konan',
        lastName: nom,
        phone: telephone,
        plan: 'HEBDOMADAIRE',
        startDate: jour(-40),
        endDate: jour(-10),
      },
    });
    assert.equal(perime.status, 201);
    assert.equal(perime.data.state, 'EXPIRE');
    assert.equal(perime.data.stateLabel, 'ABONNEMENT EXPIRÉ');
    assert.ok(perime.data.daysLeft < 0);

    const passage = await api(`/api/subscriptions/verify/${perime.data.verifyToken}/use`, {
      method: 'POST',
      token: serveuse.token,
      body: {},
    });
    assert.equal(passage.status, 400);
    assert.match(passage.message, /EXPIRÉ/);
  });

  await suite.test('pas encore commencé : le passage est refusé', async () => {
    const futur = await api('/api/subscriptions', {
      method: 'POST',
      token: admin.token,
      body: {
        firstName: 'Adjoua',
        lastName: nom,
        phone: telephone,
        plan: 'MENSUEL',
        startDate: jour(10),
      },
    });
    assert.equal(futur.data.state, 'PAS_COMMENCE');

    const passage = await api(`/api/subscriptions/verify/${futur.data.verifyToken}/use`, {
      method: 'POST',
      token: serveuse.token,
      body: {},
    });
    assert.equal(passage.status, 400);
  });

  await suite.test('une expiration avant le début est refusée', async () => {
    const result = await api('/api/subscriptions', {
      method: 'POST',
      token: admin.token,
      body: {
        firstName: 'Test',
        lastName: nom,
        phone: telephone,
        plan: 'MENSUEL',
        startDate: jour(10),
        endDate: jour(2),
      },
    });
    assert.equal(result.status, 400);
  });

  // ---------------------------------------------------------- renouvellement

  await suite.test('renouveler avant l\'échéance ne fait pas perdre les jours restants', async () => {
    const avant = await api(`/api/subscriptions/${abonnement.id}`, { token: admin.token });
    const finAvant = new Date(avant.data.endDate);

    const result = await api(`/api/subscriptions/${abonnement.id}/renew`, {
      method: 'POST',
      token: admin.token,
      body: {},
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.renewalCount, 1);
    assert.ok(result.data.renewedAt);

    const debutApres = new Date(result.data.startDate);
    assert.ok(
      debutApres > finAvant,
      'le nouveau cycle démarre après la fin de l\'ancien, pas aujourd\'hui'
    );
    assert.ok(result.data.daysLeft >= 30);
  });

  await suite.test('renouveler un abonnement expiré repart d\'aujourd\'hui', async () => {
    const perime = await api('/api/subscriptions', {
      method: 'POST',
      token: admin.token,
      body: {
        firstName: 'Bakary',
        lastName: nom,
        phone: telephone,
        plan: 'MENSUEL',
        startDate: jour(-60),
        endDate: jour(-30),
      },
    });
    assert.equal(perime.data.state, 'EXPIRE');

    const result = await api(`/api/subscriptions/${perime.data.id}/renew`, {
      method: 'POST',
      token: admin.token,
      body: { plan: 'TRIMESTRIEL' },
    });
    assert.equal(result.data.state, 'VALIDE');
    assert.equal(result.data.plan, 'TRIMESTRIEL');
    assert.equal(result.data.daysLeft, 89);
  });

  // ----------------------------------------------------------- modification

  await suite.test('l\'administrateur corrige les informations', async () => {
    const result = await api(`/api/subscriptions/${abonnement.id}`, {
      method: 'PUT',
      token: admin.token,
      body: { firstName: 'Awa-Marie', phone: '+225 07 11 22 33 44', note: 'Paiement en espèces' },
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.firstName, 'Awa-Marie');
    assert.equal(result.data.phone, '+225 07 11 22 33 44');
    assert.equal(result.data.note, 'Paiement en espèces');
  });

  await suite.test('un numéro de téléphone invalide est refusé', async () => {
    const result = await api(`/api/subscriptions/${abonnement.id}`, {
      method: 'PUT',
      token: admin.token,
      body: { phone: 'appelle-moi' },
    });
    assert.equal(result.status, 400);
  });

  // -------------------------------------------------------------- recherche

  await suite.test('recherche par numéro, téléphone et nom', async () => {
    for (const terme of [abonnement.number, telephone, nom]) {
      const result = await api(`/api/subscriptions?search=${encodeURIComponent(terme)}`, {
        token: admin.token,
      });
      assert.equal(result.status, 200);
      assert.ok(result.data.subscriptions.length > 0, `aucun résultat pour ${terme}`);
    }
  });

  await suite.test('filtre sur les abonnements bientôt expirés', async () => {
    const bientot = await api('/api/subscriptions', {
      method: 'POST',
      token: admin.token,
      body: {
        firstName: 'Fatou',
        lastName: nom,
        phone: telephone,
        plan: 'HEBDOMADAIRE',
        startDate: jour(-5),
        endDate: jour(3),
      },
    });
    assert.equal(bientot.data.state, 'VALIDE');

    const result = await api('/api/subscriptions?state=BIENTOT', { token: admin.token });
    const numeros = result.data.subscriptions.map((a) => a.number);
    assert.ok(numeros.includes(bientot.data.number));
  });

  await suite.test('au comptoir, la serveuse retrouve un abonnement sans son QR Code', async () => {
    // Ticket dechire ou code illisible : on tape le numero d'abonnement.
    const parNumero = await api(`/api/subscriptions/lookup?q=${encodeURIComponent(abonnement.number)}`, {
      token: serveuse.token,
    });
    assert.equal(parNumero.status, 200);
    assert.equal(parNumero.data.results.length, 1);
    assert.equal(parNumero.data.results[0].number, abonnement.number);
    assert.ok(parNumero.data.results[0].stateLabel.startsWith('ABONNEMENT'));

    const parTelephone = await api(`/api/subscriptions/lookup?q=${encodeURIComponent(telephone)}`, {
      token: serveuse.token,
    });
    assert.ok(parTelephone.data.results.length > 0);

    const introuvable = await api('/api/subscriptions/lookup?q=ZZZZZZ', { token: serveuse.token });
    assert.equal(introuvable.status, 200);
    assert.equal(introuvable.data.results.length, 0);
  });

  // ------------------------------------------------------------ statistiques

  await suite.test('les statistiques comptent chaque état', async () => {
    const result = await api('/api/subscriptions/stats', { token: admin.token });
    assert.equal(result.status, 200);

    const { counts, usages, recent } = result.data;
    for (const cle of ['total', 'valides', 'expires', 'suspendus', 'inactifs', 'bientot']) {
      assert.equal(typeof counts[cle], 'number', `compteur ${cle} manquant`);
    }
    assert.ok(counts.total >= 6);
    assert.ok(counts.valides >= 1);
    assert.ok(counts.expires >= 1);
    assert.ok(usages.total >= 1);
    assert.ok(Array.isArray(recent));
    if (recent.length) {
      assert.ok(recent[0].subscription.number, 'l\'historique nomme l\'abonnement');
      assert.ok(recent[0].createdAt);
    }
  });

  await suite.test('une serveuse n\'accède pas aux statistiques', async () => {
    const result = await api('/api/subscriptions/stats', { token: serveuse.token });
    assert.equal(result.status, 403);
  });
});
