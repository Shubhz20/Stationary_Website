import axios from 'axios';

const API_BASE = '/api/v1';

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send cookies (refresh token)
});

// ── Token management ──
let accessToken = null;
let isRefreshing = false;
let refreshQueue = []; // queued requests waiting for token refresh

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

// ── Request interceptor: attach access token ──
client.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// ── Response interceptor: handle 401 → refresh ──
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retrying, try refresh
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url.includes('/auth/refresh') &&
      !originalRequest.url.includes('/auth/google')
    ) {
      originalRequest._retry = true;

      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then(() => {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return client(originalRequest);
        });
      }

      isRefreshing = true;

      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, null, {
          withCredentials: true,
        });
        const newToken = data.data.accessToken;
        setAccessToken(newToken);

        // Process queued requests
        refreshQueue.forEach((p) => p.resolve());
        refreshQueue = [];

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return client(originalRequest);
      } catch (refreshError) {
        // Refresh failed — clear everything
        clearAccessToken();
        refreshQueue.forEach((p) => p.reject(refreshError));
        refreshQueue = [];

        // Redirect to login
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default client;
