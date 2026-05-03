import client from './client';

export const authApi = {
  getMe: () => client.get('/auth/me'),
  logout: () => client.post('/auth/logout'),
  refresh: () => client.post('/auth/refresh'),
  updateProfile: (data) => client.patch('/users/profile', data),
  createCompany: (data) => client.post('/users/company', data),
  getCompany: (id) => client.get(`/companies/${id}`),
  updateCompany: (id, data) => client.patch(`/companies/${id}`, data),
};
