const mongoose = require('mongoose');
const Cart = require('./cart.model');
const Order = require('./order.model');
const Product = require('../catalog/product.model');
const Company = require('../auth/company.model');
const Counter = require('../../common/counter.model');
const AppError = require('../../common/AppError');
const { resolvePriceTier } = require('../../common/helpers');
const { ORDER_STATUS, ORDER_TRANSITIONS } = require('../../common/constants');
const logger = require('../../config/logger');

class OrderService {
  // ════════════════════════════════
  //  CART OPERATIONS
  // ════════════════════════════════

  /**
   * Get cart for user (create if doesn't exist), populate products.
   */
  async getCart(userId) {
    let cart = await Cart.findOne({ user: userId }).populate({
      path: 'items.product',
      select: 'name sku thumbnail basePrice priceTiers stock minOrderQty maxOrderQty unit isActive isDeleted gstRate',
    });

    if (!cart) {
      cart = await Cart.create({ user: userId, items: [] });
      cart = cart.toObject();
      cart.items = [];
    } else {
      cart = cart.toObject();
    }

    // Compute summary from live product prices
    cart.summary = this._computeCartSummary(cart.items);
    return cart;
  }

  /**
   * Add item to cart (or replace quantity if already present).
   */
  async addToCart(userId, productId, quantity) {
    const product = await Product.findById(productId);
    if (!product || product.isDeleted || !product.isActive) {
      throw AppError.notFound('Product');
    }
    if (quantity < product.minOrderQty) {
      throw AppError.badRequest(`Minimum order quantity is ${product.minOrderQty}`);
    }
    if (quantity > product.maxOrderQty) {
      throw AppError.badRequest(`Maximum order quantity is ${product.maxOrderQty}`);
    }
    if (quantity > product.stock) {
      throw AppError.businessLogic(
        `Only ${product.stock} units available for ${product.sku}`,
        'INSUFFICIENT_STOCK',
        { available: product.stock, requested: quantity }
      );
    }

    const pricePerUnit = resolvePriceTier(product.priceTiers, product.basePrice, quantity);

    // Upsert cart
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      cart = new Cart({ user: userId, items: [] });
    }

    // Check if product already in cart
    const existingIndex = cart.items.findIndex(
      (item) => String(item.product) === String(productId)
    );

    if (existingIndex >= 0) {
      cart.items[existingIndex].quantity = quantity;
      cart.items[existingIndex].pricePerUnit = pricePerUnit;
    } else {
      if (cart.items.length >= 100) {
        throw AppError.badRequest('Maximum 100 items in cart');
      }
      cart.items.push({ product: productId, quantity, pricePerUnit });
    }

