const express = require('express');
const controller = require('../controllers/order.controller');
const publicController = require('../controllers/public.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { orderLimiter } = require('../middleware/rateLimit');
const {
  idParam,
  tokenParam,
  createOrderSchema,
  updateOrderStatusSchema,
  assignOrderSchema,
  ordersQuerySchema,
} = require('../validators');

const router = express.Router();

// ---- Routes publiques (client) -------------------------------------------
router.post('/', orderLimiter, validate({ body: createOrderSchema }), controller.create);
router.get('/track/:token', validate({ params: tokenParam }), publicController.trackOrder);

// ---- Routes protegees (personnel) ----------------------------------------
router.use(authMiddleware);

router.get('/', validate({ query: ordersQuerySchema }), controller.list);
router.get('/board', controller.board);
router.get('/:id', validate({ params: idParam }), controller.detail);

router.put(
  '/:id/status',
  validate({ params: idParam, body: updateOrderStatusSchema }),
  controller.updateStatus
);

router.put(
  '/:id/assign',
  roleMiddleware('ADMIN'),
  validate({ params: idParam, body: assignOrderSchema }),
  controller.assign
);

module.exports = router;
