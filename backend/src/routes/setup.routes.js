const express = require('express');
const controller = require('../controllers/setup.controller');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

/**
 * Contrôle de mise en service : ce qui empêche un client de commander.
 * Réservé à l'administration, qui est la seule à pouvoir y remédier.
 */
const router = express.Router();

router.use(authMiddleware, roleMiddleware('ADMIN'));

router.get('/', controller.controles);
router.post('/tables/activate', controller.activerLesTables);

module.exports = router;
