const router = require('express').Router();
const controller = require('./catalog.controller');
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { productUpload } = require('../../middleware/upload');
const {
  createProductSchema,
  updateProductSchema,
  listProductsSchema,
} = require('./catalog.validator');

// ── Public ──
router.get(
  '/products',
  validate(listProductsSchema, 'query'),
  controller.listProducts
);

router.get('/products/categories', controller.getCategories);

router.get('/products/:slug', controller.getProduct);

// ── Admin only ──
router.post(
  '/products',
  authenticate,
  requireRole('admin'),
  productUpload.array('images', 8),
  validate(createProductSchema, 'body'),
  controller.createProduct
);

router.patch(
  '/products/:productId',
  authenticate,
  requireRole('admin'),
  validate(updateProductSchema, 'body'),
  controller.updateProduct
);

router.delete(
  '/products/:productId',
  authenticate,
  requireRole('admin'),
  controller.deleteProduct
);

router.post(
  '/products/:productId/images',
  authenticate,
  requireRole('admin'),
  productUpload.array('images', 8),
  controller.uploadImages
);

module.exports = router;
