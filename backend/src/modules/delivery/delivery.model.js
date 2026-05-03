const mongoose = require('mongoose');

const trackingEventSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
      enum: [
        'assigned', 'picked_up', 'in_transit', 'out_for_delivery',
        'delivered', 'failed_attempt', 'returned',
      ],
    },
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
    note: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const deliverySchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
      index: true,
    },
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    pickupAddress: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
    },
    dropoffAddress: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
    },
    status: {
      type: String,
      enum: [
        'assigned', 'picked_up', 'in_transit', 'out_for_delivery',
        'delivered', 'failed_attempt', 'returned',
      ],
      default: 'assigned',
      index: true,
    },
    currentLocation: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number] },
    },
    lastLocationUpdate: {
      type: Date,
      default: null,
    },
    trackingEvents: {
      type: [trackingEventSchema],
      default: [],
    },
    estimatedDeliveryAt: {
      type: Date,
      default: null,
    },
    actualDeliveryAt: {
      type: Date,
      default: null,
    },
    deliveryProof: {
      receiverName: { type: String, default: null },
      receiverPhone: { type: String, default: null },
      signatureImage: { type: String, default: null },
      photoUrl: { type: String, default: null },
    },
  },
  { timestamps: true }
);

deliverySchema.index({ currentLocation: '2dsphere' });
deliverySchema.index({ partner: 1, status: 1 });

module.exports = mongoose.model('Delivery', deliverySchema);
