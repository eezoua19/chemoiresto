const express = require('express');
const controller = require('../controllers/user.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const {
  idParam,
  createServerSchema,
  updateServerSchema,
  resetPasswordSchema,
} = require('../validators');

const router = express.Router();

router.use(authMiddleware);

// La liste des serveuses est utile à l'attribution des commandes.
router.get('/servers', controller.list);

router.use('/servers', roleMiddleware('ADMIN'));

router.post('/servers', validate({ body: createServerSchema }), controller.create);
router.get('/servers/:id/activity', validate({ params: idParam }), controller.activity);
router.put('/servers/:id', validate({ params: idParam, body: updateServerSchema }), controller.update);
router.put(
  '/servers/:id/password',
  validate({ params: idParam, body: resetPasswordSchema }),
  controller.resetPassword
);
router.delete('/servers/:id', validate({ params: idParam }), controller.remove);

module.exports = router;
