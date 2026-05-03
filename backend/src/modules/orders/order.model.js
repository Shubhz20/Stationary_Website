const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productSnapshot: {
      sku: { type: String, required: true },
      name: { type: String, required: true },
      category: { type: String, required: true },
      unit: { type: String, required: true },
      gstRate: { type: Number, required: true },
      hsnCode: { type: String, default: null },
    },
    quantity: { type: Number, required: true, min: 1 },
    pricePerUnit: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    gstAmount: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    note: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(arr) => arr.length > 0, 'Order must have at least one item'],
    },
    subtotal: { type: Number, required: true, min: 0 },
    totalGst: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    shippingAddress: {
      line1: { type: String, required: true },
      line2: { type: String, default: '' },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      country: { type: String, default: 'India' },
    },
    status: {
      type: String,
      enum: [
        'pending_payment', 'confirmed', 'processing', 'shipped',
        'out_for_delivery', 'delivered', 'cancelled', 'rejected', 'refunded',
      ],
      default: 'pending_payment',
      index: true,
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
    paymentMethod: {
      type: String,
      enum: ['razorpay', 'credit', 'bank_transfer'],
      required: true,
    },
    adminNotes: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    delivery: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Delivery',
      default: null,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },
    notes: {
      type: String,
      default: '',
      maxlength: 500,
    },
  },
  { timestamps: true }
);

orderSchema.index({ client: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ company: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