    await cart.save();
    return this.getCart(userId);
  }

  /**
   * Update cart item quantity.
   */
  async updateCartItem(userId, itemId, quantity) {
    const cart = await Cart.findOne({ user: userId });
    if (!cart) throw AppError.notFound('Cart');

    const item = cart.items.id(itemId);
    if (!item) throw AppError.notFound('Cart item');

    const product = await Product.findById(item.product);
    if (!product || product.isDeleted) throw AppError.notFound('Product');

    if (quantity > product.stock) {
      throw AppError.businessLogic(
        `Only ${product.stock} units available`,
        'INSUFFICIENT_STOCK',
        { available: product.stock, requested: quantity }
      );
    }

    item.quantity = quantity;
    item.pricePerUnit = resolvePriceTier(product.priceTiers, product.basePrice, quantity);
    await cart.save();

    return this.getCart(userId);
  }

  /**
   * Remove item from cart.
   */
  async removeCartItem(userId, itemId) {
    const cart = await Cart.findOne({ user: userId });
    if (!cart) throw AppError.notFound('Cart');

    cart.items = cart.items.filter((item) => String(item._id) !== String(itemId));
    await cart.save();

    return this.getCart(userId);
  }

  /**
   * Clear entire cart.
   */
  async clearCart(userId) {
    await Cart.findOneAndUpdate({ user: userId }, { items: [] });
    return this.getCart(userId);
  }

  /**
   * Compute cart summary from populated items.
   */
  _computeCartSummary(items) {
    let subtotal = 0;
    let estimatedGst = 0;

    for (const item of items) {
      const product = item.product;
      if (!product || !product.isActive) continue;

      const price = resolvePriceTier(
        product.priceTiers,
        product.basePrice,
        item.quantity
      );
      const lineSubtotal = price * item.quantity;
      const lineGst = Math.round(lineSubtotal * (product.gstRate / 100));

      subtotal += lineSubtotal;
      estimatedGst += lineGst;
    }

    return {
      itemCount: items.length,
      subtotal,
      estimatedGst,
      estimatedTotal: subtotal + estimatedGst,
    };
  }

  // ════════════════════════════════
  //  CHECKOUT / ORDER CREATION
  // ════════════════════════════════

  /**
   * Place order — the critical transactional endpoint.
   */
  async checkout(userId, data, socketEmitter) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Load user with company
      const user = await mongoose
        .model('User')
        .findById(userId)
        .populate('company')
        .session(session);

      if (!user) throw AppError.notFound('User');
      if (!user.company) {
        throw AppError.businessLogic(
          'You must register a company before placing orders',
          'COMPANY_REQUIRED'
        );
      }

      const company = user.company;

      // 2. Load cart
      const cart = await Cart.findOne({ user: userId })
        .populate('items.product')
        .session(session);

      if (!cart || cart.items.length === 0) {
        throw AppError.businessLogic('Cart is empty', 'CART_EMPTY');
      }

      // 3. Resolve shipping address
      let shippingAddress;
      if (data.shippingAddress) {
        shippingAddress = data.shippingAddress;
      } else if (data.shippingAddressIndex !== undefined) {
        if (data.shippingAddressIndex >= company.shippingAddresses.length) {
          throw AppError.badRequest('Invalid shipping address index');
        }
        shippingAddress = company.shippingAddresses[data.shippingAddressIndex].toObject();
      } else {
        // Default to billing address
        shippingAddress = company.billingAddress.toObject();
      }

      // 4. Validate every item and compute totals
      const orderItems = [];
      let orderSubtotal = 0;
      let orderTotalGst = 0;

      for (const cartItem of cart.items) {
        const product = cartItem.product;

        if (!product || product.isDeleted || !product.isActive) {
          throw AppError.businessLogic(
            `Product ${product?.sku || 'unknown'} is no longer available`,
            'PRODUCT_INACTIVE'
          );
        }
        if (cartItem.quantity > product.stock) {
          throw AppError.businessLogic(
            `Only ${product.stock} units available for ${product.sku}`,
            'INSUFFICIENT_STOCK',
            { sku: product.sku, available: product.stock, requested: cartItem.quantity }
          );
        }

        const pricePerUnit = resolvePriceTier(
          product.priceTiers,
          product.basePrice,
          cartItem.quantity
        );
        const lineSubtotal = pricePerUnit * cartItem.quantity;
        const lineGst = Math.round(lineSubtotal * (product.gstRate / 100));
        const lineTotal = lineSubtotal + lineGst;

        orderItems.push({
          product: product._id,
          productSnapshot: {
            sku: product.sku,
            name: product.name,
            category: product.category,
            unit: product.unit,
            gstRate: product.gstRate,
            hsnCode: product.hsnCode,
          },
          quantity: cartItem.quantity,
          pricePerUnit,
          subtotal: lineSubtotal,
          gstAmount: lineGst,
          total: lineTotal,
        });

        orderSubtotal += lineSubtotal;
        orderTotalGst += lineGst;
      }

      const grandTotal = orderSubtotal + orderTotalGst;

      // 5. Credit check (if paying on credit)
      if (data.paymentMethod === 'credit') {
        if (company.creditLimit === 0) {
          throw AppError.businessLogic(
            'Your company does not have credit terms. Please use Razorpay.',
            'CREDIT_LIMIT_EXCEEDED'
          );
        }
        if (company.outstandingBalance + grandTotal > company.creditLimit) {
          throw AppError.businessLogic(
            'Order total plus outstanding balance exceeds credit limit',
            'CREDIT_LIMIT_EXCEEDED',
            {
              orderTotal: grandTotal,
              outstanding: company.outstandingBalance,
              creditLimit: company.creditLimit,
            }
          );
        }
      }

      // 6. Generate order number
      const year = new Date().getFullYear();
      const seq = await Counter.getNext(`orderNumber-${year}`);
      const orderNumber = `ORD-${year}-${String(seq).padStart(5, '0')}`;

      // 7. Determine initial status
      const initialStatus =
        data.paymentMethod === 'credit'
          ? ORDER_STATUS.CONFIRMED
          : ORDER_STATUS.PENDING_PAYMENT;

      // 8. Create order
      const order = new Order({
        orderNumber,
        client: userId,
        company: company._id,
        items: orderItems,
        subtotal: orderSubtotal,
        totalGst: orderTotalGst,
        grandTotal,
        shippingAddress,
        status: initialStatus,
        paymentMethod: data.paymentMethod,
        notes: data.notes || '',
        statusHistory: [
          {
            status: initialStatus,
            changedBy: userId,
            note: 'Order placed',
            timestamp: new Date(),
          },
        ],
      });

      await order.save({ session });

      // 9. Decrement inventory atomically
      for (const item of orderItems) {
        const result = await Product.findOneAndUpdate(
          { _id: item.product, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { session }
        );

        if (!result) {
          throw AppError.businessLogic(
            `Insufficient stock for ${item.productSnapshot.sku}`,
            'INSUFFICIENT_STOCK'
          );
        }
      }

      // 10. If credit: increment outstanding balance
      if (data.paymentMethod === 'credit') {
        await Company.findByIdAndUpdate(
          company._id,
          { $inc: { outstandingBalance: grandTotal } },
          { session }
        );
      }

      // 11. Clear cart
      await Cart.findOneAndUpdate({ user: userId }, { items: [] }, { session });

      await session.commitTransaction();
      logger.info(`Order placed: ${orderNumber} by user ${userId}`);

      // 12. Emit socket events (outside transaction)
      if (socketEmitter) {
        socketEmitter.toRoom('admin').emit('order:new', {
          orderId: order._id,
          orderNumber,
          company: company.name,
          grandTotal,
        });
      }

      // 13. If Razorpay, the controller will create Razorpay order
      return order;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // ════════════════════════════════
  //  ORDER QUERIES
  // ════════════════════════════════

  /**
   * List orders for a client (cursor-based pagination).
   */
  async listClientOrders(userId, query) {
    const { status, cursor, limit = 20 } = query;
    const filter = { client: userId };
    if (status) filter.status = status;
    if (cursor) filter.createdAt = { $lt: new Date(cursor) };

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('company', 'name')
      .lean();

    const hasMore = orders.length > limit;
    if (hasMore) orders.pop();

    return {
      orders,
      meta: {
        limit,
        nextCursor: orders.length > 0 ? orders[orders.length - 1].createdAt.toISOString() : null,
        hasMore,
      },
    };
  }

  /**
   * Get order by ID (with ownership/role check).
   */
  async getOrder(orderId, user) {
    const order = await Order.findById(orderId)
      .populate('client', 'name email phone')
      .populate('company', 'name gstin')
      .populate('delivery')
      .lean();

    if (!order) throw AppError.notFound('Order');

    // Access control
    if (user.role === 'client' && String(order.client._id) !== String(user._id)) {
      throw AppError.forbidden('You can only view your own orders');
    }
    if (user.role === 'delivery') {
      // Delivery partners can only see orders assigned to them
      if (!order.delivery || String(order.delivery.partner) !== String(user._id)) {
        throw AppError.forbidden('You can only view orders assigned to you');
      }
    }

    return order;
  }

  /**
   * Cancel order (client).
   */
  async cancelOrder(orderId, userId, reason) {
    const order = await Order.findById(orderId);
    if (!order) throw AppError.notFound('Order');
    if (String(order.client) !== String(userId)) {
      throw AppError.forbidden('You can only cancel your own orders');
    }

    const cancellableStatuses = [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.CONFIRMED];
    if (!cancellableStatuses.includes(order.status)) {
      throw AppError.conflict(
        `Cannot cancel order in '${order.status}' status`,
        'ORDER_STATE_INVALID'
      );
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Restore inventory
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { stock: item.quantity } },
          { session }
        );
      }

      // If credit order, decrement outstanding
      if (order.paymentMethod === 'credit' && order.status === ORDER_STATUS.CONFIRMED) {
        await Company.findByIdAndUpdate(
          order.company,
          { $inc: { outstandingBalance: -order.grandTotal } },
          { session }
        );
      }

      order.status = ORDER_STATUS.CANCELLED;
      order.statusHistory.push({
        status: ORDER_STATUS.CANCELLED,
        changedBy: userId,
        note: reason || 'Cancelled by client',
        timestamp: new Date(),
      });

      await order.save({ session });
      await session.commitTransaction();

      logger.info(`Order cancelled: ${order.orderNumber}`);
      return order;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }

  // ════════════════════════════════
  //  ADMIN ORDER MANAGEMENT
  // ════════════════════════════════

  /**
   * List all orders (admin, with filters).
   */
  async listAllOrders(query) {
    const { status, companyId, clientId, dateFrom, dateTo, cursor, limit = 20, sort = '-createdAt' } = query;
    const filter = {};

    if (status) filter.status = status;
    if (companyId) filter.company = companyId;
    if (clientId) filter.client = clientId;
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }
    if (cursor) {
      filter.createdAt = { ...filter.createdAt, $lt: new Date(cursor) };
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: sort === '-createdAt' ? -1 : 1 })
      .limit(limit + 1)
      .populate('client', 'name email')
      .populate('company', 'name')
      .lean();

    const hasMore = orders.length > limit;
    if (hasMore) orders.pop();

    return {
      orders,
      meta: {
        limit,
        nextCursor: orders.length > 0 ? orders[orders.length - 1].createdAt.toISOString() : null,
        hasMore,
      },
    };
  }

  /**
   * Accept order (admin).
   */
  async acceptOrder(orderId, adminId, note) {
    const order = await Order.findById(orderId);
    if (!order) throw AppError.notFound('Order');
    if (order.status !== ORDER_STATUS.CONFIRMED) {
      throw AppError.conflict(
        `Can only accept orders in 'confirmed' status. Current: '${order.status}'`,
        'ORDER_STATE_INVALID'
      );
    }

    order.status = ORDER_STATUS.PROCESSING;
    order.statusHistory.push({
      status: ORDER_STATUS.PROCESSING,
      changedBy: adminId,
      note: note || 'Order accepted by admin',
      timestamp: new Date(),
    });
    await order.save();

    logger.info(`Order accepted: ${order.orderNumber}`);
    return order;
  }

  /**
   * Reject order (admin).
   */
  async rejectOrder(orderId, adminId, reason) {
    const order = await Order.findById(orderId);
    if (!order) throw AppError.notFound('Order');
    if (order.status !== ORDER_STATUS.CONFIRMED) {
      throw AppError.conflict(
        `Can only reject orders in 'confirmed' status`,
        'ORDER_STATE_INVALID'
      );
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Restore inventory
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { stock: item.quantity } },
          { session }
        );
      }

      // If credit, restore balance
      if (order.paymentMethod === 'credit') {
        await Company.findByIdAndUpdate(
          order.company,
          { $inc: { outstandingBalance: -order.grandTotal } },
          { session }
        );
      }

      order.status = ORDER_STATUS.REJECTED;
      order.rejectionReason = reason;
      order.statusHistory.push({
        status: ORDER_STATUS.REJECTED,
        changedBy: adminId,
        note: reason || 'Rejected by admin',
        timestamp: new Date(),
      });

      await order.save({ session });
      await session.commitTransaction();

      logger.info(`Order rejected: ${order.orderNumber}`);
      return order;
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  }
}

module.exports = new OrderService();
