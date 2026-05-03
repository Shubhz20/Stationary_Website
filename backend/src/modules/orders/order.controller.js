const orderService = require('./order.service');
const paymentService = require('../payments/payment.service');
const asyncHandler = require('../../common/asyncHandler');
const config = require('../../config/env');

// ── Cart ──

const getCart = asyncHandler(async (req, res) => {
  const cart = await orderService.getCart(req.user._id);
  res.json({ success: true, data: { cart } });
});

const addToCart = asyncHandler(async (req, res) => {
  const cart = await orderService.addToCart(req.user._id, req.body.productId, req.body.quantity);
  res.json({ success: true, data: { cart } });
});

const updateCartItem = asyncHandler(async (req, res) => {
  const cart = await orderService.updateCartItem(req.user._id, req.params.itemId, req.body.quantity);
  res.json({ success: true, data: { cart } });
});

const removeCartItem = asyncHandler(async (req, res) => {
  const cart = await orderService.removeCartItem(req.user._id, req.params.itemId);
  res.json({ success: true, data: { cart } });
});

const clearCart = asyncHandler(async (req, res) => {
  const cart = await orderService.clearCart(req.user._id);
  res.json({ success: true, data: { cart } });
});

// ── Checkout ──

const checkout = asyncHandler(async (req, res) => {
  const socketEmitter = req.app.get('socketEmitter');
  const order = await orderService.checkout(req.user._id, req.body, socketEmitter);

  const responseData = { order };

  // If Razorpay, create payment order
  if (req.body.paymentMethod === 'razorpay') {
    const payment = await paymentService.createRazorpayOrder(order);
    responseData.payment = {
      razorpayOrderId: payment.razorpayOrderId,
      amount: payment.amount,
      currency: payment.currency,
      keyId: config.razorpay.keyId,
    };
  }

  res.status(201).json({ success: true, data: responseData });
});

const verifyPayment = asyncHandler(async (req, res) => {
  const socketEmitter = req.app.get('socketEmitter');
  const order = await paymentService.verifyPayment(
    req.params.orderId,
    req.body,
    socketEmitter
  );
  res.json({ success: true, data: { order: { _id: order._id, orderNumber: order.orderNumber, status: order.status } } });
});

// ── Order queries ──

const listMyOrders = asyncHandler(async (req, res) => {
  const result = await orderService.listClientOrders(req.user._id, req.query);
  res.json({ success: true, data: { orders: result.orders }, meta: result.meta });
});

const getOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getOrder(req.params.orderId, req.user);
  res.json({ success: true, data: { order } });
});

const cancelOrder = asyncHandler(async (req, res) => {
  const order = await orderService.cancelOrder(req.params.orderId, req.user._id, req.body.reason);
  res.json({ success: true, data: { order } });
});

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
  checkout,
  verifyPayment,
  listMyOrders,
  getOrder,
  cancelOrder,
};
