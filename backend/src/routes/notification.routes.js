const express = require('express');
const controller = require('../controllers/notification.controller');
const validate = require('../middleware/validate');
const { authMiddleware } = require('../middleware/auth');
const { idParam } = require('../validators');

const router = express.Router();

router.use(authMiddleware);

router.get('/', controller.list);
router.put('/read-all', controller.markAllRead);
router.put('/:id/read', validate({ params: idParam }), controller.markRead);

module.exports = router;
