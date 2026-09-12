const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../config/prisma');

let io = null;

/** Salon du personnel (admins + serveuses) d'un restaurant. */
const staffRoom = (restaurantId) => `restaurant:${restaurantId}:staff`;
/** Salon prive d'une serveuse (commandes qui lui sont attribuees). */
const userRoom = (userId) => `user:${userId}`;
/** Salon de suivi d'une commande cote client (jeton non devinable). */
const orderRoom = (trackingToken) => `order:${trackingToken}`;
/** Salon d'une table cote client. */
const tableRoom = (tableToken) => `table:${tableToken}`;

/**
 * Initialise Socket.IO.
 *
 * Deux types de connexions :
 *  - le personnel s'authentifie avec son JWT (handshake.auth.token) et rejoint
 *    le salon de son restaurant ;
 *  - le client n'a pas de compte : il rejoint uniquement le salon de sa table
 *    et celui de ses commandes via leur jeton de suivi.
 */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.frontendUrl.split(',').map((o) => o.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', async (socket) => {
    const token = socket.handshake.auth?.token;

    // ---- Connexion du personnel (ADMIN / SERVEUSE) --------------------
    if (token) {
      try {
        const payload = jwt.verify(token, env.jwtSecret);
        const user = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, restaurantId: true, role: true, status: true, firstName: true },
        });
        if (user && user.status === 'ACTIVE') {
          socket.data.user = user;
          socket.join(staffRoom(user.restaurantId));
          socket.join(userRoom(user.id));
          socket.emit('connected', { role: user.role, firstName: user.firstName });
        } else {
          socket.emit('auth_error', { message: 'Compte invalide ou desactive' });
        }
      } catch (error) {
        socket.emit('auth_error', { message: 'Jeton Socket.IO invalide' });
      }
    }

    // ---- Connexion cote client ----------------------------------------
    socket.on('join_table', (tableToken) => {
      if (typeof tableToken === 'string' && /^[a-f0-9]{16,64}$/i.test(tableToken)) {
        socket.join(tableRoom(tableToken));
      }
    });

    socket.on('track_order', (trackingToken) => {
      if (typeof trackingToken === 'string' && /^[a-f0-9]{16,64}$/i.test(trackingToken)) {
        socket.join(orderRoom(trackingToken));
      }
    });

    socket.on('untrack_order', (trackingToken) => {
      if (typeof trackingToken === 'string') socket.leave(orderRoom(trackingToken));
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO n\'est pas initialise');
  return io;
}

/** Ferme toutes les connexions temps reel (arret du serveur, tests). */
async function closeSocket() {
  if (!io) return;
  const instance = io;
  io = null;
  await new Promise((resolve) => instance.close(resolve));
}

/** Emet un evenement a tout le personnel d'un restaurant. */
function emitToStaff(restaurantId, event, payload) {
  if (!io) return;
  io.to(staffRoom(restaurantId)).emit(event, payload);
}

/** Emet un evenement a une serveuse precise. */
function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
}

/** Emet un evenement au client qui suit une commande. */
function emitToOrder(trackingToken, event, payload) {
  if (!io) return;
  io.to(orderRoom(trackingToken)).emit(event, payload);
}

/** Emet un evenement a tous les clients presents sur une table. */
function emitToTable(tableToken, event, payload) {
  if (!io) return;
  io.to(tableRoom(tableToken)).emit(event, payload);
}

module.exports = {
  initSocket,
  getIO,
  closeSocket,
  emitToStaff,
  emitToUser,
  emitToOrder,
  emitToTable,
  staffRoom,
  userRoom,
  orderRoom,
  tableRoom,
};
