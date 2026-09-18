const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const { dayRange } = require('../utils/helpers');
const { getMenuByDate } = require('../services/menu.service');
const {
  orderInclude,
  buildOrderLines,
  createOrder,
  changeStatus,
  serializeOrder,
  serializeOrderForClient,
  libelleProvenance,
} = require('../services/order.service');
const { loadTableByToken, loadRestaurantByTakeawayToken } = require('./public.controller');
const { createNotification } = require('../services/notification.service');
const { awardForOrder } = require('../services/loyalty.service');
const { sendPush } = require('../services/push.service');
const { emitToStaff, emitToUser, emitToOrder, emitToTable } = require('../sockets');

/** Événement Socket.IO associe à chaque statut. */
const STATUS_EVENT = {
  ACCEPTED: 'order_accepted',
  PREPARING: 'order_preparing',
  READY: 'order_ready',
  SERVED: 'order_served',
  CANCELLED: 'order_cancelled',
};

/**
 * Notification push envoyee au client qui suit la commande, a chaque
 * changement de statut - c'est le second canal (recu meme onglet ferme),
 * miroir des evenements Socket.IO ci-dessus qui ne marchent qu'a l'ecran ouvert.
 */
const STATUS_PUSH = {
  ACCEPTED: { title: 'Commande acceptée', body: 'Le restaurant prépare votre commande.' },
  PREPARING: { title: 'En préparation', body: 'Votre commande est en cours de préparation.' },
  READY: { title: 'Votre commande est prête !', body: 'Rendez-vous est pris, elle vous attend.' },
  SERVED: { title: 'Bon appétit !', body: 'Votre commande a été servie.' },
  CANCELLED: { title: 'Commande annulée', body: 'Votre commande a été annulée.' },
};

const STATUS_LABEL = {
  NEW: 'Nouvelle',
  ACCEPTED: 'Acceptée',
  PREPARING: 'En préparation',
  READY: 'Prête',
  SERVED: 'Servie',
  CANCELLED: 'Annulée',
};

// ---------------------------------------------------------------------------
// CLIENT : creation d'une commande
// ---------------------------------------------------------------------------

/**
 * POST /api/orders  (route publique)
 *
 * Le serveur revalide intégralement la demande :
 * table active -> produits existants -> presents au menu du jour ->
 * disponibles -> prix relus en base -> total recalcule.
 * Aucun montant envoye par le frontend n'est utilise.
 */
const create = asyncHandler(async (req, res) => {
  const { tableToken, takeawayToken, items, customerName, customerPhone, comment, promoCode } = req.body;

  // Le validateur garantit qu'un seul des deux jetons est present.
  const emporter = Boolean(takeawayToken);
  const table = emporter ? null : await loadTableByToken(tableToken);
  const restaurant = emporter
    ? await loadRestaurantByTakeawayToken(takeawayToken)
    : table.restaurant;

  const menu = await getMenuByDate(restaurant.id, new Date());
  if (!menu || !menu.isPublished) {
    throw ApiError.badRequest('Le menu du jour n\'est pas encore disponible');
  }

  const { lines, subtotal, total } = await buildOrderLines({ menu, requestedItems: items });

  const order = await createOrder({
    restaurant,
    table,
    type: emporter ? 'TAKEAWAY' : 'DINE_IN',
    lines,
    subtotal,
    total,
    customerName,
    // Autrefois reserve a l'emporter (pour prevenir le client). Le programme
    // de fidelite en a maintenant besoin aussi a table ; le champ reste
    // facultatif cote client dans les deux cas.
    customerPhone,
    comment,
    promoCode,
  });

  const payload = serializeOrder(order);
  const provenance = libelleProvenance(payload);

  // Temps réel : le personnel reçoit la commande immédiatement.
  emitToStaff(restaurant.id, 'new_order', payload);
  await createNotification({
    restaurantId: restaurant.id,
    type: 'NEW_ORDER',
    title: `Nouvelle commande - ${provenance}`,
    body: `${payload.orderNumber} - ${payload.total} ${payload.currency}`,
    data: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      type: order.type,
      pickupCode: order.pickupCode,
      tableNumber: table ? table.number : null,
    },
  });

  return created(res, serializeOrderForClient(order), 'Commande envoyée');
});

// ---------------------------------------------------------------------------
// PERSONNEL : consultation
// ---------------------------------------------------------------------------

