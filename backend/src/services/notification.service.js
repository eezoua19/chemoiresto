const prisma = require('../config/prisma');
const { emitToStaff, emitToUser } = require('../sockets');

/**
 * Crée une notification persistante et la pousse en temps réel.
 * @param {object} params
 * @param {number} params.restaurantId
 * @param {number} [params.userId] destinataire precis (sinon tout le personnel)
 * @param {string} params.type NEW_ORDER | ORDER_STATUS | CALL_SERVER | BILL_REQUEST | SYSTEM
 * @param {string} params.title
 * @param {string} [params.body]
 * @param {object} [params.data] charge utile sérialisée en JSON
 */
async function createNotification({ restaurantId, userId = null, type, title, body = null, data = null }) {
  const notification = await prisma.notification.create({
    data: {
      restaurantId,
      userId,
      type,
      title,
      body,
      data: data ? JSON.stringify(data) : null,
    },
  });

  const payload = { ...notification, data: data || null };

  if (userId) emitToUser(userId, 'notification', payload);
  else emitToStaff(restaurantId, 'notification', payload);

  return notification;
}

async function listNotifications(restaurantId, userId, { onlyUnread = false, limit = 50 } = {}) {
  return prisma.notification.findMany({
    where: {
      restaurantId,
      OR: [{ userId: null }, { userId }],
      ...(onlyUnread ? { isRead: false } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

async function markAsRead(id, restaurantId) {
  return prisma.notification.updateMany({
    where: { id, restaurantId },
    data: { isRead: true },
  });
}

async function markAllAsRead(restaurantId, userId) {
  return prisma.notification.updateMany({
    where: { restaurantId, OR: [{ userId: null }, { userId }], isRead: false },
    data: { isRead: true },
  });
}

module.exports = { createNotification, listNotifications, markAsRead, markAllAsRead };
