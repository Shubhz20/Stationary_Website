const feedbackService = require('./feedback.service');
const asyncHandler = require('../../common/asyncHandler');

const submitReview = asyncHandler(async (req, res) => {
  const companyId = req.user.company?._id || req.user.company;
  const feedback = await feedbackService.submitReview(
    req.params.orderId,
    req.user._id,
    companyId,
    req.body
  );
  res.status(201).json({ success: true, data: { feedback } });
});

const getProductReviews = asyncHandler(async (req, res) => {
  const result = await feedbackService.getProductReviews(
    req.params.productId,
    req.query
  );
  res.json({
    success: true,
    data: { reviews: result.reviews, summary: result.summary },
    meta: result.meta,
  });
});

const adminRespond = asyncHandler(async (req, res) => {
  const feedback = await feedbackService.adminRespond(
    req.params.feedbackId,
    req.body.adminResponse
  );
  res.json({ success: true, data: { feedback } });
});

module.exports = { submitReview, getProductReviews, adminRespond };
