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

const router = express.Router();

router.get('/health', (_req, res) =>
  res.json({ success: true, message: 'API operationnelle', data: { time: new Date().toISOString() } })
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

module.exports = router;
