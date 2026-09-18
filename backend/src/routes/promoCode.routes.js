const express = require('express');
const controller = require('../controllers/promoCode.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { idParam, createPromoCodeSchema, updatePromoCodeSchema } = require('../validators');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('ADMIN'));

router.get('/', controller.list);
router.post('/', validate({ body: createPromoCodeSchema }), controller.create);
router.put('/:id', validate({ params: idParam, body: updatePromoCodeSchema }), controller.update);
router.delete('/:id', validate({ params: idParam }), controller.remove);

module.exports = router;
