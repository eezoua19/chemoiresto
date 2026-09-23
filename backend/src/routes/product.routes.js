const express = require('express');
const controller = require('../controllers/product.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { upload, optimiserImage } = require('../middleware/upload');
const { idParam, createProductSchema, updateProductSchema } = require('../validators');

const router = express.Router();

router.use(authMiddleware);

router.get('/', controller.list);
router.get('/:id', validate({ params: idParam }), controller.detail);

router.post(
  '/',
  roleMiddleware('ADMIN'),
  upload.single('image'),
  optimiserImage,
  validate({ body: createProductSchema }),
  controller.create
);

router.put(
  '/:id',
  roleMiddleware('ADMIN'),
  upload.single('image'),
  optimiserImage,
  validate({ params: idParam, body: updateProductSchema }),
  controller.update
);

// La serveuse peut basculer la disponibilite d'un plat en salle (rupture).
router.patch('/:id/availability', validate({ params: idParam }), controller.toggleAvailability);

router.delete('/:id', roleMiddleware('ADMIN'), validate({ params: idParam }), controller.remove);

module.exports = router;
