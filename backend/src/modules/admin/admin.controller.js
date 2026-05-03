const Order = require('../orders/order.model');
const User = require('../auth/user.model');
const Product = require('../catalog/product.model');
const Company = require('../auth/company.model');
const AuditLog = require('../../common/auditLog.model');
const orderService = require('../orders/order.service');
const catalogService = require('../catalog/catalog.service');
const asyncHandler = require('../../common/asyncHandler');
const AppError = require('../../common/AppError');

/**
 * Dashboard stats aggregation.
 */
const getDashboard = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const yearStart = new Date(today.getFullYear(), 0, 1);

  const [
    ordersToday,
    ordersByStatus,
    revenueToday,
    revenueMonth,
    revenueYear,
    totalProducts,
    lowStockCount,
    outOfStockCount,
    totalClients,
    totalCompanies,
    activePartners,
  ] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: today } }),
    Order.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: today }, status: { $nin: ['cancelled', 'rejected', 'refunded'] } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: monthStart }, status: { $nin: ['cancelled', 'rejected', 'refunded'] } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: yearStart }, status: { $nin: ['cancelled', 'rejected', 'refunded'] } } },
      { $group: { _id: null, total: { $sum: '$grandTotal' } } },
    ]),
    Product.countDocuments({ isActive: true, isDeleted: false }),
    Product.countDocuments({
      isActive: true,
      isDeleted: false,
      $expr: { $lte: ['$stock', '$lowStockThreshold'] },
      stock: { $gt: 0 },
    }),
    Product.countDocuments({ isActive: true, isDeleted: false, stock: 0 }),
    User.countDocuments({ role: 'client', isActive: true }),
    Company.countDocuments({ isActive: true }),
    User.countDocuments({ role: 'delivery', isActive: true, 'deliveryProfile.isAvailable': true }),
  ]);

  // Build status map
  const statusMap = {};
  ordersByStatus.forEach((s) => {
    statusMap[s._id] = s.count;
  });

  res.json({
    success: true,
    data: {
      stats: {
        orders: {
          today: ordersToday,
          pending: statusMap.pending_payment || 0,
          confirmed: statusMap.confirmed || 0,
          processing: statusMap.processing || 0,
          shipped: (statusMap.shipped || 0) + (statusMap.out_for_delivery || 0),
          delivered: statusMap.delivered || 0,
        },
        revenue: {
          today: revenueToday[0]?.total || 0,
          thisMonth: revenueMonth[0]?.total || 0,
          thisYear: revenueYear[0]?.total || 0,
        },
        inventory: {
          totalProducts,
          lowStockProducts: lowStockCount,
          outOfStockProducts: outOfStockCount,
        },
        users: {
          totalClients,
          totalCompanies,
          activeDeliveryPartners: activePartners,
        },
      },
    },
  });
});

/**
 * List all orders with filters.
 */
const listOrders = asyncHandler(async (req, res) => {
  const result = await orderService.listAllOrders(req.query);
  res.json({ success: true, data: { orders: result.orders }, meta: result.meta });
});

/**
 * Accept order.
 */
const acceptOrder = asyncHandler(async (req, res) => {
  const order = await orderService.acceptOrder(
    req.params.orderId,
    req.user._id,
    req.body.note
  );

  // Audit log
  await AuditLog.create({
    actor: req.user._id,
    action: 'order.accept',
    resource: { type: 'Order', id: order._id },
    changes: { to: { status: 'processing' } },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  const socketEmitter = req.app.get('socketEmitter');
  if (socketEmitter) {
    socketEmitter.toUser(order.client).emit('order:updated', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
    });
  }

  res.json({ success: true, data: { order } });
});

/**
 * Reject order.
 */
const rejectOrder = asyncHandler(async (req, res) => {
  const order = await orderService.rejectOrder(
    req.params.orderId,
    req.user._id,
    req.body.reason
  );

  await AuditLog.create({
    actor: req.user._id,
    action: 'order.reject',
    resource: { type: 'Order', id: order._id },
    changes: { to: { status: 'rejected', reason: req.body.reason } },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({ success: true, data: { order } });
});

/**
 * Manage users.
 */
const listUsers = asyncHandler(async (req, res) => {
  const { role, isActive, search, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('company', 'name').lean(),
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { users },
    meta: { page: Number(page), limit: Number(limit), total },
  });
});

const changeUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!['client', 'admin', 'delivery'].includes(role)) {
    throw AppError.badRequest('Invalid role');
  }

  const user = await User.findById(req.params.userId);
  if (!user) throw AppError.notFound('User');

  const oldRole = user.role;
  user.role = role;
  await user.save();

  await AuditLog.create({
    actor: req.user._id,
    action: 'user.roleChange',
    resource: { type: 'User', id: user._id },
    changes: { from: { role: oldRole }, to: { role } },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({ success: true, data: { user } });
});

const changeUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) throw AppError.notFound('User');

  user.isActive = req.body.isActive;
  await user.save();

  await AuditLog.create({
    actor: req.user._id,
    action: 'user.statusChange',
    resource: { type: 'User', id: user._id },
    changes: { to: { isActive: req.body.isActive } },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  res.json({ success: true, data: { user } });
});

/**
 * Low stock products.
 */
const getLowStock = asyncHandler(async (req, res) => {
  const products = await catalogService.getLowStock();
  res.json({ success: true, data: { products } });
});

/**
 * Audit logs.
 */
const getAuditLogs = asyncHandler(async (req, res) => {
  const { action, actorId, resourceType, resourceId, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
  const filter = {};

  if (action) filter.action = action;
  if (actorId) filter.actor = actorId;
  if (resourceType) filter['resource.type'] = resourceType;
  if (resourceId) filter['resource.id'] = resourceId;
  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('actor', 'name email')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { logs },
    meta: { page: Number(page), limit: Number(limit), total },
  });
});

module.exports = {
  getDashboard,
  listOrders,
  acceptOrder,
  rejectOrder,
  listUsers,
  changeUserRole,
  changeUserStatus,
  getLowStock,
  getAuditLogs,
};
