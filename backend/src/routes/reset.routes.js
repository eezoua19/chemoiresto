const express = require('express');
const controller = require('../controllers/reset.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { resetSchema } = require('../validators');

/**
 * Remise a zero : le geste le plus destructeur de l'application.
 * ADMIN uniquement, et jamais sans confirmation nominative.
 */
const router = express.Router();

router.use(authMiddleware, roleMiddleware('ADMIN'));

router.post('/', validate({ body: resetSchema }), controller.remiseAZero);

module.exports = router;
