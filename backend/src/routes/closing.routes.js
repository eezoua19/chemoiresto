const express = require('express');
const controller = require('../controllers/closing.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { closingsQuerySchema, exportClosingsSchema, dateParam } = require('../validators');

/**
 * Les recettes du restaurant ne regardent que l'administration.
 */
const router = express.Router();

router.use(authMiddleware, roleMiddleware('ADMIN'));

router.get('/', validate({ query: closingsQuerySchema }), controller.list);
// Avant "/:date", sinon "today"/"export" seraient pris pour une date.
router.get('/today', controller.enCours);
router.get('/export/pdf', validate({ query: exportClosingsSchema }), controller.exporterComptable);
router.get('/:date', validate({ params: dateParam }), controller.detail);
router.post('/:date', validate({ params: dateParam }), controller.fermer);

module.exports = router;
