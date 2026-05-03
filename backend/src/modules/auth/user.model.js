const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    avatar: {
      type: String,
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    role: {
      type: String,
      enum: ['client', 'admin', 'delivery'],
      default: 'client',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      default: null,
    },
    deliveryProfile: {
      vehicleType: {
        type: String,
        enum: ['bike', 'van', 'truck', null],
        default: null,
      },
      isAvailable: {
        type: Boolean,
        default: true,
      },
      currentLocation: {
        type: { type: String, enum: ['Point'] },
        coordinates: { type: [Number] },
      },
      activeDeliveries: {
        type: Number,
        default: 0,
        min: 0,
      },
      maxConcurrentDeliveries: {
        type: Number,
        default: 5,
      },
    },
    refreshTokenHash: {
      type: String,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.refreshTokenHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.index({ 'deliveryProfile.isAvailable': 1, role: 1 });
userSchema.index({ 'deliveryProfile.currentLocation': '2dsphere' });

module.exports = mongoose.model('User', userSchema);
