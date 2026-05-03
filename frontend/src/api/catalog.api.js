import client from './client';

export const catalogApi = {
  listProducts: (params) => client.get('/products', { params }),
  getProduct: (slug) => client.get(`/products/${slug}`),
  getCategories: () => client.get('/products/categories'),
  getProductReviews: (productId, params) =>
    client.get(`/products/${productId}/reviews`, { params }),

  // Admin
  createProduct: (formData) =>
    client.post('/products', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  updateProduct: (id, data) => client.patch(`/products/${id}`, data),
  deleteProduct: (id) => client.delete(`/products/${id}`),
  uploadImages: (id, formData) =>
    client.post(`/products/${id}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};
