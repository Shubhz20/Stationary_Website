const router = require('express').Router();
const controller = require('./invoice.controller');
const { authenticate, requireRole } = require('../../middleware/auth');

router.get(
  '/orders/:orderId/invoice',
  authenticate,
  requireRole('client', 'admin'),
  controller.getInvoice
);

router.get(
  '/orders/:orderId/invoice/download',
  authenticate,
  requireRole('client', 'admin'),
  controller.downloadInvoice
);

module.exports = router;
