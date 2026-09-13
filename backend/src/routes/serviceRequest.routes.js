const express = require('express');
const controller = require('../controllers/serviceRequest.controller');
const validate = require('../middleware/validate');
const { authMiddleware } = require('../middleware/auth');
const { serviceRequestLimiter } = require('../middleware/rateLimit');
const {
  idParam,
  createServiceRequestSchema,
  remindServiceRequestSchema,
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

// Publique : le client relance quand personne n'est venu.
router.post(
  '/remind',
  serviceRequestLimiter,
  validate({ body: remindServiceRequestSchema }),
  controller.remind
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
