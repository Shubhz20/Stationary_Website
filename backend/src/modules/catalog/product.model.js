const mongoose = require('mongoose');

const priceTierSchema = new mongoose.Schema(
  {
    minQty: { type: Number, required: true, min: 1 },
    maxQty: { type: Number, default: null },
    pricePerUnit: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    subcategory: {
      type: String,
      trim: true,
      default: null,
    },
    brand: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    priceTiers: {
      type: [priceTierSchema],
      default: [],
    },
    gstRate: {
      type: Number,
      required: true,
      default: 18,
    },
    hsnCode: {
      type: String,
      trim: true,
      default: null,
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      index: true,
    },
    lowStockThreshold: {
      type: Number,
      default: 50,
      min: 0,
    },
    minOrderQty: {
      type: Number,
      default: 1,
      min: 1,
    },
    maxOrderQty: {
      type: Number,
      default: 10000,
      min: 1,
    },
    unit: {
      type: String,
      default: 'piece',
      enum: ['piece', 'pack', 'box', 'ream', 'dozen', 'set'],
    },
    images: {
      type: [String],
      default: [],
      validate: [(arr) => arr.length <= 8, 'Maximum 8 images per product'],
    },
    thumbnail: {
      type: String,
      default: null,
    },
    attributes: {
      type: Map,
      of: String,
      default: {},
    },
    avgRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Text search index with weights
productSchema.index(
  { name: 'text', description: 'text', brand: 'text', tags: 'text' },
  { weights: { name: 10, brand: 5, tags: 3, description: 1 }, name: 'product_text_search' }
);

// Catalog browsing
productSchema.index({ isActive: 1, isDeleted: 1, category: 1, name: 1 });

// Low stock alert
productSchema.index({ stock: 1, lowStockThreshold: 1, isActive: 1 });

module.exports = mongoose.model('Product', productSchema);
