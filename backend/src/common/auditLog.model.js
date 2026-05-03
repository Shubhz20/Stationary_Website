const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    resource: {
      type: { type: String, required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
    },
    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Indexes
auditLogSchema.index({ 'resource.type': 1, 'resource.id': 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// Prevent modification
auditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('Audit logs cannot be modified');
});
auditLogSchema.pre('updateOne', function () {
  throw new Error('Audit logs cannot be modified');
});
auditLogSchema.pre('updateMany', function () {
  throw new Error('Audit logs cannot be modified');
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
