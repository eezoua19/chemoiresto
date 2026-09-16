const express = require('express');
const controller = require('../controllers/push.controller');
const validate = require('../middleware/validate');
const { authMiddleware } = require('../middleware/auth');
const { pushClientLimiter } = require('../middleware/rateLimit');
const {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  pushSubscribeClientSchema,
  pushUnsubscribeClientSchema,
} = require('../validators');

const router = express.Router();

// ---- Routes publiques (client, sans compte) -------------------------------
router.post(
  '/subscribe-client',
  pushClientLimiter,
  validate({ body: pushSubscribeClientSchema }),
  controller.subscribeClient
);
router.post(
  '/unsubscribe-client',
  pushClientLimiter,
  validate({ body: pushUnsubscribeClientSchema }),
  controller.unsubscribeClient
);

// ---- Routes protegees (personnel) ------------------------------------------
router.use(authMiddleware);

router.post('/subscribe', validate({ body: pushSubscribeSchema }), controller.subscribe);
router.post('/unsubscribe', validate({ body: pushUnsubscribeSchema }), controller.unsubscribe);

module.exports = router;
