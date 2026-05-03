const catalogService = require('./catalog.service');
const asyncHandler = require('../../common/asyncHandler');

const listProducts = asyncHandler(async (req, res) => {
  const result = await catalogService.list(req.query);
  res.json({ success: true, data: { products: result.products }, meta: result.meta });
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await catalogService.getBySlug(req.params.slug);
  res.json({ success: true, data: { product } });
});

const createProduct = asyncHandler(async (req, res) => {
  const product = await catalogService.create(req.body, req.files || []);
  res.status(201).json({ success: true, data: { product } });
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await catalogService.update(req.params.productId, req.body);
  res.json({ success: true, data: { product } });
});

const deleteProduct = asyncHandler(async (req, res) => {
  await catalogService.softDelete(req.params.productId);
  res.json({ success: true, data: { message: 'Product archived successfully' } });
});

const uploadImages = asyncHandler(async (req, res) => {
  const images = await catalogService.addImages(req.params.productId, req.files || []);
  res.json({ success: true, data: { images } });
});

const getCategories = asyncHandler(async (req, res) => {
  const categories = await catalogService.getCategories();
  res.json({ success: true, data: { categories } });
});

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadImages,
  getCategories,
};
