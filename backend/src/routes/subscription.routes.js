const express = require('express');
const controller = require('../controllers/subscription.controller');
const validate = require('../middleware/validate');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const {
  idParam,
  tokenParam,
  createSubscriptionSchema,
  updateSubscriptionSchema,
  subscriptionStatusSchema,
  renewSubscriptionSchema,
  subscriptionUseSchema,
  subscriptionsQuerySchema,
  subscriptionLookupSchema,
} = require('../validators');

/**
 * Abonnements CHEMOIRESTO.
 *
 * L'abonne n'a ni compte ni mot de passe : il n'existe donc AUCUNE route
 * publique ici. Tout passe par le personnel connecte, et la gestion elle-meme
 * est reservee a l'administration.
 */
const router = express.Router();

router.use(authMiddleware);

// ---- Verification au comptoir (ADMIN et serveuses) -----------------------
router.get('/verify/:token', validate({ params: tokenParam }), controller.verify);
router.get('/lookup', validate({ query: subscriptionLookupSchema }), controller.lookup);
router.post(
  '/verify/:token/use',
  validate({ params: tokenParam, body: subscriptionUseSchema }),
  controller.use
);

// ---- Gestion (ADMIN uniquement) ------------------------------------------
router.use(roleMiddleware('ADMIN'));

router.get('/', validate({ query: subscriptionsQuerySchema }), controller.list);
router.get('/stats', controller.stats);
router.post('/', validate({ body: createSubscriptionSchema }), controller.create);
router.get('/:id', validate({ params: idParam }), controller.detail);
router.get('/:id/ticket', validate({ params: idParam }), controller.ticket);
router.put('/:id', validate({ params: idParam, body: updateSubscriptionSchema }), controller.update);
router.patch(
  '/:id/status',
  validate({ params: idParam, body: subscriptionStatusSchema }),
  controller.setStatus
);
// Suppression definitive : la confirmation se fait cote interface, le serveur
// se contente d'exiger le role ADMIN.
router.delete('/:id', validate({ params: idParam }), controller.remove);

router.post(
  '/:id/renew',
  validate({ params: idParam, body: renewSubscriptionSchema }),
  controller.renew
);

module.exports = router;
