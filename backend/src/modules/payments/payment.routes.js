const router = require('express').Router();
const controller = require('./payment.controller');
const { authenticate, requireRole } = require('../../middleware/auth');

// Razorpay webhook — public, but signature-verified inside the handler
// NOTE: This route needs raw body. Registered separately in app.js before json parser.
router.post('/payments/webhook', controller.webhook);

// Get payment for order
router.get(
  '/orders/:orderId/payment',
  authenticate,
  requireRole('client', 'admin'),
  controller.getPayment
);

// Initiate refund (admin only)
router.post(
  '/orders/:orderId/refund',
  authenticate,
  requireRole('admin'),
  controller.initiateRefund
);

module.exports = router;
