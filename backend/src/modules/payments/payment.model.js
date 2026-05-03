const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      sparse: true,
      unique: true,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    status: {
      type: String,
      enum: ['created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded'],
      default: 'created',
      index: true,
    },
    refunds: [
      {
        razorpayRefundId: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        reason: { type: String, default: '' },
        status: {
          type: String,
          enum: ['pending', 'processed', 'failed'],
          default: 'pending',
        },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    method: {
      type: String,
      default: null,
    },
    failureReason: {
      type: String,
      default: null,
    },
    webhookEvents: [
      {
        eventType: { type: String, required: true },
        receivedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

paymentSchema.index({ razorpayOrderId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
