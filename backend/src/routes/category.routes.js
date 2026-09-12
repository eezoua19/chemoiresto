const express = require('express');
const controller = require('../controllers/category.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const {
  idParam,
  createCategorySchema,
  updateCategorySchema,
  reorderSchema,
} = require('../validators');

const router = express.Router();

router.use(authMiddleware);

// La lecture est ouverte au personnel, l'ecriture reservee a l'administrateur.
router.get('/', controller.list);

router.post('/', roleMiddleware('ADMIN'), validate({ body: createCategorySchema }), controller.create);
router.put('/reorder', roleMiddleware('ADMIN'), validate({ body: reorderSchema }), controller.reorder);
router.put(
  '/:id',
  roleMiddleware('ADMIN'),
  validate({ params: idParam, body: updateCategorySchema }),
  controller.update
);
router.delete('/:id', roleMiddleware('ADMIN'), validate({ params: idParam }), controller.remove);

module.exports = router;
