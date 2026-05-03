const paymentService = require('./payment.service');
const asyncHandler = require('../../common/asyncHandler');

/**
 * Razorpay webhook handler.
 * Body must be raw (not parsed as JSON) for signature verification.
 */
const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  await paymentService.handleWebhook(req.rawBody, signature);
  // Always respond 200 to Razorpay
  res.json({ success: true });
});

const getPayment = asyncHandler(async (req, res) => {
  const payment = await paymentService.getPaymentForOrder(req.params.orderId);
  res.json({ success: true, data: { payment } });
});

const initiateRefund = asyncHandler(async (req, res) => {
  const refund = await paymentService.initiateRefund(
    req.params.orderId,
    req.body.amount,
    req.body.reason
  );
  res.json({ success: true, data: { refund } });
});

module.exports = { webhook, getPayment, initiateRefund };
