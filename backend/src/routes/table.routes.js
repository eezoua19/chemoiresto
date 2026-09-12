const express = require('express');
const controller = require('../controllers/table.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { idParam, createTableSchema, updateTableSchema } = require('../validators');

const router = express.Router();

router.use(authMiddleware);

router.get('/', controller.list);
router.get('/qrcodes/all', roleMiddleware('ADMIN'), controller.listQRCodes);
router.get('/:id', validate({ params: idParam }), controller.detail);
router.get('/:id/qrcode', roleMiddleware('ADMIN'), validate({ params: idParam }), controller.getQRCode);

router.post('/', roleMiddleware('ADMIN'), validate({ body: createTableSchema }), controller.create);
router.post(
  '/:id/qrcode',
  roleMiddleware('ADMIN'),
  validate({ params: idParam }),
  controller.generateQRCode
);
router.post(
  '/:id/qrcode/regenerate',
  roleMiddleware('ADMIN'),
  validate({ params: idParam }),
  controller.regenerateQRCode
);

router.put(
  '/:id',
  roleMiddleware('ADMIN'),
  validate({ params: idParam, body: updateTableSchema }),
  controller.update
);
router.patch(
  '/:id/status',
  roleMiddleware('ADMIN'),
  validate({ params: idParam }),
  controller.toggleStatus
);
router.delete('/:id', roleMiddleware('ADMIN'), validate({ params: idParam }), controller.remove);

module.exports = router;
