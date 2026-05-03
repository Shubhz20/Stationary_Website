const crypto = require('crypto');
const razorpay = require('../../config/razorpay');
const config = require('../../config/env');
const Payment = require('./payment.model');
const Order = require('../orders/order.model');
const AppError = require('../../common/AppError');
const { ORDER_STATUS, PAYMENT_STATUS } = require('../../common/constants');
const logger = require('../../config/logger');

class PaymentService {
  /**
   * Create a Razorpay order and corresponding Payment doc.
   */
  async createRazorpayOrder(order) {
    const razorpayOrder = await razorpay.orders.create({
      amount: order.grandTotal, // already in paisa
      currency: 'INR',
      receipt: order.orderNumber,
      notes: {
        orderId: String(order._id),
        orderNumber: order.orderNumber,
      },
    });

    const payment = await Payment.create({
      order: order._id,
      user: order.client,
      razorpayOrderId: razorpayOrder.id,
      amount: order.grandTotal,
      currency: 'INR',
      status: PAYMENT_STATUS.CREATED,
    });

    logger.info(`Razorpay order created: ${razorpayOrder.id} for ${order.orderNumber}`);
    return payment;
  }

  /**
   * Verify Razorpay payment (client-side callback).
   * Validates signature, updates payment + order status.
   */
  async verifyPayment(orderId, data, socketEmitter) {
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = data;

    // 1. Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      logger.warn(`Payment signature mismatch for order ${orderId}`);
      throw new AppError(
        'Payment signature verification failed. Do not fulfill this order.',
        400,
        'PAYMENT_VERIFICATION_FAILED'
      );
    }

    // 2. Update payment
    const payment = await Payment.findOne({ razorpayOrderId, order: orderId });
    if (!payment) throw AppError.notFound('Payment');

    if (payment.status === PAYMENT_STATUS.CAPTURED) {
      // Already processed (idempotent)
      const order = await Order.findById(orderId);
      return order;
    }

    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    payment.status = PAYMENT_STATUS.CAPTURED;
    await payment.save();

    // 3. Update order status
    const order = await Order.findById(orderId);
    if (!order) throw AppError.notFound('Order');

    if (order.status === ORDER_STATUS.PENDING_PAYMENT) {
      order.status = ORDER_STATUS.CONFIRMED;
      order.statusHistory.push({
        status: ORDER_STATUS.CONFIRMED,
        changedBy: order.client,
        note: 'Payment verified',
        timestamp: new Date(),
      });
      await order.save();
    }

    logger.info(`Payment verified: ${razorpayPaymentId} for ${order.orderNumber}`);

