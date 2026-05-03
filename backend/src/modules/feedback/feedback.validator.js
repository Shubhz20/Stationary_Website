const Joi = require('joi');

const submitReviewSchema = Joi.object({
  productId: Joi.string().hex().length(24).required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  title: Joi.string().trim().max(200).allow('').default(''),
  comment: Joi.string().trim().max(2000).allow('').default(''),
});

const adminRespondSchema = Joi.object({
  adminResponse: Joi.string().trim().max(1000).required(),
});

module.exports = { submitReviewSchema, adminRespondSchema };
