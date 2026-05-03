const Product = require('./product.model');
const Counter = require('../../common/counter.model');
const AppError = require('../../common/AppError');
const { generateSlug } = require('../../common/helpers');
const { PAGINATION } = require('../../common/constants');
const logger = require('../../config/logger');

// Category → SKU prefix mapping
const CATEGORY_PREFIXES = {
  Pens: 'PEN',
  Notebooks: 'NTB',
  Paper: 'PPR',
  'Desk Accessories': 'DSK',
  Files: 'FIL',
  Markers: 'MRK',
  Tape: 'TPE',
  Staples: 'STP',
  default: 'GEN',
};

class CatalogService {
  /**
   * Generate SKU from category.
   */
  async _generateSku(category) {
    const prefix = CATEGORY_PREFIXES[category] || CATEGORY_PREFIXES.default;
    const seq = await Counter.getNext(`sku-${prefix}`);
    return `${prefix}-${String(seq).padStart(4, '0')}`;
  }

  /**
   * Generate unique slug.
   */
  async _generateUniqueSlug(name) {
    let slug = generateSlug(name);
    let existing = await Product.findOne({ slug });
    let counter = 1;
    while (existing) {
      slug = `${generateSlug(name)}-${++counter}`;
      existing = await Product.findOne({ slug });
    }
    return slug;
  }

  /**
   * Create a new product.
   */
  async create(data, imageFiles = []) {
    const sku = await this._generateSku(data.category);
    const slug = await this._generateUniqueSlug(data.name);

    // Process uploaded images
    const images = imageFiles.map((f) => `/uploads/products/${f.filename}`);
    const thumbnail = images[0] || null;

    // Parse attributes if sent as JSON string (from multipart form)
    if (typeof data.attributes === 'string') {
      try {
        data.attributes = JSON.parse(data.attributes);
      } catch {
        data.attributes = {};
      }
    }
    if (typeof data.priceTiers === 'string') {
      try {
        data.priceTiers = JSON.parse(data.priceTiers);
      } catch {
        data.priceTiers = [];
      }
    }
    if (typeof data.tags === 'string') {
      try {
        data.tags = JSON.parse(data.tags);
      } catch {
        data.tags = [];
      }
    }

    const product = await Product.create({
      ...data,
      sku,
      slug,
      images,
      thumbnail,
    });

    logger.info(`Product created: ${sku} - ${data.name}`);
    return product;
  }

  /**
   * List products with filters, search, pagination.
   */
  async list(query) {
    const {
      page = PAGINATION.DEFAULT_PAGE,
      limit = PAGINATION.DEFAULT_LIMIT,
      category,
      subcategory,
      brand,
      search,
      minPrice,
      maxPrice,
      inStock,
      sort = '-createdAt',
    } = query;

    // Build filter
    const filter = { isActive: true, isDeleted: false };

    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;
    if (brand) filter.brand = brand;
    if (inStock === true || inStock === 'true') filter.stock = { $gt: 0 };

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.basePrice = {};
      if (minPrice !== undefined) filter.basePrice.$gte = minPrice;
      if (maxPrice !== undefined) filter.basePrice.$lte = maxPrice;
    }

    // Text search
    if (search) {
      filter.$text = { $search: search };
    }

    // Sort
    const sortMap = {
      name: { name: 1 },
      '-name': { name: -1 },
      basePrice: { basePrice: 1 },
      '-basePrice': { basePrice: -1 },
      '-createdAt': { createdAt: -1 },
      avgRating: { avgRating: -1 },
    };
    const sortOption = search
      ? { score: { $meta: 'textScore' }, ...sortMap[sort] }
      : sortMap[sort] || { createdAt: -1 };

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .select(search ? { score: { $meta: 'textScore' } } : {})
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return {
      products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + products.length < total,
      },
    };
  }

  /**
   * Get product by slug.
   */
  async getBySlug(slug) {
    const product = await Product.findOne({ slug, isActive: true, isDeleted: false }).lean();
    if (!product) throw AppError.notFound('Product');
    return product;
  }

  /**
   * Get product by ID.
   */
  async getById(productId) {
    const product = await Product.findById(productId);
    if (!product || product.isDeleted) throw AppError.notFound('Product');
    return product;
  }

  /**
   * Update product.
   */
  async update(productId, data) {
    // If name changed, regenerate slug
    if (data.name) {
      data.slug = await this._generateUniqueSlug(data.name);
    }

    const product = await Product.findOneAndUpdate(
      { _id: productId, isDeleted: false },
      data,
      { new: true, runValidators: true }
    );

    if (!product) throw AppError.notFound('Product');
    logger.info(`Product updated: ${product.sku}`);
    return product;
  }

  /**
   * Soft delete product.
   */
  async softDelete(productId) {
    const product = await Product.findOneAndUpdate(
      { _id: productId, isDeleted: false },
      { isDeleted: true, isActive: false },
      { new: true }
    );

    if (!product) throw AppError.notFound('Product');
    logger.info(`Product archived: ${product.sku}`);
    return product;
  }

  /**
   * Add images to product.
   */
  async addImages(productId, imageFiles) {
    const product = await Product.findById(productId);
    if (!product || product.isDeleted) throw AppError.notFound('Product');

    const newImages = imageFiles.map((f) => `/uploads/products/${f.filename}`);

    if (product.images.length + newImages.length > 8) {
      throw AppError.badRequest('Maximum 8 images per product');
    }

    product.images.push(...newImages);
    if (!product.thumbnail) {
      product.thumbnail = product.images[0];
    }
    await product.save();

    return product.images;
  }

  /**
   * Get low stock products (admin).
   */
  async getLowStock() {
    return Product.find({
      isActive: true,
      isDeleted: false,
      $expr: { $lte: ['$stock', '$lowStockThreshold'] },
    })
      .sort({ stock: 1 })
      .lean();
  }

  /**
   * Get all unique categories.
   */
  async getCategories() {
    return Product.distinct('category', { isActive: true, isDeleted: false });
  }
}

module.exports = new CatalogService();
