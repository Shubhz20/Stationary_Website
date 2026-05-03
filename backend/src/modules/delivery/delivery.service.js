const Delivery = require('./delivery.model');
const Order = require('../orders/order.model');
const User = require('../auth/user.model');
const AppError = require('../../common/AppError');
const { DELIVERY_STATUS, DELIVERY_TRANSITIONS, ORDER_STATUS } = require('../../common/constants');
const logger = require('../../config/logger');

class DeliveryService {
  /**
   * Assign delivery partner to an order (admin action).
   */
  async assignPartner(orderId, partnerId, estimatedDeliveryAt, socketEmitter) {
    // Validate order
    const order = await Order.findById(orderId);
    if (!order) throw AppError.notFound('Order');
    if (order.status !== ORDER_STATUS.PROCESSING) {
      throw AppError.conflict(
        `Can only assign delivery to orders in 'processing' status. Current: '${order.status}'`,
        'ORDER_STATE_INVALID'
      );
    }
    if (order.delivery) {
      throw AppError.conflict('Delivery already assigned to this order');
    }

    // Validate partner
    const partner = await User.findById(partnerId);
    if (!partner || partner.role !== 'delivery') {
      throw AppError.notFound('Delivery partner');
    }
    if (!partner.isActive) {
      throw AppError.businessLogic('Delivery partner is inactive', 'DELIVERY_PARTNER_UNAVAILABLE');
    }
    if (!partner.deliveryProfile.isAvailable) {
      throw AppError.businessLogic('Delivery partner is not available', 'DELIVERY_PARTNER_UNAVAILABLE');
    }
    if (partner.deliveryProfile.activeDeliveries >= partner.deliveryProfile.maxConcurrentDeliveries) {
      throw AppError.businessLogic(
        'Delivery partner has reached maximum concurrent deliveries',
        'DELIVERY_PARTNER_UNAVAILABLE'
      );
    }

    // Create delivery
    const delivery = await Delivery.create({
      order: orderId,
      partner: partnerId,
      pickupAddress: {
        line1: 'Warehouse',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560001',
      },
      dropoffAddress: order.shippingAddress,
      status: DELIVERY_STATUS.ASSIGNED,
      estimatedDeliveryAt,
      trackingEvents: [
        {
          status: DELIVERY_STATUS.ASSIGNED,
          note: 'Delivery partner assigned',
          timestamp: new Date(),
        },
      ],
    });

    // Update order
    order.delivery = delivery._id;
    order.status = ORDER_STATUS.SHIPPED;
    order.statusHistory.push({
      status: ORDER_STATUS.SHIPPED,
      changedBy: partnerId,
      note: `Delivery assigned to ${partner.name}`,
      timestamp: new Date(),
    });
    await order.save();

    // Increment partner's active deliveries
    await User.findByIdAndUpdate(partnerId, {
      $inc: { 'deliveryProfile.activeDeliveries': 1 },
    });

    logger.info(`Delivery assigned: ${delivery._id} → partner ${partnerId} for order ${order.orderNumber}`);

    // Socket notifications
    if (socketEmitter) {
      socketEmitter.toUser(partnerId).emit('delivery:assigned', {
        deliveryId: delivery._id,
        orderId,
        orderNumber: order.orderNumber,
        pickupAddress: delivery.pickupAddress,
      });
      socketEmitter.toUser(order.client).emit('order:updated', {
        orderId,
        orderNumber: order.orderNumber,
        status: ORDER_STATUS.SHIPPED,
      });
    }

    return delivery;
  }

  /**
   * Update delivery status (delivery partner action).
   */
  async updateStatus(deliveryId, partnerId, data, socketEmitter) {
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) throw AppError.notFound('Delivery');
    if (String(delivery.partner) !== String(partnerId)) {
      throw AppError.forbidden('You can only update your own deliveries');
    }

    // Validate transition
    const allowed = DELIVERY_TRANSITIONS[delivery.status];
    if (!allowed || !allowed.includes(data.status)) {
      throw AppError.conflict(
        `Cannot transition from '${delivery.status}' to '${data.status}'`,
        'ORDER_STATE_INVALID'
      );
    }

    delivery.status = data.status;
    delivery.trackingEvents.push({
      status: data.status,
      location: data.location
        ? { type: 'Point', coordinates: data.location.coordinates }
        : undefined,
      note: data.note || '',
      timestamp: new Date(),
    });

    // Handle terminal states
    if (data.status === DELIVERY_STATUS.DELIVERED) {
      delivery.actualDeliveryAt = new Date();

      // Update order status
      const order = await Order.findById(delivery.order);
      if (order) {
        order.status = ORDER_STATUS.DELIVERED;
        order.statusHistory.push({
          status: ORDER_STATUS.DELIVERED,
          changedBy: partnerId,
          note: 'Delivered successfully',
          timestamp: new Date(),
        });
        await order.save();

        if (socketEmitter) {
          socketEmitter.toUser(order.client).emit('order:updated', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            status: ORDER_STATUS.DELIVERED,
          });
        }
      }

