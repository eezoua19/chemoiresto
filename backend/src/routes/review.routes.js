const express = require('express');
const controller = require('../controllers/review.controller');
const validate = require('../middleware/validate');
const { authMiddleware } = require('../middleware/auth');
const { reviewLimiter } = require('../middleware/rateLimit');
const { createReviewSchema, reviewsQuerySchema } = require('../validators');

const router = express.Router();

// Publique : le client note sa commande une fois servie.
router.post('/', reviewLimiter, validate({ body: createReviewSchema }), controller.create);

// Personnel
router.use(authMiddleware);

router.get('/', validate({ query: reviewsQuerySchema }), controller.list);

module.exports = router;
