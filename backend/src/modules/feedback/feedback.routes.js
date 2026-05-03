const router = require('express').Router();
const controller = require('./feedback.controller');
const { authenticate, requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { submitReviewSchema, adminRespondSchema } = require('./feedback.validator');

// Submit review (client, after delivery)
router.post(
  '/orders/:orderId/feedback',
  authenticate,
  requireRole('client'),
  validate(submitReviewSchema, 'body'),
  controller.submitReview
);

// Get reviews for a product (public)
router.get('/products/:productId/reviews', controller.getProductReviews);

// Admin respond to review
router.patch(
  '/feedback/:feedbackId/respond',
  authenticate,
  requireRole('admin'),
  validate(adminRespondSchema, 'body'),
  controller.adminRespond
);

module.exports = router;
