const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login, unique, prisma } = require('./helpers');

test('Notifications push : abonnement et désabonnement', async (suite) => {
  await startServer();
  suite.after(() => stopServer());

  const server = await login('marie@chemoiresto.ci', 'Serveuse@2026');
  const endpoint = `https://fcm.googleapis.com/fcm/send/${unique('test')}`;

  suite.after(() => prisma.pushSubscription.deleteMany({ where: { endpoint } }));

  await suite.test('abonnement refusé sans authentification (401)', async () => {
    const result = await api('/api/push/subscribe', {
      method: 'POST',
      body: { endpoint, keys: { p256dh: 'clé-p256dh', auth: 'clé-auth' } },
    });
    assert.equal(result.status, 401);
  });

  await suite.test('abonnement enregistré', async () => {
    const result = await api('/api/push/subscribe', {
      method: 'POST',
      token: server.token,
      body: { endpoint, keys: { p256dh: 'clé-p256dh', auth: 'clé-auth' } },
    });
    assert.equal(result.status, 201);

    const row = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    assert.ok(row);
    assert.equal(row.userId, server.user.id);
  });

  await suite.test('un second abonnement sur le même endpoint met à jour la ligne (pas de doublon)', async () => {
    await api('/api/push/subscribe', {
      method: 'POST',
      token: server.token,
      body: { endpoint, keys: { p256dh: 'nouvelle-clé', auth: 'clé-auth' } },
    });
    const count = await prisma.pushSubscription.count({ where: { endpoint } });
    assert.equal(count, 1);
  });

  await suite.test('désabonnement : la ligne disparaît', async () => {
    const result = await api('/api/push/unsubscribe', {
      method: 'POST',
      token: server.token,
      body: { endpoint },
    });
    assert.equal(result.status, 200);

    const row = await prisma.pushSubscription.findUnique({ where: { endpoint } });
    assert.equal(row, null);
  });

  await suite.test('endpoint invalide refusé (400)', async () => {
    const result = await api('/api/push/subscribe', {
      method: 'POST',
      token: server.token,
      body: { endpoint: 'pas-une-url', keys: { p256dh: 'x', auth: 'y' } },
    });
    assert.equal(result.status, 400);
  });
});
