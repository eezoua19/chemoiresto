const express = require('express');
const controller = require('../controllers/notification.controller');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

router.get('/', controller.list);
router.put('/read-all', controller.markAllRead);
router.put('/:id/read', controller.markRead);

module.exports = router;
