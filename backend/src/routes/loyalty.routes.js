const express = require('express');
const controller = require('../controllers/loyalty.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { idParam, loyaltyQuerySchema, loyaltyAdjustSchema } = require('../validators');

const router = express.Router();

router.use(authMiddleware);

router.get('/', validate({ query: loyaltyQuerySchema }), controller.list);
router.get('/:id', validate({ params: idParam }), controller.detail);
router.post('/:id/redeem', validate({ params: idParam }), controller.redeem);
router.post(
  '/:id/adjust',
  roleMiddleware('ADMIN'),
  validate({ params: idParam, body: loyaltyAdjustSchema }),
  controller.adjust
);

module.exports = router;
