const Joi = require('joi');

const addToCartSchema = Joi.object({
  productId: Joi.string().hex().length(24).required(),
  quantity: Joi.number().integer().min(1).required(),
});

const updateCartItemSchema = Joi.object({
  quantity: Joi.number().integer().min(1).required(),
});

const checkoutSchema = Joi.object({
  shippingAddressIndex: Joi.number().integer().min(0),
  shippingAddress: Joi.object({
    line1: Joi.string().trim().required(),
    line2: Joi.string().trim().allow('').default(''),
    city: Joi.string().trim().required(),
    state: Joi.string().trim().required(),
    pincode: Joi.string().trim().pattern(/^\d{6}$/).required(),
    country: Joi.string().trim().default('India'),
  }),
  paymentMethod: Joi.string().valid('razorpay', 'credit').required(),
  notes: Joi.string().trim().max(500).allow('').default(''),
})
  .xor('shippingAddressIndex', 'shippingAddress')
  .messages({
    'object.xor': 'Provide either shippingAddressIndex or shippingAddress, not both',
  });

const verifyPaymentSchema = Joi.object({
  razorpayPaymentId: Joi.string().required(),
  razorpayOrderId: Joi.string().required(),
  razorpaySignature: Joi.string().required(),
});

const cancelOrderSchema = Joi.object({
  reason: Joi.string().trim().max(500).allow('').default(''),
});

const listOrdersSchema = Joi.object({
  status: Joi.string().valid(
    'pending_payment', 'confirmed', 'processing', 'shipped',
    'out_for_delivery', 'delivered', 'cancelled', 'rejected', 'refunded'
  ),
  cursor: Joi.string().isoDate(),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

module.exports = {
  addToCartSchema,
  updateCartItemSchema,
  checkoutSchema,
  verifyPaymentSchema,
  cancelOrderSchema,
  listOrdersSchema,
};
