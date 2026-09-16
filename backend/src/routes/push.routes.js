const express = require('express');
const controller = require('../controllers/push.controller');
const validate = require('../middleware/validate');
const { authMiddleware } = require('../middleware/auth');
const { pushSubscribeSchema, pushUnsubscribeSchema } = require('../validators');

const router = express.Router();

router.use(authMiddleware);

router.post('/subscribe', validate({ body: pushSubscribeSchema }), controller.subscribe);
router.post('/unsubscribe', validate({ body: pushUnsubscribeSchema }), controller.unsubscribe);

module.exports = router;
