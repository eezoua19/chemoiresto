/**
 * Utilitaires partages par les tests.
 * Les tests demarrent leur propre serveur HTTP + Socket.IO sur un port libre
 * et travaillent sur la base de developpement (executez le seed avant).
 */
const http = require('http');
const { io } = require('socket.io-client');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const app = require('../src/app');
const prisma = require('../src/config/prisma');
const { initSocket, closeSocket } = require('../src/sockets');
const { today } = require('../src/utils/helpers');

let server = null;
let baseUrl = null;

/** Demarre le serveur de test (une seule fois pour toute la suite). */
async function startServer() {
  if (server) return baseUrl;

  server = http.createServer(app);
  initSocket(server);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

async function stopServer() {
  if (!server) return;
  // Socket.IO maintient des connexions ouvertes : il faut les fermer d'abord,
  // sinon server.close() n'aboutit jamais et la suite de tests reste bloquee.
  await closeSocket();
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  server = null;
  baseUrl = null;
}

/** Appel HTTP vers l'API de test, renvoie { status, ...corps }. */
async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const json = await response.json().catch(() => ({}));
  return { status: response.status, ...json };
}

/** Connexion et recuperation du jeton. */
async function login(email, password) {
  const result = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  if (!result.success) throw new Error(`Connexion impossible (${email}) : ${result.message}`);
  return { token: result.data.token, user: result.data.user };
}

/** Client Socket.IO connecte au serveur de test. */
/**
 * Client Socket.IO connecte au serveur de test.
 *
 * `attendre: false` renvoie la socket SANS attendre la connexion : c'est le
 * seul moyen de reproduire une inscription envoyee avant que la connexion ne
 * soit etablie, exactement comme le fait un navigateur qui charge une page.
 */
function connectSocket(token, { attendre = true } = {}) {
  const socket = io(baseUrl, {
    auth: token ? { token } : {},
    transports: ['websocket'],
    forceNew: true,
  });

  if (!attendre) return socket;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket.IO : delai depasse')), 5000);
    socket.on(token ? 'connected' : 'connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/** Attend un événement Socket.IO precis. */
function waitForEvent(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Evenement "${event}" non reçu après ${timeout} ms`)),
      timeout
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/**
 * Garantit qu'un menu publié existe pour aujourd'hui.
 * Les tests de commande en dependent.
 */
async function ensureTodayMenu(restaurantId) {
  const date = today();
  const existing = await prisma.dailyMenu.findUnique({
    where: { restaurantId_date: { restaurantId, date } },
    include: { items: true },
  });
  if (existing && existing.items.length > 0) return existing;

  const products = await prisma.product.findMany({
    where: { restaurantId, isActive: true },
    take: 10,
  });
  if (products.length === 0) {
    throw new Error('Aucun produit en base : executez "npm run seed" avant les tests.');
  }

  if (existing) await prisma.dailyMenu.delete({ where: { id: existing.id } });

  return prisma.dailyMenu.create({
    data: {
      restaurantId,
      date,
      title: 'Menu du jour',
      isPublished: true,
      items: {
        create: products.map((product, index) => ({ productId: product.id, sortOrder: index })),
      },
    },
    include: { items: true },
  });
}

/** Identifiant unique pour eviter les collisions entre executions. */
const unique = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;

module.exports = {
  startServer,
  stopServer,
  api,
  login,
  connectSocket,
  waitForEvent,
  ensureTodayMenu,
  unique,
  prisma,
};
