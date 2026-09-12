const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');
const service = require('../services/notification.service');

/** GET /api/notifications */
const list = asyncHandler(async (req, res) => {
  const notifications = await service.listNotifications(req.user.restaurantId, req.user.id, {
    onlyUnread: req.query.unread === 'true',
    limit: Math.min(Number(req.query.limit) || 50, 100),
  });

  return success(
    res,
    notifications.map((notification) => ({
      ...notification,
      data: notification.data ? JSON.parse(notification.data) : null,
    })),
    'Notifications récupérées'
  );
});

/** PUT /api/notifications/:id/read */
const markRead = asyncHandler(async (req, res) => {
  await service.markAsRead(Number(req.params.id), req.user.restaurantId);
  return success(res, null, 'Notification marquée comme lue');
});

/** PUT /api/notifications/read-all */
const markAllRead = asyncHandler(async (req, res) => {
  await service.markAllAsRead(req.user.restaurantId, req.user.id);
  return success(res, null, 'Toutes les notifications ont été marquées comme lues');
});

module.exports = { list, markRead, markAllRead };