/** Construit le filtre de période à partir des paramètres de requete. */
function buildPeriodFilter({ period, from, to }) {
  if (!period || period === 'all') {
    if (from || to) {
      const range = {};
      if (from) range.gte = new Date(`${from}T00:00:00`);
      if (to) {
        const end = new Date(`${to}T00:00:00`);
        end.setDate(end.getDate() + 1);
        range.lt = end;
      }
      return range;
    }
    return undefined;
  }

  const now = new Date();

  if (period === 'today') {
    const { start, end } = dayRange(now);
    return { gte: start, lt: end };
  }

  if (period === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const { start, end } = dayRange(yesterday);
    return { gte: start, lt: end };
  }

  if (period === 'week') {
    const start = new Date(now);
    const weekday = (start.getDay() + 6) % 7; // lundi = 0
    start.setDate(start.getDate() - weekday);
    start.setHours(0, 0, 0, 0);
    return { gte: start };
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { gte: start };
  }

  if (period === 'custom') {
    const range = {};
    if (from) range.gte = new Date(`${from}T00:00:00`);
    if (to) {
      const end = new Date(`${to}T00:00:00`);
      end.setDate(end.getDate() + 1);
      range.lt = end;
    }
    return Object.keys(range).length ? range : undefined;
  }

  return undefined;
}

/** GET /api/orders */
const list = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { status, tableId, type, serverId, search, mine, page, pageSize } = req.query;

  const createdAt = buildPeriodFilter(req.query);
  const statusList = status ? (Array.isArray(status) ? status : [status]) : undefined;

  const where = {
    restaurantId,
    ...(statusList ? { status: { in: statusList } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(tableId ? { tableId } : {}),
    ...(type ? { type } : {}),
    ...(serverId ? { serverId } : {}),
    ...(mine === 'true' ? { serverId: req.user.id } : {}),
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search } },
            { customerName: { contains: search } },
            { pickupCode: { contains: search } },
            { table: { number: { contains: search } } },
          ],
        }
      : {}),
  };

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: orderInclude,
    }),
  ]);

  return success(
    res,
    {
      orders: orders.map(serializeOrder),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    },
    'Commandes récupérées'
  );
});

/**
 * GET /api/orders/board
 * Vue Kanban de la serveuse : commandes actives du jour regroupees par statut.
 */
const board = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const { start } = dayRange(new Date());

  const orders = await prisma.order.findMany({
    where: {
      restaurantId,
      createdAt: { gte: start },
      status: { in: ['NEW', 'ACCEPTED', 'PREPARING', 'READY'] },
      ...(req.query.mine === 'true' ? { OR: [{ serverId: req.user.id }, { serverId: null }] } : {}),
    },
    orderBy: { createdAt: 'asc' },
    include: orderInclude,
  });

  const serialized = orders.map(serializeOrder);
  const servedCount = await prisma.order.count({
    where: { restaurantId, createdAt: { gte: start }, status: 'SERVED' },
  });

  return success(
    res,
    {
      columns: {
        NEW: serialized.filter((order) => order.status === 'NEW'),
        ACCEPTED: serialized.filter((order) => order.status === 'ACCEPTED'),
        PREPARING: serialized.filter((order) => order.status === 'PREPARING'),
        READY: serialized.filter((order) => order.status === 'READY'),
      },
      stats: {
        new: serialized.filter((order) => order.status === 'NEW').length,
        accepted: serialized.filter((order) => order.status === 'ACCEPTED').length,
        preparing: serialized.filter((order) => order.status === 'PREPARING').length,
        ready: serialized.filter((order) => order.status === 'READY').length,
        served: servedCount,
      },
    },
    'Tableau des commandes récupéré'
  );
});

/** GET /api/orders/:id */
const detail = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
    include: orderInclude,
  });
  if (!order) throw ApiError.notFound('Commande introuvable');
  return success(res, serializeOrder(order), 'Commande récupérée');
});

// ---------------------------------------------------------------------------
// PERSONNEL : actions
// ---------------------------------------------------------------------------

