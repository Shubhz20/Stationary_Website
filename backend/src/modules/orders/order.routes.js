const router = require('express').Router();
const controller = require('./order.controller');
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const {
  addToCartSchema,
  updateCartItemSchema,
  checkoutSchema,
  verifyPaymentSchema,
  cancelOrderSchema,
  listOrdersSchema,
} = require('./order.validator');

// ── Cart (client only) ──
router.get('/cart', authenticate, requireRole('client'), controller.getCart);

router.post(
  '/cart/items',
  authenticate,
  requireRole('client'),
  validate(addToCartSchema, 'body'),
  controller.addToCart
);

router.patch(
  '/cart/items/:itemId',
  authenticate,
  requireRole('client'),
  validate(updateCartItemSchema, 'body'),
  controller.updateCartItem
);

router.delete('/cart/items/:itemId', authenticate, requireRole('client'), controller.removeCartItem);

router.delete('/cart', authenticate, requireRole('client'), controller.clearCart);

// ── Orders ──
router.post(
  '/orders',
  authenticate,
  requireRole('client'),
  validate(checkoutSchema, 'body'),
  controller.checkout
);

router.post(
  '/orders/:orderId/verify-payment',
  authenticate,
  requireRole('client'),
  validate(verifyPaymentSchema, 'body'),
  controller.verifyPayment
);

router.get(
  '/orders',
  authenticate,
  requireRole('client'),
  validate(listOrdersSchema, 'query'),
  controller.listMyOrders
);

router.get('/orders/:orderId', authenticate, controller.getOrder);

router.post(
  '/orders/:orderId/cancel',
  authenticate,
  requireRole('client'),
  validate(cancelOrderSchema, 'body'),
  controller.cancelOrder
);

module.exports = router;
