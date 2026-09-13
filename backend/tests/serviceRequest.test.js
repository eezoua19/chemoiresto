const test = require('node:test');
const assert = require('node:assert/strict');
const {
  startServer,
  stopServer,
  api,
  login,
  connectSocket,
  waitForEvent,
  prisma,
} = require('./helpers');

test('Demandes des clients : appel serveuse et addition', async (suite) => {
  await startServer();
  suite.after(() => stopServer());

  const admin = await login('admin@chemoiresto.ci', 'Admin@2026');
  const server = await login('marie@chemoiresto.ci', 'Serveuse@2026');

  // Table dédiée pour ne pas interferer avec les demandes existantes.
  const created = await api('/api/tables', {
    method: 'POST',
    token: admin.token,
    body: { number: `SR${Date.now().toString().slice(-6)}`, label: 'Table test demandes' },
  });
  const table = created.data;

  let staffSocket;

  suite.after(async () => {
    staffSocket?.close();
    await prisma.serviceRequest.deleteMany({ where: { tableId: table.id } });
    await prisma.restaurantTable.delete({ where: { id: table.id } }).catch(() => {});
  });

  await suite.test('la serveuse se connecte au temps réel', async () => {
    staffSocket = await connectSocket(server.token);
    assert.ok(staffSocket.connected);
  });

  let callId;

  await suite.test('appel serveuse : crée la demande et alerte le personnel', async () => {
    const notified = waitForEvent(staffSocket, 'service_request');

    const result = await api('/api/service-requests', {
      method: 'POST',
      body: { tableToken: table.token, type: 'CALL_SERVER' },
    });

    assert.equal(result.status, 201);
    assert.equal(result.data.status, 'PENDING');
    assert.equal(result.data.table.number, table.number);
    callId = result.data.id;

    const event = await notified;
    assert.equal(event.type, 'CALL_SERVER');
    assert.equal(event.table.number, table.number);
  });

  await suite.test('anti-spam : un second appel ne crée pas de doublon', async () => {
    const result = await api('/api/service-requests', {
      method: 'POST',
      body: { tableToken: table.token, type: 'CALL_SERVER' },
    });

    assert.equal(result.data.id, callId, 'la demande ouverte est reutilisee');

    const count = await prisma.serviceRequest.count({
      where: { tableId: table.id, type: 'CALL_SERVER' },
    });
    assert.equal(count, 1, 'une seule demande doit exister en base');
  });

  await suite.test('le client voit sa demande en cours', async () => {
    const result = await api(`/api/menu/table/${table.token}/service-requests`);
    assert.equal(result.success, true);
    assert.ok(result.data.some((request) => request.id === callId));
  });

  // ---------------------- Rappels ----------------------
  // Le delai reel est de 90 s : on vieillit la demande en base plutot que
  // d'attendre, sinon la suite de tests durerait plusieurs minutes.
  const vieillirLaDemande = (secondes) =>
    prisma.serviceRequest.update({
      where: { id: callId },
      data: { createdAt: new Date(Date.now() - secondes * 1000), lastReminderAt: null },
    });

  await suite.test('rappel trop tot refuse (429)', async () => {
    const result = await api('/api/service-requests/remind', {
      method: 'POST',
      body: { tableToken: table.token, type: 'CALL_SERVER' },
    });
    assert.equal(result.status, 429);
  });

  await suite.test('rappel sans demande ouverte refuse (404)', async () => {
    const result = await api('/api/service-requests/remind', {
      method: 'POST',
      body: { tableToken: table.token, type: 'BILL' },
    });
    assert.equal(result.status, 404);
  });

  await suite.test('apres le delai : le rappel alerte le personnel', async () => {
    await vieillirLaDemande(120);
    const notified = waitForEvent(staffSocket, 'service_request_reminder');

    const result = await api('/api/service-requests/remind', {
      method: 'POST',
      body: { tableToken: table.token, type: 'CALL_SERVER' },
    });

    assert.equal(result.status, 200);
    assert.equal(result.data.id, callId, 'le rappel ne cree pas une seconde demande');
    assert.equal(result.data.reminderCount, 1);

    const event = await notified;
    assert.equal(event.id, callId);
    assert.equal(event.reminderCount, 1);

    const count = await prisma.serviceRequest.count({
      where: { tableId: table.id, type: 'CALL_SERVER' },
    });
    assert.equal(count, 1, 'toujours une seule demande en base');
  });

  await suite.test('au-dela de trois rappels le personnel n est plus relance', async () => {
    await prisma.serviceRequest.update({
      where: { id: callId },
      data: { reminderCount: 3, createdAt: new Date(Date.now() - 600000), lastReminderAt: null },
    });

    const result = await api('/api/service-requests/remind', {
      method: 'POST',
      body: { tableToken: table.token, type: 'CALL_SERVER' },
    });
    assert.equal(result.status, 429);

    const demande = await prisma.serviceRequest.findUnique({ where: { id: callId } });
    assert.equal(demande.reminderCount, 3, 'le compteur ne bouge plus');
  });

  await suite.test('la serveuse prend en charge puis termine l\'appel', async () => {
    const taken = await api(`/api/service-requests/${callId}/status`, {
      method: 'PUT',
      token: server.token,
      body: { status: 'TAKEN' },
    });
    assert.equal(taken.data.status, 'TAKEN');
    assert.equal(taken.data.handledBy.id, server.user.id);

    const done = await api(`/api/service-requests/${callId}/status`, {
      method: 'PUT',
      token: server.token,
      body: { status: 'COMPLETED' },
    });
    assert.equal(done.data.status, 'COMPLETED');
    assert.ok(done.data.handledAt);
  });

  await suite.test('statut incompatible avec le type de demande refusé (400)', async () => {
    const result = await api(`/api/service-requests/${callId}/status`, {
      method: 'PUT',
      token: server.token,
      body: { status: 'PAID' }, // statut reserve aux additions
    });
    assert.equal(result.status, 400);
  });

  let billId;

  await suite.test('demande d\'addition : statut initial REQUESTED', async () => {
    const result = await api('/api/service-requests', {
      method: 'POST',
      body: { tableToken: table.token, type: 'BILL' },
    });

    assert.equal(result.status, 201);
    assert.equal(result.data.status, 'REQUESTED');
    billId = result.data.id;
  });

  await suite.test('workflow de l\'addition : REQUESTED -> PROCESSING -> PAID', async () => {
    const processing = await api(`/api/service-requests/${billId}/status`, {
      method: 'PUT',
      token: server.token,
      body: { status: 'PROCESSING' },
    });
    assert.equal(processing.data.status, 'PROCESSING');

    const paid = await api(`/api/service-requests/${billId}/status`, {
      method: 'PUT',
      token: server.token,
      body: { status: 'PAID' },
    });
    assert.equal(paid.data.status, 'PAID');
  });

  await suite.test('les demandes fermées disparaissent de la liste active', async () => {
    const result = await api('/api/service-requests', { token: server.token });
    assert.ok(!result.data.some((request) => request.id === billId));
  });

  await suite.test('jeton de table invalide refusé (404)', async () => {
    const result = await api('/api/service-requests', {
      method: 'POST',
      body: { tableToken: '00000000000000000000000000000000', type: 'CALL_SERVER' },
    });
    assert.equal(result.status, 404);
  });

  await suite.test('type de demande inconnu refusé (400)', async () => {
    const result = await api('/api/service-requests', {
      method: 'POST',
      body: { tableToken: table.token, type: 'AUTRE_CHOSE' },
    });
    assert.equal(result.status, 400);
  });
});
