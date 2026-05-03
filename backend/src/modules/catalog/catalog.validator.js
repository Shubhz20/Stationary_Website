const Joi = require('joi');

const createProductSchema = Joi.object({
  name: Joi.string().trim().max(200).required(),
  description: Joi.string().trim().max(2000).allow('').default(''),
  category: Joi.string().trim().required(),
  subcategory: Joi.string().trim().allow(null, '').default(null),
  brand: Joi.string().trim().allow(null, '').default(null),
  tags: Joi.array().items(Joi.string().trim()).max(20).default([]),
  basePrice: Joi.number().integer().min(0).required(),
  priceTiers: Joi.array()
    .items(
      Joi.object({
        minQty: Joi.number().integer().min(1).required(),
        maxQty: Joi.number().integer().min(1).allow(null).default(null),
        pricePerUnit: Joi.number().integer().min(0).required(),
      })
    )
    .default([]),
  gstRate: Joi.number().valid(0, 5, 12, 18, 28).default(18),
  hsnCode: Joi.string().trim().allow(null, '').default(null),
  stock: Joi.number().integer().min(0).default(0),
  lowStockThreshold: Joi.number().integer().min(0).default(50),
  minOrderQty: Joi.number().integer().min(1).default(1),
  maxOrderQty: Joi.number().integer().min(1).default(10000),
  unit: Joi.string().valid('piece', 'pack', 'box', 'ream', 'dozen', 'set').default('piece'),
  attributes: Joi.object().pattern(Joi.string(), Joi.string()).default({}),
});

const updateProductSchema = Joi.object({
  name: Joi.string().trim().max(200),
  description: Joi.string().trim().max(2000).allow(''),
  category: Joi.string().trim(),
  subcategory: Joi.string().trim().allow(null, ''),
  brand: Joi.string().trim().allow(null, ''),
  tags: Joi.array().items(Joi.string().trim()).max(20),
  basePrice: Joi.number().integer().min(0),
  priceTiers: Joi.array().items(
    Joi.object({
      minQty: Joi.number().integer().min(1).required(),
      maxQty: Joi.number().integer().min(1).allow(null).default(null),
      pricePerUnit: Joi.number().integer().min(0).required(),
    })
  ),
  gstRate: Joi.number().valid(0, 5, 12, 18, 28),
  hsnCode: Joi.string().trim().allow(null, ''),
  stock: Joi.number().integer().min(0),
  lowStockThreshold: Joi.number().integer().min(0),
  minOrderQty: Joi.number().integer().min(1),
  maxOrderQty: Joi.number().integer().min(1),
  unit: Joi.string().valid('piece', 'pack', 'box', 'ream', 'dozen', 'set'),
  attributes: Joi.object().pattern(Joi.string(), Joi.string()),
  isActive: Joi.boolean(),
}).min(1);

const listProductsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  category: Joi.string().trim(),
  subcategory: Joi.string().trim(),
  brand: Joi.string().trim(),
  search: Joi.string().trim().max(200),
  minPrice: Joi.number().integer().min(0),
  maxPrice: Joi.number().integer().min(0),
  inStock: Joi.boolean(),
  sort: Joi.string().valid('name', '-name', 'basePrice', '-basePrice', '-createdAt', 'avgRating').default('-createdAt'),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  listProductsSchema,
};
