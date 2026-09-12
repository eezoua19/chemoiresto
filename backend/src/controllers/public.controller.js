const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const { today, formatDate } = require('../utils/helpers');
const { getMenuByDate, serializeMenuForClient } = require('../services/menu.service');
const { serializeOrderForClient, orderInclude } = require('../services/order.service');

/**
 * Charge une table a partir de son jeton QR Code et verifie qu'elle est active.
 * Fonction partagee par toutes les routes publiques (menu, commande, appel).
 */
async function loadTableByToken(token) {
  const table = await prisma.restaurantTable.findUnique({
    where: { token },
    include: { restaurant: true },
  });

  if (!table) throw ApiError.notFound('QR Code invalide ou table inconnue');
  if (table.status !== 'ACTIVE') {
    throw ApiError.forbidden('Cette table est actuellement desactivee. Appelez un serveur.');
  }
  if (!table.restaurant.isActive) {
    throw ApiError.forbidden('Ce restaurant est momentanement ferme');
  }

  return table;
}

/**
 * GET /api/menu/table/:token
 * Point d'entree du client apres le scan du QR Code.
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
      restaurant: {
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
      },
      table: {
        id: table.id,
        number: table.number,
        label: table.label,
        token: table.token,
      },
      date: formatDate(date),
      menu: serializeMenuForClient(published, restaurant),
    },
    published ? 'Menu du jour recupere' : 'Le menu du jour n\'est pas encore disponible'
  );
});

/**
 * GET /api/menu/table/:token/orders
 * Commandes en cours passees depuis cette table aujourd'hui.
 * Permet au client de retrouver son suivi meme apres avoir ferme la page.
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

  return success(res, orders.map(serializeOrderForClient), 'Commandes de la table recuperees');
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

  return success(res, serializeOrderForClient(order), 'Commande recuperee');
});

module.exports = { loadTableByToken, getMenuByTableToken, getTableOrders, trackOrder };
