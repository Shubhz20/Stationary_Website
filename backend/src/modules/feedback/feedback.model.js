const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 200,
      default: '',
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    isApproved: {
      type: Boolean,
      default: true,
    },
    adminResponse: {
      type: String,
      default: null,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

// One review per product per order per user
feedbackSchema.index({ order: 1, product: 1, user: 1 }, { unique: true });
// Product reviews listing
feedbackSchema.index({ product: 1, isApproved: 1, createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
