const express = require('express');
const controller = require('../controllers/dashboard.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { dashboardQuerySchema } = require('../validators');

const router = express.Router();

router.get(
  '/stats',
  authMiddleware,
  roleMiddleware('ADMIN'),
  validate({ query: dashboardQuerySchema }),
  controller.stats
);

module.exports = router;
