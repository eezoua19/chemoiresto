/* Test bout-en-bout du workflow critique contre le serveur en cours. */
const { io } = require('socket.io-client');

const API = 'http://localhost:4000';
let failures = 0;

function check(label, condition, extra = '') {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} | ${label}${extra ? ' -> ' + extra : ''}`);
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const json = await res.json();
  return { status: res.status, ...json };
}

(async () => {
  // 1. Connexions
  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@chemoiresto.ci', password: 'Admin@2026' }),
  });
  check('Login ADMIN', adminLogin.success);
  const adminToken = adminLogin.data.token;

  const serverLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'marie@chemoiresto.ci', password: 'Serveuse@2026' }),
  });
  check('Login SERVEUSE', serverLogin.success);
  const serverToken = serverLogin.data.token;

  const badLogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@chemoiresto.ci', password: 'mauvais' }),
  });
  check('Mauvais mot de passe refusé', badLogin.status === 401);

  // 2. Permissions : la serveuse ne doit pas acceder aux stats admin
  const forbidden = await api('/api/dashboard/stats', { token: serverToken });
  check('Serveuse bloquee sur /dashboard/stats', forbidden.status === 403, `status ${forbidden.status}`);

  const noAuth = await api('/api/products');
  check('Route protegee sans jeton -> 401', noAuth.status === 401);

  // 3. Table + QR Code
  const tables = await api('/api/tables', { token: adminToken });
  const table = tables.data.find((t) => t.number === '01');
  check('QR Code present sur la table 01', Boolean(table.qrCode && table.qrCode.dataUrl.startsWith('data:image/png')));
  check('URL du QR contient le jeton', table.qrCode.url.includes(table.token));

  // 4. Menu du jour côté client
  const menu = await api(`/api/menu/table/${table.token}`);
  check('Menu du jour récupéré', menu.success && menu.data.menu && menu.data.menu.items.length > 0);

  const poulet = menu.data.menu.items.find((i) => i.name === 'Poulet braise');
  const coca = menu.data.menu.items.find((i) => i.name === 'Coca-Cola 50cl');
  const frites = poulet.options[0].values.find((v) => v.name === 'Frites');
  const fromage = poulet.options[1].values.find((v) => v.name === 'Fromage');

  // 5. Socket.IO : la serveuse écoute
  const staffSocket = io(API, { auth: { token: serverToken }, transports: ['websocket'] });
  const events = [];
  await new Promise((resolve, reject) => {
    staffSocket.on('connected', resolve);
    staffSocket.on('connect_error', reject);
    setTimeout(() => reject(new Error('timeout socket personnel')), 5000);
  });
  check('Socket.IO : serveuse authentifiee', true);

  const newOrderPromise = new Promise((resolve) => staffSocket.once('new_order', resolve));
  staffSocket.onAny((name, payload) => events.push({ name, payload }));

  // 6. Commande client - le total doit être recalcule par le serveur
  const expected = (5000 + 500 + 500) * 1 + 500 * 2; // 6000 + 1000 = 7000
  const order = await api('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      tableToken: table.token,
      customerName: 'Client Test',
      comment: 'Sans piment',
      items: [
        { productId: poulet.productId, quantity: 1, optionValueIds: [frites.id, fromage.id] },
        { productId: coca.productId, quantity: 2 },
      ],
    }),
  });
  check('Commande créée', order.success, order.message);
  check('Numéro au format CMD-AAAAMMJJ-NNNN', /^CMD-\d{8}-\d{4}$/.test(order.data.orderNumber), order.data.orderNumber);
  check('Total recalcule par le serveur', order.data.total === expected, `${order.data.total} attendu ${expected}`);

  const received = await Promise.race([
    newOrderPromise,
    new Promise((_r, rej) => setTimeout(() => rej(new Error('pas de new_order')), 5000)),
  ]);
  check('Socket.IO : new_order reçu par la serveuse', received.orderNumber === order.data.orderNumber);

  // 7. Client suit sa commande
  const clientSocket = io(API, { transports: ['websocket'] });
  await new Promise((resolve) => clientSocket.on('connect', resolve));
  clientSocket.emit('track_order', order.data.trackingToken);
  const clientEvents = [];
  clientSocket.on('order_status', (p) => clientEvents.push(p.status));
  await new Promise((r) => setTimeout(r, 300));

  // 8. Workflow des statuts
  const orderId = order.data.id;
  for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'SERVED']) {
    const res = await api(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      token: serverToken,
      body: JSON.stringify({ status }),
    });
    check(`Statut -> ${status}`, res.success && res.data.status === status, res.message);
  }

  const badTransition = await api(`/api/orders/${orderId}/status`, {
    method: 'PUT',
    token: serverToken,
    body: JSON.stringify({ status: 'PREPARING' }),
  });
  check('Transition invalide refusée (SERVED -> PREPARING)', badTransition.status === 400);

  await new Promise((r) => setTimeout(r, 500));
  check(
    'Client a reçu les 4 changements en temps réel',
    ['ACCEPTED', 'PREPARING', 'READY', 'SERVED'].every((s) => clientEvents.includes(s)),
    clientEvents.join(', ')
  );

  // 9. Attribution automatique à la serveuse
  const detail = await api(`/api/orders/${orderId}`, { token: adminToken });
  check('Commande attribuée automatiquement a Marie', detail.data.server && detail.data.server.firstName === 'Marie');

  // 10. Historique des prix : changer le prix ne modifie pas la commande passee
  const prod = await api(`/api/products/${poulet.productId}`, { token: adminToken });
  const oldPrice = prod.data.basePrice;
  await api(`/api/products/${poulet.productId}`, {
    method: 'PUT',
    token: adminToken,
    body: JSON.stringify({ basePrice: oldPrice + 1000 }),
  });
  const afterPriceChange = await api(`/api/orders/${orderId}`, { token: adminToken });
  check(
    'Historique des prix preserve',
    afterPriceChange.data.items.find((i) => i.productName === 'Poulet braise').unitPrice === oldPrice,
    `${afterPriceChange.data.items[0].unitPrice} (prix produit passe a ${oldPrice + 1000})`
  );
  await api(`/api/products/${poulet.productId}`, {
    method: 'PUT',
    token: adminToken,
    body: JSON.stringify({ basePrice: oldPrice }),
  });

  // 11. Produit hors menu du jour refuse
  const allProducts = await api('/api/products', { token: adminToken });
  const menuProductIds = new Set(menu.data.menu.items.map((i) => i.productId));
  const outside = allProducts.data.find((p) => !menuProductIds.has(p.id));
  if (outside) {
    const refused = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        tableToken: table.token,
        items: [{ productId: outside.id, quantity: 1 }],
      }),
    });
    check('Produit hors menu du jour refusé', refused.status === 400, refused.message);
  }

  // 12. Prix falsifie ignore (le frontend n'envoie pas de prix, mais on vérifie
  //     qu'un champ parasite ne change rien)
  const forged = await api('/api/orders', {
    method: 'POST',
    body: JSON.stringify({
      tableToken: table.token,
      items: [{ productId: coca.productId, quantity: 1, price: 1, total: 1 }],
      total: 1,
    }),
  });
  check('Prix envoye par le client ignore', forged.success && forged.data.total === 500, `total=${forged.data.total}`);

  // 13. Demande de service (appel serveuse) + anti-spam
  // Table dédiée : l'anti-spam reutiliserait sinon une demande déjà ouverte
  // sur la table 01 et n'emettrait aucun événement.
  const srTable = await api('/api/tables', {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({ number: 'SR' + Date.now().toString().slice(-6) }),
  });

  const callPromise = new Promise((resolve) => staffSocket.once('service_request', resolve));
  const call = await api('/api/service-requests', {
    method: 'POST',
    body: JSON.stringify({ tableToken: srTable.data.token, type: 'CALL_SERVER' }),
  });
  check('Appel serveuse envoye', call.success, call.message);
  const callEvent = await Promise.race([
    callPromise,
    new Promise((_r, rej) => setTimeout(() => rej(new Error('pas de service_request')), 5000)),
  ]);
  check('Socket.IO : service_request reçu', callEvent.type === 'CALL_SERVER');

  const spam = await api('/api/service-requests', {
    method: 'POST',
    body: JSON.stringify({ tableToken: srTable.data.token, type: 'CALL_SERVER' }),
  });
  check('Anti-spam : deuxieme appel non duplique', spam.data.id === call.data.id);

  const bill = await api('/api/service-requests', {
    method: 'POST',
    body: JSON.stringify({ tableToken: srTable.data.token, type: 'BILL' }),
  });
  check('Demande d\'addition envoyée', bill.success && bill.data.status === 'REQUESTED');

  const billDone = await api(`/api/service-requests/${bill.data.id}/status`, {
    method: 'PUT',
    token: serverToken,
    body: JSON.stringify({ status: 'PAID' }),
  });
  check('Addition marquée payée', billDone.success && billDone.data.status === 'PAID');

  // 14. Menus par date + copie
  const d1 = '2026-12-24';
  const d2 = '2026-12-25';
  for (const d of [d1, d2]) {
    const existing = await api(`/api/menus/date/${d}`, { token: adminToken });
    if (existing.data.menu) {
      await api(`/api/menus/${existing.data.menu.id}`, { method: 'DELETE', token: adminToken });
    }
  }

  const menu1 = await api('/api/menus', {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({
      date: d1,
      title: 'Reveillon',
      items: [
        { productId: poulet.productId, price: 4500, isDishOfDay: true },
        { productId: coca.productId },
      ],
    }),
  });
  check('Menu du 24/12 créé', menu1.success, menu1.message);
  check('Prix special du jour enregistré', menu1.data.items.find((i) => i.productId === poulet.productId).price === 4500);

  const dup = await api(`/api/menus/${menu1.data.id}/duplicate`, {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({ targetDate: d2 }),
  });
  check('Menu copié vers le 25/12', dup.success, dup.message);
  check('Produits copies', dup.data.items.length === menu1.data.items.length);

  const source = await api(`/api/menus/date/${d1}`, { token: adminToken });
  check('Menu source inchangé après copie', source.data.menu.items.length === 2);

  const conflict = await api('/api/menus', {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({ date: d1, items: [] }),
  });
  check('Doublon de date refusé', conflict.status === 409);

  // 15. Aucun menu pour une date -> message clair
  const empty = await api('/api/menus/date/2027-01-15', { token: adminToken });
  check('Date sans menu -> menu null', empty.data.menu === null, empty.message);

  // 16. Tableau serveuse
  const boardRes = await api('/api/orders/board', { token: serverToken });
  check('Tableau Kanban accessible', boardRes.success && boardRes.data.columns && boardRes.data.stats);

  // 17. Stats admin
  const statsRes = await api('/api/dashboard/stats', { token: adminToken });
  check('Statistiques admin', statsRes.success && statsRes.data.today.orders > 0);
  check('Graphique 14 jours', statsRes.data.charts.daily.length === 14);

  // 18. Creation de table + QR + desactivation
  const tmpNumber = 'T' + Date.now().toString().slice(-5);
  const newTable = await api('/api/tables', {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({ number: tmpNumber }),
  });
  check('Table créée avec QR Code', newTable.success && newTable.data.qrCode);
  const oldToken = newTable.data.token;

  const regen = await api(`/api/tables/${newTable.data.id}/qrcode/regenerate`, {
    method: 'POST',
    token: adminToken,
  });
  check('QR Code regenere avec nouveau jeton', regen.success && regen.data.table.token !== oldToken);
  check('Ancien jeton invalide', (await api(`/api/menu/table/${oldToken}`)).status === 404);

  await api(`/api/tables/${newTable.data.id}/status`, { method: 'PATCH', token: adminToken });
  const inactive = await api(`/api/menu/table/${regen.data.table.token}`);
  check('Table désactivée bloque le menu', inactive.status === 403, inactive.message);

  await api(`/api/tables/${newTable.data.id}`, { method: 'DELETE', token: adminToken });

  // 19. Attribution manuelle par l'admin
  const assign = await api(`/api/orders/${forged.data.id}/assign`, {
    method: 'PUT',
    token: adminToken,
    body: JSON.stringify({ serverId: serverLogin.data.user.id }),
  });
  check('Admin attribue une commande', assign.success && assign.data.server.id === serverLogin.data.user.id);

  const assignByServer = await api(`/api/orders/${forged.data.id}/assign`, {
    method: 'PUT',
    token: serverToken,
    body: JSON.stringify({ serverId: null }),
  });
  check('Serveuse ne peut pas attribuer', assignByServer.status === 403);

  // 20. Notifications
  const notifs = await api('/api/notifications', { token: serverToken });
  check('Notifications enregistrées', notifs.success && notifs.data.length > 0, `${notifs.data.length} notification(s)`);

  await api('/api/tables/' + srTable.data.id, { method: 'DELETE', token: adminToken });

  staffSocket.close();
  clientSocket.close();

  console.log(`\n${failures === 0 ? 'TOUS LES TESTS PASSENT' : failures + ' TEST(S) EN ECHEC'}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error('ERREUR FATALE :', error);
  process.exit(1);
});
