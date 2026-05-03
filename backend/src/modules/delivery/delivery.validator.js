const Joi = require('joi');

const assignDeliverySchema = Joi.object({
  partnerId: Joi.string().hex().length(24).required(),
  estimatedDeliveryAt: Joi.date().iso().greater('now').allow(null).default(null),
});

const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid('picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_attempt', 'returned')
    .required(),
  note: Joi.string().trim().max(500).allow('').default(''),
  location: Joi.object({
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).allow(null),
});

const updateLocationSchema = Joi.object({
  coordinates: Joi.array().items(Joi.number()).length(2).required(),
});

const deliveryProofSchema = Joi.object({
  receiverName: Joi.string().trim().max(100).required(),
  receiverPhone: Joi.string().trim().allow('').default(''),
});

module.exports = {
  assignDeliverySchema,
  updateStatusSchema,
  updateLocationSchema,
  deliveryProofSchema,
};
