const express = require('express');
const controller = require('../controllers/serviceRequest.controller');
const validate = require('../middleware/validate');
const { authMiddleware } = require('../middleware/auth');
const { serviceRequestLimiter } = require('../middleware/rateLimit');
const {
  idParam,
  createServiceRequestSchema,
  updateServiceRequestSchema,
} = require('../validators');

const router = express.Router();

// Publique : le client appelle une serveuse ou demande l'addition.
router.post(
  '/',
  serviceRequestLimiter,
  validate({ body: createServiceRequestSchema }),
  controller.create
);

// Personnel
router.use(authMiddleware);

router.get('/', controller.list);
router.put(
  '/:id/status',
  validate({ params: idParam, body: updateServiceRequestSchema }),
  controller.updateStatus
);

module.exports = router;
