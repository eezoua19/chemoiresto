const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const { randomToken, toNumber, money, dayRange } = require('../utils/helpers');
const { resolveUnitPrice } = require('./menu.service');

// ---------------------------------------------------------------------------
// Inclusions Prisma réutilisées
// ---------------------------------------------------------------------------

const orderInclude = {
  table: { select: { id: true, number: true, label: true, token: true } },
  server: { select: { id: true, firstName: true, lastName: true } },
  customer: { select: { id: true, name: true, phone: true } },
  items: {
    orderBy: { id: 'asc' },
    include: { options: { orderBy: { id: 'asc' } } },
  },
  statusHistory: {
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
  },
};

// ---------------------------------------------------------------------------
// Numéro de commande
// ---------------------------------------------------------------------------

/**
 * Génère un numéro lisible : CMD-20260911-0042
 * Le compteur est quotidien et par restaurant.
 */
async function generateOrderNumber(tx, restaurantId) {
  const { start, end } = dayRange();
  const count = await tx.order.count({
    where: { restaurantId, createdAt: { gte: start, lt: end } },
  });

  const d = new Date();
  const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`;

  return (sequence) => `CMD-${datePart}-${String(count + sequence).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Calcul du montant côté serveur
// ---------------------------------------------------------------------------

/**
 * Vérifie chaque ligne demandee et recalcule intégralement le montant a partir
 * de la base de données. Les prix envoyes par le frontend sont ignores.
 *
 * @param {object} params
 * @param {object} params.menu menu du jour charge (avec items + produits)
 * @param {Array}  params.requestedItems lignes envoyees par le client
 * @returns {{ lines: Array, subtotal: number, total: number }}
 */
async function buildOrderLines({ menu, requestedItems }) {
  if (!menu) {
    throw ApiError.badRequest('Le menu du jour n\'est pas encore disponible');
  }

  const menuItemsByProductId = new Map(
    menu.items.map((item) => [item.productId, item])
  );

  const lines = [];
  let subtotal = 0;

  for (const requested of requestedItems) {
    const menuItem = menuItemsByProductId.get(requested.productId);

    if (!menuItem) {
      throw ApiError.badRequest(
        `Le produit demande ne fait pas partie du menu du jour (id ${requested.productId})`
      );
    }

    const product = menuItem.product;
    if (!product || !product.isActive) {
      throw ApiError.badRequest(`Ce produit n'est plus disponible (id ${requested.productId})`);
    }
    if (!product.isAvailable || !menuItem.isAvailable) {
      throw ApiError.badRequest(`"${product.name}" est actuellement indisponible`);
    }

    const unitPrice = resolveUnitPrice(menuItem, product);

    // ---- Options et supplements -------------------------------------
    const optionsById = new Map();
    for (const option of product.options) {
      for (const value of option.values) {
        optionsById.set(value.id, { option, value });
      }
    }

    const selectedIds = Array.isArray(requested.optionValueIds) ? requested.optionValueIds : [];
    const chosenOptions = [];
    let optionsTotal = 0;

    for (const valueId of selectedIds) {
      const entry = optionsById.get(valueId);
      if (!entry) {
        throw ApiError.badRequest(`Option invalide pour "${product.name}"`);
      }
      if (!entry.value.isAvailable) {
        throw ApiError.badRequest(`L'option "${entry.value.name}" est indisponible`);
      }
      const delta = toNumber(entry.value.priceDelta);
      optionsTotal += delta;
      chosenOptions.push({
        optionId: entry.option.id,
        optionValueId: entry.value.id,
        optionName: entry.option.name,
        valueName: entry.value.name,
        priceDelta: delta,
      });
    }

    // ---- Controle des contraintes des groupes d'options --------------
    for (const option of product.options) {
      const chosenCount = chosenOptions.filter((c) => c.optionId === option.id).length;
      if (option.isRequired && chosenCount === 0) {
        throw ApiError.badRequest(`Veuillez choisir "${option.name}" pour ${product.name}`);
      }
      if (option.type === 'SINGLE' && chosenCount > 1) {
        throw ApiError.badRequest(`Un seul choix est autorisé pour "${option.name}"`);
      }
    }

    const quantity = requested.quantity;
    const lineTotal = money((unitPrice + optionsTotal) * quantity);
    subtotal += lineTotal;

    lines.push({
      productId: product.id,
      productName: product.name,
      unitPrice: money(unitPrice),
      optionsTotal: money(optionsTotal),
      quantity,
      lineTotal,
      note: requested.note || null,
      options: chosenOptions,
    });
  }

  subtotal = money(subtotal);
  return { lines, subtotal, total: subtotal };
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/**
 * Crée une commande complete (commande + lignes + options + historique)
 * dans une seule transaction.
 */
async function createOrder({
  restaurant,
  table = null,
  type = 'DINE_IN',
  lines,
  subtotal,
  total,
  customerName,
  customerPhone = null,
  comment,
}) {
  return prisma.$transaction(async (tx) => {
    const numberFor = await generateOrderNumber(tx, restaurant.id);

    let customerId = null;
    if ((customerName && customerName.trim()) || (customerPhone && customerPhone.trim())) {
      const customer = await tx.customer.create({
        data: {
          restaurantId: restaurant.id,
          name: customerName ? customerName.trim() : null,
          phone: customerPhone ? customerPhone.trim() : null,
        },
      });
      customerId = customer.id;
    }

    // En cas de collision de numéro (deux commandes simultanees), on réessaie.
    let order = null;
    for (let attempt = 1; attempt <= 5 && !order; attempt += 1) {
      const orderNumber = numberFor(attempt);
      try {
        order = await tx.order.create({
          data: {
            restaurantId: restaurant.id,
            tableId: table ? table.id : null,
            customerId,
            orderNumber,
            trackingToken: randomToken(16),
            type,
            // Le code de retrait est la fin du numéro du jour : court, unique
            // sur la journée, et facile a annoncer à voix haute au comptoir.
            pickupCode: type === 'TAKEAWAY' ? orderNumber.slice(-4) : null,
            status: 'NEW',
            customerName: customerName ? customerName.trim() : null,
            customerPhone: customerPhone ? customerPhone.trim() : null,
            comment: comment ? comment.trim() : null,
            subtotal,
            total,
            currency: restaurant.currency,
            items: {
              create: lines.map((line) => ({
                productId: line.productId,
                productName: line.productName,
                unitPrice: line.unitPrice,
                optionsTotal: line.optionsTotal,
                quantity: line.quantity,
                lineTotal: line.lineTotal,
                note: line.note,
                options: {
                  create: line.options.map((option) => ({
                    optionValueId: option.optionValueId,
                    optionName: option.optionName,
                    valueName: option.valueName,
                    priceDelta: option.priceDelta,
                  })),
                },
              })),
            },
            statusHistory: { create: { status: 'NEW', comment: 'Commande reçue' } },
          },
          include: orderInclude,
        });
      } catch (error) {
        if (error.code === 'P2002' && attempt < 5) continue;
        throw error;
      }
    }

    return order;
  });
}

// ---------------------------------------------------------------------------
// Transitions de statut
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS = {
  NEW: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED', 'CANCELLED'],
  SERVED: [],
  CANCELLED: [],
};

const STATUS_TIMESTAMP = {
  ACCEPTED: 'acceptedAt',
  PREPARING: 'preparingAt',
  READY: 'readyAt',
  SERVED: 'servedAt',
  CANCELLED: 'cancelledAt',
};

function assertTransition(current, next) {
  const allowed = ALLOWED_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw ApiError.badRequest(
      `Transition impossible : une commande "${current}" ne peut pas passer à "${next}"`
    );
  }
}

/**
 * Change le statut d'une commande, enregistré l'historique et, si la commande
 * n'avait pas encore de serveuse, l'attribue automatiquement a celle qui agit.
 */
async function changeStatus({ order, nextStatus, user, comment = null }) {
  assertTransition(order.status, nextStatus);

  const data = { status: nextStatus };
  const timestampField = STATUS_TIMESTAMP[nextStatus];
  if (timestampField) data[timestampField] = new Date();

  if (nextStatus === 'ACCEPTED' && !order.serverId && user && user.role === 'SERVER') {
    data.serverId = user.id;
  }

  return prisma.order.update({
    where: { id: order.id },
    data: {
      ...data,
      statusHistory: {
        create: { status: nextStatus, userId: user ? user.id : null, comment },
      },
    },
    include: orderInclude,
  });
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * D'ou vient la commande, en une ligne lisible par le personnel.
 * Accepte aussi bien une commande Prisma qu'une commande sérialisée.
 */
function libelleProvenance(order) {
  if (!order) return 'Provenance inconnue';
  if (order.type === 'TAKEAWAY') {
    return order.pickupCode ? `À emporter - code ${order.pickupCode}` : 'À emporter';
  }
  return order.table ? `Table ${order.table.number}` : 'Table inconnue';
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

/** Version complete, destinee au personnel. */
function serializeOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    trackingToken: order.trackingToken,
    type: order.type,
    pickupCode: order.pickupCode,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    comment: order.comment,
    subtotal: toNumber(order.subtotal),
    total: toNumber(order.total),
    currency: order.currency,
    createdAt: order.createdAt,
    estimatedMinutes: order.estimatedMinutes,
    estimatedReadyAt: order.estimatedReadyAt,
    acceptedAt: order.acceptedAt,
    preparingAt: order.preparingAt,
    readyAt: order.readyAt,
    servedAt: order.servedAt,
    cancelledAt: order.cancelledAt,
    table: order.table
      ? { id: order.table.id, number: order.table.number, label: order.table.label, token: order.table.token }
      : null,
    server: order.server
      ? {
          id: order.server.id,
          firstName: order.server.firstName,
          lastName: order.server.lastName,
          fullName: `${order.server.firstName} ${order.server.lastName}`,
        }
      : null,
    items: (order.items || []).map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      unitPrice: toNumber(item.unitPrice),
      optionsTotal: toNumber(item.optionsTotal),
      quantity: item.quantity,
      lineTotal: toNumber(item.lineTotal),
      note: item.note,
      options: (item.options || []).map((option) => ({
        id: option.id,
        optionName: option.optionName,
        valueName: option.valueName,
        priceDelta: toNumber(option.priceDelta),
      })),
    })),
    statusHistory: (order.statusHistory || []).map((entry) => ({
      id: entry.id,
      status: entry.status,
      comment: entry.comment,
      createdAt: entry.createdAt,
      user: entry.user
        ? { id: entry.user.id, fullName: `${entry.user.firstName} ${entry.user.lastName}` }
        : null,
    })),
  };
}

/** Version publique, destinee au suivi client (pas de données internes). */
function serializeOrderForClient(order) {
  const full = serializeOrder(order);
  if (!full) return null;
  const { statusHistory, ...rest } = full;
  return {
    ...rest,
    server: full.server ? { firstName: full.server.firstName } : null,
    timeline: statusHistory.map((entry) => ({
      status: entry.status,
      createdAt: entry.createdAt,
    })),
  };
}

module.exports = {
  orderInclude,
  buildOrderLines,
  createOrder,
  changeStatus,
  assertTransition,
  libelleProvenance,
  serializeOrder,
  serializeOrderForClient,
  ALLOWED_TRANSITIONS,
};
