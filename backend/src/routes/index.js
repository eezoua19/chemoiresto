const express = require('express');

const authRoutes = require('./auth.routes');
const categoryRoutes = require('./category.routes');
const productRoutes = require('./product.routes');
const tableRoutes = require('./table.routes');
const menuRoutes = require('./menu.routes');
const orderRoutes = require('./order.routes');
const userRoutes = require('./user.routes');
const dashboardRoutes = require('./dashboard.routes');
const serviceRequestRoutes = require('./serviceRequest.routes');
const notificationRoutes = require('./notification.routes');
const restaurantRoutes = require('./restaurant.routes');
const publicRoutes = require('./public.routes');
const backupRoutes = require('./backup.routes');
const subscriptionRoutes = require('./subscription.routes');
const auditRoutes = require('./audit.routes');
const closingRoutes = require('./closing.routes');
const resetRoutes = require('./reset.routes');

const { journalMiddleware } = require('../middleware/journal');

const router = express.Router();

// Observe les reponses reussies et trace les actions de gestion.
router.use(journalMiddleware);

router.get('/health', (_req, res) =>
  res.json({ success: true, message: 'API opérationnelle', data: { time: new Date().toISOString() } })
);

// Routes publiques (client, sans compte)
router.use('/menu', publicRoutes);

// Routes protegees
router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/tables', tableRoutes);
router.use('/menus', menuRoutes);
router.use('/orders', orderRoutes);
router.use('/users', userRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/service-requests', serviceRequestRoutes);
router.use('/notifications', notificationRoutes);
router.use('/restaurant', restaurantRoutes);
router.use('/backup', backupRoutes);
router.use('/subscriptions', subscriptionRoutes);
router.use('/audit', auditRoutes);
router.use('/closings', closingRoutes);
router.use('/reset', resetRoutes);

module.exports = router;
