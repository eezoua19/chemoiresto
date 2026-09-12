const express = require('express');
const controller = require('../controllers/menu.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const {
  idParam,
  createMenuSchema,
  updateMenuSchema,
  duplicateMenuSchema,
  menuRangeQuerySchema,
  todayProductSchema,
  productIdParam,
} = require('../validators');

const router = express.Router();

router.use(authMiddleware);

router.get('/', validate({ query: menuRangeQuerySchema }), controller.list);
router.get('/today', controller.getToday);

// Raccourcis : mettre un plat au menu du jour sans passer par le calendrier.
// Declares avant "/:id" pour que "today" ne soit pas pris pour un identifiant.
router.post(
  '/today/products',
  roleMiddleware('ADMIN'),
  validate({ body: todayProductSchema }),
  controller.addProductToToday
);
router.delete(
  '/today/products/:productId',
  roleMiddleware('ADMIN'),
  validate({ params: productIdParam }),
  controller.removeProductFromToday
);

router.get('/date/:date', controller.getByDate);
router.get('/:id', validate({ params: idParam }), controller.detail);

router.post('/', roleMiddleware('ADMIN'), validate({ body: createMenuSchema }), controller.create);
router.post(
  '/:id/duplicate',
  roleMiddleware('ADMIN'),
  validate({ params: idParam, body: duplicateMenuSchema }),
  controller.duplicate
);

router.put(
  '/:id',
  roleMiddleware('ADMIN'),
  validate({ params: idParam, body: updateMenuSchema }),
  controller.update
);
router.delete('/:id', roleMiddleware('ADMIN'), validate({ params: idParam }), controller.remove);

module.exports = router;
