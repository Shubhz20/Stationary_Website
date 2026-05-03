const Joi = require('joi');

const updateProfileSchema = Joi.object({
  name: Joi.string().trim().max(100),
  phone: Joi.string()
    .trim()
    .pattern(/^\+91[6-9]\d{9}$/)
    .message('Phone must be a valid Indian mobile number (+91XXXXXXXXXX)'),
}).min(1); // At least one field required

const createCompanySchema = Joi.object({
  name: Joi.string().trim().max(200).required(),
  gstin: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .message('Invalid GSTIN format')
    .allow(null, ''),
  pan: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/)
    .message('Invalid PAN format')
    .allow(null, ''),
  billingAddress: Joi.object({
    line1: Joi.string().trim().required(),
    line2: Joi.string().trim().allow('').default(''),
    city: Joi.string().trim().required(),
    state: Joi.string().trim().required(),
    pincode: Joi.string().trim().pattern(/^\d{6}$/).required(),
    country: Joi.string().trim().default('India'),
  }).required(),
  shippingAddresses: Joi.array()
    .items(
      Joi.object({
        line1: Joi.string().trim().required(),
        line2: Joi.string().trim().allow('').default(''),
        city: Joi.string().trim().required(),
        state: Joi.string().trim().required(),
        pincode: Joi.string().trim().pattern(/^\d{6}$/).required(),
        country: Joi.string().trim().default('India'),
      })
    )
    .max(10)
    .default([]),
  contactEmail: Joi.string().trim().email().required(),
  contactPhone: Joi.string()
    .trim()
    .pattern(/^\+91[6-9]\d{9}$/)
    .required(),
});

const updateCompanySchema = Joi.object({
  name: Joi.string().trim().max(200),
  gstin: Joi.string().trim().uppercase().allow(null, ''),
  pan: Joi.string().trim().uppercase().allow(null, ''),
  billingAddress: Joi.object({
    line1: Joi.string().trim().required(),
    line2: Joi.string().trim().allow('').default(''),
    city: Joi.string().trim().required(),
    state: Joi.string().trim().required(),
    pincode: Joi.string().trim().pattern(/^\d{6}$/).required(),
    country: Joi.string().trim().default('India'),
  }),
  shippingAddresses: Joi.array().max(10),
  contactEmail: Joi.string().trim().email(),
  contactPhone: Joi.string().trim(),
  // Admin-only fields (validated at controller level)
  creditLimit: Joi.number().min(0),
  paymentTermsDays: Joi.number().min(0),
}).min(1);

module.exports = {
  updateProfileSchema,
  createCompanySchema,
  updateCompanySchema,
};
