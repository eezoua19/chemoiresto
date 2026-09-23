const express = require('express');
const controller = require('../controllers/restaurant.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { upload, optimiserImage } = require('../middleware/upload');
const { updateRestaurantSchema, takeawaySchema } = require('../validators');

const router = express.Router();

router.use(authMiddleware);

router.get('/', controller.detail);
router.put(
  '/',
  roleMiddleware('ADMIN'),
  upload.single('logo'),
  optimiserImage,
  validate({ body: updateRestaurantSchema }),
  controller.update
);

router.patch(
  '/emporter',
  roleMiddleware('ADMIN'),
  validate({ body: takeawaySchema }),
  controller.setTakeaway
);

module.exports = router;
