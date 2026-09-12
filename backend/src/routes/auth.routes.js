const express = require('express');
const controller = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { authMiddleware } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const { loginSchema } = require('../validators');

const router = express.Router();

router.post('/login', loginLimiter, validate({ body: loginSchema }), controller.login);
router.get('/me', authMiddleware, controller.me);
router.post('/logout', authMiddleware, controller.logout);

module.exports = router;