    // 4. Socket notification
    if (socketEmitter) {
      socketEmitter.toUser(order.client).emit('payment:updated', {
        orderId: order._id,
        paymentStatus: 'captured',
      });
      socketEmitter.toRoom('admin').emit('order:needsAction', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        action: 'review_new_order',
      });
    }

    return order;
  }

  /**
   * Handle Razorpay webhook events.
   * Must be idempotent — same event can arrive multiple times.
   */
  async handleWebhook(body, signature) {
    // 1. Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', config.razorpay.webhookSecret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== signature) {
      logger.warn('Webhook signature mismatch');
      throw new AppError('Invalid webhook signature', 400, 'WEBHOOK_INVALID');
    }

    const event = JSON.parse(body);
    const eventType = event.event;
    const payload = event.payload;

    logger.info(`Razorpay webhook: ${eventType}`);

    switch (eventType) {
      case 'payment.captured': {
        const rpPayment = payload.payment.entity;
        await this._handlePaymentCaptured(rpPayment, eventType);
        break;
      }
      case 'payment.failed': {
        const rpPayment = payload.payment.entity;
        await this._handlePaymentFailed(rpPayment, eventType);
        break;
      }
      case 'refund.processed': {
        const rpRefund = payload.refund.entity;
        await this._handleRefundProcessed(rpRefund, eventType);
        break;
      }
      default:
        logger.info(`Unhandled webhook event: ${eventType}`);
    }
  }

  async _handlePaymentCaptured(rpPayment, eventType) {
    const payment = await Payment.findOne({ razorpayOrderId: rpPayment.order_id });
    if (!payment) {
      logger.warn(`Webhook: payment not found for order ${rpPayment.order_id}`);
      return;
    }

    // Idempotency check
    const alreadyProcessed = payment.webhookEvents.some((e) => e.eventType === eventType);
    if (alreadyProcessed) return;

    payment.razorpayPaymentId = rpPayment.id;
    payment.status = PAYMENT_STATUS.CAPTURED;
    payment.method = rpPayment.method;
    payment.webhookEvents.push({ eventType, receivedAt: new Date() });
    await payment.save();

    // Update order if still pending
    const order = await Order.findById(payment.order);
    if (order && order.status === ORDER_STATUS.PENDING_PAYMENT) {
      order.status = ORDER_STATUS.CONFIRMED;
      order.statusHistory.push({
        status: ORDER_STATUS.CONFIRMED,
        changedBy: order.client,
        note: 'Payment confirmed via webhook',
        timestamp: new Date(),
      });
      await order.save();
    }
  }

  async _handlePaymentFailed(rpPayment, eventType) {
    const payment = await Payment.findOne({ razorpayOrderId: rpPayment.order_id });
    if (!payment) return;

    const alreadyProcessed = payment.webhookEvents.some((e) => e.eventType === eventType);
    if (alreadyProcessed) return;

    payment.status = PAYMENT_STATUS.FAILED;
    payment.failureReason = rpPayment.error_description || 'Payment failed';
    payment.webhookEvents.push({ eventType, receivedAt: new Date() });
    await payment.save();
  }

  async _handleRefundProcessed(rpRefund, eventType) {
    const payment = await Payment.findOne({ razorpayPaymentId: rpRefund.payment_id });
    if (!payment) return;

    const refund = payment.refunds.find(
      (r) => r.razorpayRefundId === rpRefund.id
    );

    if (refund) {
      refund.status = 'processed';
    }

    payment.webhookEvents.push({ eventType, receivedAt: new Date() });

    // Update payment status
    const totalRefunded = payment.refunds
      .filter((r) => r.status === 'processed')
      .reduce((sum, r) => sum + r.amount, 0);

    if (totalRefunded >= payment.amount) {
      payment.status = PAYMENT_STATUS.REFUNDED;
    } else if (totalRefunded > 0) {
      payment.status = PAYMENT_STATUS.PARTIALLY_REFUNDED;
    }

    await payment.save();
  }

  /**
   * Initiate refund (admin).
   */
  async initiateRefund(orderId, amount, reason) {
    const payment = await Payment.findOne({ order: orderId, status: PAYMENT_STATUS.CAPTURED });
    if (!payment) throw AppError.notFound('No captured payment found for this order');

    if (amount > payment.amount) {
      throw AppError.badRequest('Refund amount exceeds payment amount');
    }

    const rpRefund = await razorpay.payments.refund(payment.razorpayPaymentId, {
      amount, // in paisa
      notes: { orderId: String(orderId), reason },
    });

    payment.refunds.push({
      razorpayRefundId: rpRefund.id,
      amount,
      reason: reason || '',
      status: 'pending',
    });
    await payment.save();

    logger.info(`Refund initiated: ${rpRefund.id} for order ${orderId}`);

    return {
      razorpayRefundId: rpRefund.id,
      amount,
      status: 'pending',
    };
  }

  /**
   * Get payment for an order.
   */
  async getPaymentForOrder(orderId) {
    const payment = await Payment.findOne({ order: orderId })
      .sort({ createdAt: -1 })
      .lean();
    if (!payment) throw AppError.notFound('Payment');
    return payment;
  }
}

module.exports = new PaymentService();
