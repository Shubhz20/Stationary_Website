const Feedback = require('./feedback.model');
const Order = require('../orders/order.model');
const Product = require('../catalog/product.model');
const AppError = require('../../common/AppError');
const { ORDER_STATUS } = require('../../common/constants');
const logger = require('../../config/logger');

class FeedbackService {
  /**
   * Submit a review for a product in a delivered order.
   */
  async submitReview(orderId, userId, companyId, data) {
    // Validate order
    const order = await Order.findById(orderId);
    if (!order) throw AppError.notFound('Order');
    if (String(order.client) !== String(userId)) {
      throw AppError.forbidden('You can only review your own orders');
    }
    if (order.status !== ORDER_STATUS.DELIVERED) {
      throw AppError.conflict('You can only review delivered orders', 'ORDER_STATE_INVALID');
    }

    // Validate product is in the order
    const orderHasProduct = order.items.some(
      (item) => String(item.product) === String(data.productId)
    );
    if (!orderHasProduct) {
      throw AppError.badRequest('This product is not in the order');
    }

    // Create feedback
    const feedback = await Feedback.create({
      order: orderId,
      product: data.productId,
      user: userId,
      company: companyId,
      rating: data.rating,
      title: data.title || '',
      comment: data.comment || '',
    });

    // Update product avg rating atomically (incremental average)
    const product = await Product.findById(data.productId);
    if (product) {
      const newTotal = product.totalReviews + 1;
      const newAvg =
        (product.avgRating * product.totalReviews + data.rating) / newTotal;

      await Product.findByIdAndUpdate(data.productId, {
        avgRating: Math.round(newAvg * 10) / 10, // 1 decimal place
        totalReviews: newTotal,
      });
    }

    logger.info(`Review submitted for product ${data.productId} on order ${order.orderNumber}`);
    return feedback;
  }

  /**
   * Get reviews for a product with rating distribution.
   */
  async getProductReviews(productId, query) {
    const { page = 1, limit = 10, sort = '-createdAt' } = query;
    const filter = { product: productId, isApproved: true };

    const sortMap = {
      '-createdAt': { createdAt: -1 },
      'createdAt': { createdAt: 1 },
      '-rating': { rating: -1 },
      'rating': { rating: 1 },
    };

    const skip = (page - 1) * limit;

    const [reviews, total, distribution] = await Promise.all([
      Feedback.find(filter)
        .sort(sortMap[sort] || { createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'name')
        .populate('company', 'name')
        .lean(),
      Feedback.countDocuments(filter),
      Feedback.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$rating',
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
      ]),
    ]);

    // Build distribution map
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    distribution.forEach((d) => {
      dist[d._id] = d.count;
    });

    const product = await Product.findById(productId).select('avgRating totalReviews').lean();

    return {
      reviews,
      summary: {
        avgRating: product?.avgRating || 0,
        totalReviews: product?.totalReviews || 0,
        distribution: dist,
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Admin: respond to a review.
   */
  async adminRespond(feedbackId, adminResponse) {
    const feedback = await Feedback.findByIdAndUpdate(
      feedbackId,
      { adminResponse },
      { new: true }
    );
    if (!feedback) throw AppError.notFound('Review');
    return feedback;
  }
}

module.exports = new FeedbackService();
