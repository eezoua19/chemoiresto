const prisma = require('../config/prisma');
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

module.exports = { subscribe, unsubscribe };
