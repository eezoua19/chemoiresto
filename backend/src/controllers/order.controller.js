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
} = require('../services/order.service');
const { loadTableByToken } = require('./public.controller');
const { createNotification } = require('../services/notification.service');
const { emitToStaff, emitToUser, emitToOrder, emitToTable } = require('../sockets');

/** Evenement Socket.IO associe a chaque statut. */
const STATUS_EVENT = {
  ACCEPTED: 'order_accepted',
  PREPARING: 'order_preparing',
  READY: 'order_ready',
  SERVED: 'order_served',
  CANCELLED: 'order_cancelled',
};

const STATUS_LABEL = {
  NEW: 'Nouvelle',
  ACCEPTED: 'Acceptee',
  PREPARING: 'En preparation',
  READY: 'Prete',
  SERVED: 'Servie',
  CANCELLED: 'Annulee',
};

// ---------------------------------------------------------------------------
// CLIENT : creation d'une commande
// ---------------------------------------------------------------------------

/**
 * POST /api/orders  (route publique)
 *
 * Le serveur revalide integralement la demande :
 * table active -> produits existants -> presents au menu du jour ->
 * disponibles -> prix relus en base -> total recalcule.
 * Aucun montant envoye par le frontend n'est utilise.
 */
const create = asyncHandler(async (req, res) => {
  const { tableToken, items, customerName, comment } = req.body;

  const table = await loadTableByToken(tableToken);
  const restaurant = table.restaurant;

  const menu = await getMenuByDate(restaurant.id, new Date());
  if (!menu || !menu.isPublished) {
    throw ApiError.badRequest('Le menu du jour n\'est pas encore disponible');
  }

  const { lines, subtotal, total } = await buildOrderLines({ menu, requestedItems: items });

  const order = await createOrder({
    restaurant,
    table,
    lines,
    subtotal,
    total,
    customerName,
    comment,
  });

  const payload = serializeOrder(order);

  // Temps reel : le personnel recoit la commande immediatement.
  emitToStaff(restaurant.id, 'new_order', payload);
  await createNotification({
    restaurantId: restaurant.id,
    type: 'NEW_ORDER',
    title: `Nouvelle commande - Table ${table.number}`,
    body: `${payload.orderNumber} - ${payload.total} ${payload.currency}`,
    data: { orderId: order.id, orderNumber: order.orderNumber, tableNumber: table.number },
  });

  return created(res, serializeOrderForClient(order), 'Commande envoyee');
});

// ---------------------------------------------------------------------------
// PERSONNEL : consultation
// ---------------------------------------------------------------------------

/** Construit le filtre de periode a partir des parametres de requete. */
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
  const { status, tableId, serverId, search, mine, page, pageSize } = req.query;

  const createdAt = buildPeriodFilter(req.query);
  const statusList = status ? (Array.isArray(status) ? status : [status]) : undefined;

  const where = {
    restaurantId,
    ...(statusList ? { status: { in: statusList } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(tableId ? { tableId } : {}),
    ...(serverId ? { serverId } : {}),
    ...(mine === 'true' ? { serverId: req.user.id } : {}),
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search } },
            { customerName: { contains: search } },
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
    'Commandes recuperees'
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
    'Tableau des commandes recupere'
  );
});

/** GET /api/orders/:id */
const detail = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
    include: orderInclude,
  });
  if (!order) throw ApiError.notFound('Commande introuvable');
  return success(res, serializeOrder(order), 'Commande recuperee');
});

// ---------------------------------------------------------------------------
// PERSONNEL : actions
// ---------------------------------------------------------------------------

/** PUT /api/orders/:id/status */
const updateStatus = asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, restaurantId: req.user.restaurantId },
    include: { table: true },
  });
  if (!order) throw ApiError.notFound('Commande introuvable');

  const { status, comment } = req.body;

  // Une serveuse ne traite que ses commandes ou celles encore libres.
  if (req.user.role === 'SERVER' && order.serverId && order.serverId !== req.user.id) {
    throw ApiError.forbidden('Cette commande est attribuee a une autre serveuse');
  }

  const updated = await changeStatus({ order, nextStatus: status, user: req.user, comment });
  const payload = serializeOrder(updated);

  // Temps reel : personnel + client suivant la commande + table.
  emitToStaff(order.restaurantId, 'order_updated', payload);
  emitToStaff(order.restaurantId, STATUS_EVENT[status], payload);
  emitToOrder(updated.trackingToken, 'order_status', serializeOrderForClient(updated));
  emitToOrder(updated.trackingToken, STATUS_EVENT[status], serializeOrderForClient(updated));
  if (order.table) {
    emitToTable(order.table.token, 'order_status', serializeOrderForClient(updated));
  }

  return success(res, payload, `Commande ${STATUS_LABEL[status].toLowerCase()}`);
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
    if (!server) throw ApiError.badRequest('Serveuse invalide ou desactivee');
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
      title: `Commande ${updated.orderNumber} vous a ete attribuee`,
      body: `Table ${payload.table ? payload.table.number : '?'}`,
      data: { orderId: updated.id },
    });
  }

  return success(res, payload, serverId ? 'Commande attribuee' : 'Attribution retiree');
});

module.exports = { create, list, board, detail, updateStatus, assign, buildPeriodFilter };