/** PUT /api/orders/:id/status */
const updateStatus = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
    include: {
      table: true,
      restaurant: { select: { id: true, loyaltyEnabled: true, loyaltyRewardThreshold: true } },
    },
  });
  if (!order) throw ApiError.notFound('Commande introuvable');

  const { status, comment } = req.body;

  // Une serveuse ne traité que ses commandes ou celles encore libres.
  if (req.user.role === 'SERVER' && order.serverId && order.serverId !== req.user.id) {
    throw ApiError.forbidden('Cette commande est attribuée à une autre serveuse');
  }

  const updated = await changeStatus({ order, nextStatus: status, user: req.user, comment });
  const payload = serializeOrder(updated);

  if (status === 'SERVED') {
    await awardForOrder(order, order.restaurant).catch((error) => {
      console.error('[FIDELITE] attribution des points échouée :', error.message);
    });
  }

  // Temps réel : personnel + client suivant la commande + table.
  emitToStaff(order.restaurantId, 'order_updated', payload);
  emitToStaff(order.restaurantId, STATUS_EVENT[status], payload);
  emitToOrder(updated.trackingToken, 'order_status', serializeOrderForClient(updated));
  emitToOrder(updated.trackingToken, STATUS_EVENT[status], serializeOrderForClient(updated));
  if (order.table) {
    emitToTable(order.table.token, 'order_status', serializeOrderForClient(updated));
  }

  const pushInfo = STATUS_PUSH[status];
  if (pushInfo) {
    sendPush({
      restaurantId: order.restaurantId,
      orderId: order.id,
      payload: { ...pushInfo, url: `/commande/${updated.trackingToken}` },
    }).catch((error) => console.error('[PUSH] notification client échouée :', error.message));
  }

  return success(res, payload, `Commande ${STATUS_LABEL[status].toLowerCase()}`);
});

/**
 * PATCH /api/orders/:id/estimate (personnel)
 *
 * La serveuse annonce au client dans combien de temps ce sera pret.
 *
 * Pourquoi elle, et pas un calcul : une moyenne ne voit pas que le braiseur
 * est deja plein, ni qu'il ne reste qu'un poisson. Elle, si. Et un temps
 * annonce par quelqu'un engage ce quelqu'un - c'est ce qui le rend fiable.
 *
 * On enregistre l'heure d'arrivee prevue en plus de la duree : un compte a
 * rebours calcule a partir d'une duree glisserait a chaque rechargement de
 * page, et le client verrait « 20 minutes » indefiniment.
 */
const setEstimate = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
    include: { table: true },
  });
  if (!order) throw ApiError.notFound('Commande introuvable');

  if (['SERVED', 'CANCELLED'].includes(order.status)) {
    throw ApiError.badRequest('Cette commande est terminée : plus rien à annoncer');
  }

  // Une serveuse ne parle pas au client d'une autre.
  if (req.user.role === 'SERVER' && order.serverId && order.serverId !== req.user.id) {
    throw ApiError.forbidden('Cette commande est attribuée à une autre serveuse');
  }

  const { minutes } = req.body;
  // 0 : on retire l'annonce plutot que d'annoncer « tout de suite ».
  const efface = minutes === 0;

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      estimatedMinutes: efface ? null : minutes,
      estimatedReadyAt: efface ? null : new Date(Date.now() + minutes * 60000),
    },
    include: orderInclude,
  });

  const payload = serializeOrder(updated);
  const pourLeClient = serializeOrderForClient(updated);

  emitToStaff(order.restaurantId, 'order_updated', payload);
  emitToOrder(updated.trackingToken, 'order_status', pourLeClient);
  if (order.table) emitToTable(order.table.token, 'order_status', pourLeClient);

  return success(
    res,
    payload,
    efface ? "Temps d'attente retiré" : `Temps annoncé au client : ${minutes} min`
  );
});

/** PUT /api/orders/:id/assign (ADMIN) */
const assign = asyncHandler(async (req, res) => {
  const restaurantId = req.user.restaurantId;
  const order = await prisma.order.findFirst({ where: { id: req.params.id, restaurantId } });
  if (!order) throw ApiError.notFound('Commande introuvable');

  const { serverId } = req.body;

  if (serverId !== null) {
    const server = await prisma.user.findFirst({
      where: { id: serverId, restaurantId, status: 'ACTIVE' },
    });
    if (!server) throw ApiError.badRequest('Serveuse invalide ou désactivée');
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { serverId },
    include: orderInclude,
  });

  const payload = serializeOrder(updated);
  emitToStaff(restaurantId, 'order_updated', payload);

  if (serverId) {
    emitToUser(serverId, 'order_assigned', payload);
    await createNotification({
      restaurantId,
      userId: serverId,
      type: 'SYSTEM',
      title: `Commande ${updated.orderNumber} vous a été attribuée`,
      body: libelleProvenance(payload),
      data: { orderId: updated.id },
    });
  }

  return success(res, payload, serverId ? 'Commande attribuée' : 'Attribution retirée');
});

module.exports = {
  setEstimate, create, list, board, detail, updateStatus, assign, buildPeriodFilter };
