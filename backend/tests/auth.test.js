const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login } = require('./helpers');

const ADMIN = { email: 'admin@chemoiresto.ci', password: 'Admin@2026' };
const SERVER = { email: 'marie@chemoiresto.ci', password: 'Serveuse@2026' };

test('Authentification et permissions', async (suite) => {
  await startServer();
  suite.after(() => stopServer());

  let adminToken;
  let serverToken;

  await suite.test('connexion administrateur reussie', async () => {
    const result = await api('/api/auth/login', { method: 'POST', body: ADMIN });
    assert.equal(result.success, true);
    assert.equal(result.data.user.role, 'ADMIN');
    assert.ok(result.data.token, 'un jeton JWT doit etre renvoye');
    adminToken = result.data.token;
  });

  await suite.test('connexion serveuse reussie', async () => {
    const result = await login(SERVER.email, SERVER.password);
    assert.equal(result.user.role, 'SERVER');
    serverToken = result.token;
  });

  await suite.test('mot de passe incorrect refuse (401)', async () => {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: { email: ADMIN.email, password: 'mauvais-mot-de-passe' },
    });
    assert.equal(result.status, 401);
    assert.equal(result.success, false);
  });

  await suite.test('compte inexistant refuse sans reveler son absence', async () => {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'inconnu@exemple.ci', password: 'peu-importe' },
    });
    assert.equal(result.status, 401);
    assert.equal(result.message, 'Email ou mot de passe incorrect');
  });

  await suite.test('email invalide rejete par la validation (400)', async () => {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'pas-un-email', password: 'x' },
    });
    assert.equal(result.status, 400);
  });

  await suite.test('route protegee sans jeton renvoie 401', async () => {
    const result = await api('/api/products');
    assert.equal(result.status, 401);
  });

  await suite.test('jeton invalide renvoie 401', async () => {
    const result = await api('/api/products', { token: 'jeton.bidon.invalide' });
    assert.equal(result.status, 401);
  });

  await suite.test('/api/auth/me renvoie le profil et le restaurant', async () => {
    const result = await api('/api/auth/me', { token: adminToken });
    assert.equal(result.success, true);
    assert.equal(result.data.user.email, ADMIN.email);
    assert.ok(result.data.restaurant.name);
  });

  await suite.test('une serveuse ne peut pas voir les statistiques (403)', async () => {
    const result = await api('/api/dashboard/stats', { token: serverToken });
    assert.equal(result.status, 403);
  });

  await suite.test('une serveuse ne peut pas creer de produit (403)', async () => {
    const result = await api('/api/products', {
      method: 'POST',
      token: serverToken,
      body: { name: 'Interdit', basePrice: 1000 },
    });
    assert.equal(result.status, 403);
  });

  await suite.test('une serveuse ne peut pas creer de table (403)', async () => {
    const result = await api('/api/tables', {
      method: 'POST',
      token: serverToken,
      body: { number: 'X99' },
    });
    assert.equal(result.status, 403);
  });

  await suite.test('un administrateur accede aux statistiques', async () => {
    const result = await api('/api/dashboard/stats', { token: adminToken });
    assert.equal(result.success, true);
    assert.ok(result.data.today);
  });
});
