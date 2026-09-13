const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../config/prisma');

let io = null;

/** Salon du personnel (admins + serveuses) d'un restaurant. */
const staffRoom = (restaurantId) => `restaurant:${restaurantId}:staff`;
/** Salon prive d'une serveuse (commandes qui lui sont attribuees). */
const userRoom = (userId) => `user:${userId}`;
/** Salon de suivi d'une commande côté client (jeton non devinable). */
const orderRoom = (trackingToken) => `order:${trackingToken}`;
/** Salon d'une table côté client. */
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

    // ---- Salons du client ----------------------------------------------
    //
    // Ces ecoutes sont posees AVANT toute attente, et c'est essentiel.
    // Socket.IO vide la file d'attente du client des la connexion etablie :
    // une demande d'inscription partie avant que la page ne soit prete
    // arrive donc immediatement. Si le serveur etait encore en train de
    // verifier un jeton et d'interroger la base, l'evenement tombait dans le
    // vide, sans erreur nulle part - et le suivi de commande n'avancait
    // jamais.
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
          socket.emit('auth_error', { message: 'Compte invalide ou désactivé' });
        }
      } catch (error) {
        socket.emit('auth_error', { message: 'Jeton Socket.IO invalide' });
      }
    }

  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO n\'est pas initialise');
  return io;
}

/** Ferme toutes les connexions temps réel (arrêt du serveur, tests). */
async function closeSocket() {
  if (!io) return;
  const instance = io;
  io = null;
  await new Promise((resolve) => instance.close(resolve));
}

/** Emet un événement a tout le personnel d'un restaurant. */
function emitToStaff(restaurantId, event, payload) {
  if (!io) return;
  io.to(staffRoom(restaurantId)).emit(event, payload);
}

/** Emet un événement à une serveuse précise. */
function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
}

/** Emet un événement au client qui suit une commande. */
function emitToOrder(trackingToken, event, payload) {
  if (!io) return;
  io.to(orderRoom(trackingToken)).emit(event, payload);
}

/** Emet un événement a tous les clients presents sur une table. */
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
