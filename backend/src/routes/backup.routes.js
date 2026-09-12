const express = require('express');
const controller = require('../controllers/backup.controller');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// Un export contient l'integralite des donnees du restaurant : reserve a
// l'administrateur, jamais accessible a une serveuse.
router.use(authMiddleware, roleMiddleware('ADMIN'));

router.get('/', controller.exporter);

module.exports = router;
