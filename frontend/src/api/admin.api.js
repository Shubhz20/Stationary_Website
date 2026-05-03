import client from './client';

export const adminApi = {
  getDashboard: () => client.get('/admin/dashboard'),
  listOrders: (params) => client.get('/admin/orders', { params }),
  acceptOrder: (orderId, note) =>
    client.post(`/admin/orders/${orderId}/accept`, { note }),
  rejectOrder: (orderId, reason) =>
    client.post(`/admin/orders/${orderId}/reject`, { reason }),
  assignDelivery: (orderId, partnerId, estimatedDeliveryAt) =>
    client.post(`/orders/${orderId}/assign-delivery`, { partnerId, estimatedDeliveryAt }),
  getAvailablePartners: () => client.get('/delivery/partners/available'),
  initiateRefund: (orderId, amount, reason) =>
    client.post(`/orders/${orderId}/refund`, { amount, reason }),
  listUsers: (params) => client.get('/admin/users', { params }),
  changeUserRole: (userId, role) =>
    client.patch(`/admin/users/${userId}/role`, { role }),
  changeUserStatus: (userId, isActive) =>
    client.patch(`/admin/users/${userId}/status`, { isActive }),
  getLowStock: () => client.get('/admin/inventory/low-stock'),
  getAuditLogs: (params) => client.get('/admin/audit-logs', { params }),
  respondToReview: (feedbackId, adminResponse) =>
    client.patch(`/feedback/${feedbackId}/respond`, { adminResponse }),
};
