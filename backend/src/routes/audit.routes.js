const express = require('express');
const controller = require('../controllers/audit.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { auditQuerySchema } = require('../validators');

/**
 * Le journal dit qui a fait quoi : il n'a rien a faire dans les mains du
 * personnel de salle. ADMIN uniquement, et en lecture seule.
 */
const router = express.Router();

router.use(authMiddleware, roleMiddleware('ADMIN'));

router.get('/', validate({ query: auditQuerySchema }), controller.list);
router.get('/filters', controller.filters);

module.exports = router;
