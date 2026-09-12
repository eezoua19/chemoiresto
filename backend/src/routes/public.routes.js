const express = require('express');
const controller = require('../controllers/public.controller');
const serviceRequestController = require('../controllers/serviceRequest.controller');
const validate = require('../middleware/validate');
const { tokenParam } = require('../validators');

/**
 * Routes publiques accessibles sans compte : c'est le parcours du client
 * apres le scan du QR Code de sa table.
 * Montees sous /api/menu.
 */
const router = express.Router();

router.get('/table/:token', validate({ params: tokenParam }), controller.getMenuByTableToken);
router.get('/table/:token/orders', validate({ params: tokenParam }), controller.getTableOrders);
router.get(
  '/table/:token/service-requests',
  validate({ params: tokenParam }),
  serviceRequestController.listForTable
);

module.exports = router;
