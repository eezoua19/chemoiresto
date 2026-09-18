const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { today, formatDate } = require('../utils/helpers');
const { getMenuByDate, serializeMenuForClient } = require('../services/menu.service');
const { serializeOrderForClient, orderInclude } = require('../services/order.service');
const { findAccountByPhone } = require('../services/loyalty.service');
const { validateCode } = require('../services/promoCode.service');
const { toNumber } = require('../utils/helpers');

/**
 * Charge une table à partir de son jeton QR Code et vérifie qu'elle est active.
 * Fonction partagee par toutes les routes publiques (menu, commande, appel).
 */
async function loadTableByToken(token) {
  const table = await prisma.restaurantTable.findUnique({
    where: { token },
    include: { restaurant: true },
  });

  if (!table) throw ApiError.notFound('QR Code invalide ou table inconnue');
  if (table.status !== 'ACTIVE') {
    throw ApiError.forbidden('Cette table est actuellement désactivée. Appelez un serveur.');
  }
  if (!table.restaurant.isActive) {
    throw ApiError.forbidden('Ce restaurant est momentanément fermé');
  }

  return table;
}

/**
 * Charge un restaurant à partir du jeton de l'affiche "a emporter".
 * Meme role que loadTableByToken, mais pour un client qui n'occupe aucune table.
 */
async function loadRestaurantByTakeawayToken(token) {
  const restaurant = await prisma.restaurant.findUnique({ where: { takeawayToken: token } });

  if (!restaurant) throw ApiError.notFound('QR Code invalide');
  if (!restaurant.isActive) {
    throw ApiError.forbidden('Ce restaurant est momentanément fermé');
  }
  if (!restaurant.takeawayEnabled) {
    throw ApiError.forbidden(
      'Les commandes à emporter sont fermées pour le moment. Adressez-vous au comptoir.'
    );
  }

  return restaurant;
}

/** Partie commune aux deux entrées publiques : la fiche du restaurant. */
function ficheRestaurant(restaurant) {
  return {
    id: restaurant.id,
    name: restaurant.name,
    logo: restaurant.logo,
    description: restaurant.description,
    address: restaurant.address,
    phone: restaurant.phone,
    currency: restaurant.currency,
    primaryColor: restaurant.primaryColor,
    welcomeMessage: restaurant.welcomeMessage,
    openingHours: restaurant.openingHours,
    loyaltyEnabled: restaurant.loyaltyEnabled,
    loyaltyRewardLabel: restaurant.loyaltyRewardLabel,
  };
}

/**
 * GET /api/menu/table/:token
 * Point d'entrée du client après le scan du QR Code.
 * Identifie la table, le restaurant, puis renvoie le menu de la date du jour.
 */
const getMenuByTableToken = asyncHandler(async (req, res) => {
  const table = await loadTableByToken(req.params.token);
  const restaurant = table.restaurant;

  const date = today();
  const menu = await getMenuByDate(restaurant.id, date);
  const published = menu && menu.isPublished ? menu : null;

  return success(
    res,
    {
      restaurant: ficheRestaurant(restaurant),
      service: 'DINE_IN',
      table: {
        id: table.id,
        number: table.number,
        label: table.label,
        token: table.token,
      },
      date: formatDate(date),
      menu: serializeMenuForClient(published, restaurant),
    },
    published ? 'Menu du jour récupéré' : 'Le menu du jour n\'est pas encore disponible'
  );
});

/**
 * GET /api/menu/emporter/:token
 * Meme menu que celui des tables, mais sans table : le client commande au
 * comptoir et repart avec un code de retrait.
 */
const getTakeawayMenu = asyncHandler(async (req, res) => {
  const restaurant = await loadRestaurantByTakeawayToken(req.params.token);

  const date = today();
  const menu = await getMenuByDate(restaurant.id, date);
  const published = menu && menu.isPublished ? menu : null;

  return success(
    res,
    {
      restaurant: ficheRestaurant(restaurant),
      service: 'TAKEAWAY',
      table: null,
      takeawayToken: restaurant.takeawayToken,
      date: formatDate(date),
      menu: serializeMenuForClient(published, restaurant),
    },
    published ? 'Menu du jour récupéré' : 'Le menu du jour n\'est pas encore disponible'
  );
});

/**
 * GET /api/menu/table/:token/orders
 * Commandes en cours passees depuis cette table aujourd'hui.
 * Permet au client de retrouver son suivi même après avoir ferme la page.
 */
const getTableOrders = asyncHandler(async (req, res) => {
  const table = await loadTableByToken(req.params.token);

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: { tableId: table.id, createdAt: { gte: start } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: orderInclude,
  });

  return success(res, orders.map(serializeOrderForClient), 'Commandes de la table récupérées');
});

/**
 * GET /api/orders/track/:trackingToken
 * Suivi public d'une commande via son jeton non devinable.
 */
const trackOrder = asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { trackingToken: req.params.token },
    include: orderInclude,
  });
  if (!order) throw ApiError.notFound('Commande introuvable');

  const payload = serializeOrderForClient(order);

  // Fidélité et avis ne concernent le client qu'une fois la commande servie :
  // avant, il n'y a rien à afficher et la requête supplémentaire est évitée.
  if (order.status === 'SERVED') {
    const review = await prisma.review.findUnique({
      where: { orderId: order.id },
      select: { rating: true, comment: true },
    });
    payload.review = review || null;

    if (order.customerPhone) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: order.restaurantId },
        select: { loyaltyEnabled: true, loyaltyRewardThreshold: true, loyaltyRewardLabel: true },
      });
      if (restaurant.loyaltyEnabled) {
        const account = await findAccountByPhone(order.restaurantId, order.customerPhone);
        payload.loyalty = account
          ? {
              points: account.points,
              rewardsAvailable: account.rewardsAvailable,
              threshold: restaurant.loyaltyRewardThreshold,
              rewardLabel: restaurant.loyaltyRewardLabel,
            }
          : null;
      }
    }
  }

  return success(res, payload, 'Commande récupérée');
});

/**
 * POST /api/menu/promo/validate
 * Apercu public d'un code promo avant commande. La meme validation est
 * refaite plus tard, dans la transaction de creation de commande : cet appel
 * ne fait qu'afficher la remise au client, il ne l'engage pas.
 */
const validatePromo = asyncHandler(async (req, res) => {
  const { token, code, subtotal } = req.body;

  // Le jeton est soit celui d'une table, soit celui de l'affiche a emporter.
  let restaurant;
  const table = await prisma.restaurantTable.findUnique({ where: { token }, include: { restaurant: true } });
  if (table) {
    if (table.status !== 'ACTIVE') throw ApiError.forbidden('Cette table est actuellement désactivée.');
    if (!table.restaurant.isActive) throw ApiError.forbidden('Ce restaurant est momentanément fermé');
    restaurant = table.restaurant;
  } else {
    restaurant = await loadRestaurantByTakeawayToken(token);
  }

  const { promoCode, discountAmount } = await validateCode(prisma, restaurant.id, code, subtotal);

  return success(
    res,
    {
      valid: true,
      discountAmount,
      type: promoCode.type,
      value: toNumber(promoCode.value),
      code: promoCode.code,
    },
    'Code promo valide'
  );
});

module.exports = {
  loadTableByToken,
  loadRestaurantByTakeawayToken,
  getMenuByTableToken,
  getTakeawayMenu,
  getTableOrders,
  trackOrder,
  validatePromo,
};
