const prisma = require('../config/prisma');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');

/** POST /api/push/subscribe (personnel) - upsert par endpoint : un meme navigateur peut se réabonner sans dupliquer. */
const subscribe = asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body;

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      restaurantId: req.user.restaurantId,
      userId: req.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: (req.headers['user-agent'] || '').slice(0, 255) || null,
    },
    update: {
      userId: req.user.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  return created(res, { id: subscription.id }, 'Notifications push activées');
});

/** POST /api/push/unsubscribe (personnel) */
const unsubscribe = asyncHandler(async (req, res) => {
  const { endpoint } = req.body;
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
  return success(res, null, 'Notifications push désactivées');
});

/**
 * POST /api/push/subscribe-client (route publique)
 *
 * Le client n'a pas de compte : l'abonnement est rattache a la commande
 * qu'il suit via son jeton (meme autorisation que le suivi de commande),
 * pas a un utilisateur. Upsert par endpoint : reouvrir la page de suivi
 * pour une nouvelle commande sur le meme appareil deplace simplement
 * l'abonnement existant vers cette commande.
 */
const subscribeClient = asyncHandler(async (req, res) => {
  const { trackingToken, endpoint, keys } = req.body;

  const order = await prisma.order.findUnique({
    where: { trackingToken },
    select: { id: true, restaurantId: true },
  });
  if (!order) throw ApiError.notFound('Commande introuvable');

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      restaurantId: order.restaurantId,
      orderId: order.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: (req.headers['user-agent'] || '').slice(0, 255) || null,
    },
    update: {
      restaurantId: order.restaurantId,
      orderId: order.id,
      userId: null,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  return created(res, { id: subscription.id }, 'Notifications activées');
});

/** POST /api/push/unsubscribe-client (route publique) */
const unsubscribeClient = asyncHandler(async (req, res) => {
  const { endpoint } = req.body;
  await prisma.pushSubscription.deleteMany({ where: { endpoint, orderId: { not: null } } });
  return success(res, null, 'Notifications désactivées');
});

module.exports = { subscribe, unsubscribe, subscribeClient, unsubscribeClient };
