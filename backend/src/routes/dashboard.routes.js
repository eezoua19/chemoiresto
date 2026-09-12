const express = require('express');
const controller = require('../controllers/dashboard.controller');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', authMiddleware, roleMiddleware('ADMIN'), controller.stats);

module.exports = router;
