const router = require('express').Router();
const controller = require('./admin.controller');
const { authenticate, requireRole } = require('../../middleware/auth');

// All routes require admin role
router.use(authenticate, requireRole('admin'));

router.get('/admin/dashboard', controller.getDashboard);
router.get('/admin/orders', controller.listOrders);
router.post('/admin/orders/:orderId/accept', controller.acceptOrder);
router.post('/admin/orders/:orderId/reject', controller.rejectOrder);
router.get('/admin/users', controller.listUsers);
router.patch('/admin/users/:userId/role', controller.changeUserRole);
router.patch('/admin/users/:userId/status', controller.changeUserStatus);
router.get('/admin/inventory/low-stock', controller.getLowStock);
router.get('/admin/audit-logs', controller.getAuditLogs);

module.exports = router;
