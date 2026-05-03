import client from './client';

export const ordersApi = {
  // Cart
  getCart: () => client.get('/cart'),
  addToCart: (productId, quantity) =>
    client.post('/cart/items', { productId, quantity }),
  updateCartItem: (itemId, quantity) =>
    client.patch(`/cart/items/${itemId}`, { quantity }),
  removeCartItem: (itemId) => client.delete(`/cart/items/${itemId}`),
  clearCart: () => client.delete('/cart'),

  // Orders
  checkout: (data) => client.post('/orders', data),
  verifyPayment: (orderId, data) =>
    client.post(`/orders/${orderId}/verify-payment`, data),
  listMyOrders: (params) => client.get('/orders', { params }),
  getOrder: (id) => client.get(`/orders/${id}`),
  cancelOrder: (id, reason) =>
    client.post(`/orders/${id}/cancel`, { reason }),

  // Payment
  getPayment: (orderId) => client.get(`/orders/${orderId}/payment`),

  // Invoice
  getInvoice: (orderId) => client.get(`/orders/${orderId}/invoice`),
  downloadInvoice: (orderId) =>
    client.get(`/orders/${orderId}/invoice/download`, { responseType: 'blob' }),

  // Feedback
  submitReview: (orderId, data) =>
    client.post(`/orders/${orderId}/feedback`, data),
};
