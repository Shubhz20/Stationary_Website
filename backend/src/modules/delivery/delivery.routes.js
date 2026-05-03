const router = require('express').Router();
const controller = require('./delivery.controller');
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { deliveryUpload } = require('../../middleware/upload');
const {
  assignDeliverySchema,
  updateStatusSchema,
  updateLocationSchema,
  deliveryProofSchema,
} = require('./delivery.validator');

// ── Admin ──
router.post(
  '/orders/:orderId/assign-delivery',
  authenticate,
  requireRole('admin'),
  validate(assignDeliverySchema, 'body'),
  controller.assignPartner
);

router.get(
  '/delivery/partners/available',
  authenticate,
  requireRole('admin'),
  controller.getAvailablePartners
);

// ── Delivery partner ──
router.patch(
  '/deliveries/:deliveryId/status',
  authenticate,
  requireRole('delivery'),
  validate(updateStatusSchema, 'body'),
  controller.updateStatus
);

router.post(
  '/deliveries/:deliveryId/location',
  authenticate,
  requireRole('delivery'),
  validate(updateLocationSchema, 'body'),
  controller.updateLocation
);

router.get(
  '/deliveries/my',
  authenticate,
  requireRole('delivery'),
  controller.myDeliveries
);

router.post(
  '/deliveries/:deliveryId/proof',
  authenticate,
  requireRole('delivery'),
  deliveryUpload.single('photo'),
  validate(deliveryProofSchema, 'body'),
  controller.submitProof
);

// ── Client / Admin ──
router.get(
  '/deliveries/:deliveryId/tracking',
  authenticate,
  controller.getTracking
);

module.exports = router;
