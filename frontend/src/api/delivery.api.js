import client from './client';

export const deliveryApi = {
  // Delivery partner
  myDeliveries: (params) => client.get('/deliveries/my', { params }),
  updateStatus: (deliveryId, data) =>
    client.patch(`/deliveries/${deliveryId}/status`, data),
  updateLocation: (deliveryId, coordinates) =>
    client.post(`/deliveries/${deliveryId}/location`, { coordinates }),
  submitProof: (deliveryId, formData) =>
    client.post(`/deliveries/${deliveryId}/proof`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  // Tracking (client/admin)
  getTracking: (deliveryId) =>
    client.get(`/deliveries/${deliveryId}/tracking`),
};
