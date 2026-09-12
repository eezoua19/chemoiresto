const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, login } = require('./helpers');

test('Tableau de bord : période mensuelle', async (suite) => {
  await startServer();
  suite.after(() => stopServer());

  const admin = await login('admin@chemoiresto.ci', 'Admin@2026');
  const serveuse = await login('marie@chemoiresto.ci', 'Serveuse@2026');

  const maintenant = new Date();
  const moisCourant = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}`;

  await suite.test('une serveuse n\'accède pas au tableau de bord', async () => {
    const result = await api('/api/dashboard/stats', { token: serveuse.token });
    assert.equal(result.status, 403);
  });

  await suite.test('sans parametre, le mois en cours est renvoye', async () => {
    const result = await api('/api/dashboard/stats', { token: admin.token });
    assert.equal(result.status, 200);
    assert.equal(result.data.period.month, moisCourant);
    assert.equal(result.data.period.isCurrent, true);
  });

  await suite.test('un mois passe est accepté et n\'est pas marque courant', async () => {
    const result = await api('/api/dashboard/stats?month=2026-01', { token: admin.token });
    assert.equal(result.status, 200);
    assert.equal(result.data.period.month, '2026-01');
    assert.equal(result.data.period.isCurrent, false);
    assert.equal(result.data.period.label, 'Janvier 2026');
  });

  await suite.test('le graphique couvre tous les jours du mois demande', async () => {
    // Janvier a 31 jours, fevrier 2026 en a 28 : la grille doit suivre le
    // calendrier réel et non une fenêtre fixe.
    const janvier = await api('/api/dashboard/stats?month=2026-01', { token: admin.token });
    const fevrier = await api('/api/dashboard/stats?month=2026-02', { token: admin.token });
    assert.equal(janvier.data.charts.daily.length, 31);
    assert.equal(fevrier.data.charts.daily.length, 28);
    assert.equal(janvier.data.period.daysInMonth, 31);
    assert.equal(fevrier.data.period.daysInMonth, 28);
  });

  await suite.test('les jours renvoyes appartiennent bien au mois demande', async () => {
    const result = await api('/api/dashboard/stats?month=2026-03', { token: admin.token });
    for (const jour of result.data.charts.daily) {
      assert.ok(jour.date.startsWith('2026-03'), `${jour.date} n'est pas en mars 2026`);
    }
  });

  await suite.test('un mois sans activité renvoie des compteurs a zero', async () => {
    // Mois anterieur à toute commande : les totaux doivent être nuls, pas nuls
    // au sens absent.
    const result = await api('/api/dashboard/stats?month=2020-05', { token: admin.token });
    assert.equal(result.status, 200);
    assert.equal(result.data.period.orders, 0);
    assert.equal(result.data.period.revenue, 0);
    assert.equal(result.data.period.averageBasket, 0);
    assert.equal(result.data.period.daysWithService, 0);
    assert.equal(result.data.period.bestDay, null);
  });

  await suite.test('un mois mal forme est refusé', async () => {
    for (const invalide of ['2026-13', '2026-00', 'septembre', '26-09', '2026-9']) {
      const result = await api(`/api/dashboard/stats?month=${invalide}`, { token: admin.token });
      assert.equal(result.status, 400, `${invalide} aurait du être refusé`);
    }
  });

  await suite.test('le bloc du jour reste celui du jour réel', async () => {
    // Meme en consultant un mois passe : ce bloc sert au service en cours.
    const result = await api('/api/dashboard/stats?month=2026-01', { token: admin.token });
    const aujourdhui = new Date().toISOString().slice(0, 10);
    assert.equal(result.data.today.date, aujourdhui);
  });
});
