const express = require('express');
const controller = require('../controllers/backup.controller');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { idParam } = require('../validators');

const router = express.Router();

// Un export contient l'integralite des données du restaurant : reserve a
// l'administrateur, jamais accessible à une serveuse.
router.use(authMiddleware, roleMiddleware('ADMIN'));

router.get('/', controller.exporter);
router.get('/list', controller.list);
router.post('/', controller.run);
router.get('/:id/download', validate({ params: idParam }), controller.download);

module.exports = router;