      // Decrement partner's active deliveries
      await User.findByIdAndUpdate(partnerId, {
        $inc: { 'deliveryProfile.activeDeliveries': -1 },
      });
    }

    if (data.status === DELIVERY_STATUS.RETURNED) {
      await User.findByIdAndUpdate(partnerId, {
        $inc: { 'deliveryProfile.activeDeliveries': -1 },
      });
    }

    // Update corresponding order status for mid-transit states
    if (data.status === DELIVERY_STATUS.OUT_FOR_DELIVERY) {
      const order = await Order.findById(delivery.order);
      if (order && order.status !== ORDER_STATUS.OUT_FOR_DELIVERY) {
        order.status = ORDER_STATUS.OUT_FOR_DELIVERY;
        order.statusHistory.push({
          status: ORDER_STATUS.OUT_FOR_DELIVERY,
          changedBy: partnerId,
          note: 'Out for delivery',
          timestamp: new Date(),
        });
        await order.save();
      }
    }

    await delivery.save();
    logger.info(`Delivery ${deliveryId} status → ${data.status}`);

    // Emit to order tracking room
    if (socketEmitter) {
      socketEmitter.toOrder(delivery.order).emit('delivery:status', {
        deliveryId: delivery._id,
        status: data.status,
        note: data.note || '',
      });
    }

    return delivery;
  }

  /**
   * Update live location (called frequently by delivery partner).
   */
  async updateLocation(deliveryId, partnerId, coordinates, socketEmitter) {
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) throw AppError.notFound('Delivery');
    if (String(delivery.partner) !== String(partnerId)) {
      throw AppError.forbidden('You can only update your own deliveries');
    }

    delivery.currentLocation = {
      type: 'Point',
      coordinates,
    };
    delivery.lastLocationUpdate = new Date();

    // Throttle: only store every 5th location update in events
    const eventCount = delivery.trackingEvents.filter(
      (e) => e.location && e.location.coordinates
    ).length;

    if (eventCount % 5 === 0) {
      delivery.trackingEvents.push({
        status: delivery.status,
        location: { type: 'Point', coordinates },
        timestamp: new Date(),
      });
    }

    await delivery.save();

    // Broadcast live location
    if (socketEmitter) {
      socketEmitter.toOrder(delivery.order).emit('delivery:location', {
        deliveryId: delivery._id,
        coordinates,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get delivery tracking info.
   */
  async getTracking(deliveryId, user) {
    const delivery = await Delivery.findById(deliveryId)
      .populate('partner', 'name phone')
      .lean();

    if (!delivery) throw AppError.notFound('Delivery');

    // Access control
    if (user.role === 'client') {
      const order = await Order.findById(delivery.order);
      if (!order || String(order.client) !== String(user._id)) {
        throw AppError.forbidden('Access denied');
      }
    }
    if (user.role === 'delivery' && String(delivery.partner._id) !== String(user._id)) {
      throw AppError.forbidden('Access denied');
    }

    return delivery;
  }

  /**
   * List deliveries for a partner.
   */
  async listPartnerDeliveries(partnerId, query) {
    const { status, cursor, limit = 20 } = query;
    const filter = { partner: partnerId };
    if (status) filter.status = status;
    if (cursor) filter.createdAt = { $lt: new Date(cursor) };

    const deliveries = await Delivery.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('order', 'orderNumber grandTotal shippingAddress')
      .lean();

    const hasMore = deliveries.length > limit;
    if (hasMore) deliveries.pop();

    return {
      deliveries,
      meta: {
        limit,
        nextCursor: deliveries.length > 0 ? deliveries[deliveries.length - 1].createdAt.toISOString() : null,
        hasMore,
      },
    };
  }

  /**
   * Submit delivery proof.
   */
  async submitProof(deliveryId, partnerId, data, photoFile) {
    const delivery = await Delivery.findById(deliveryId);
    if (!delivery) throw AppError.notFound('Delivery');
    if (String(delivery.partner) !== String(partnerId)) {
      throw AppError.forbidden('Access denied');
    }

    delivery.deliveryProof = {
      receiverName: data.receiverName,
      receiverPhone: data.receiverPhone || null,
      photoUrl: photoFile ? `/uploads/deliveries/${photoFile.filename}` : null,
    };

    await delivery.save();
    return delivery;
  }

  /**
   * Get available delivery partners (admin).
   */
  async getAvailablePartners() {
    return User.find({
      role: 'delivery',
      isActive: true,
      'deliveryProfile.isAvailable': true,
      $expr: {
        $lt: ['$deliveryProfile.activeDeliveries', '$deliveryProfile.maxConcurrentDeliveries'],
      },
    })
      .select('name phone email deliveryProfile')
      .lean();
  }
}

module.exports = new DeliveryService();
