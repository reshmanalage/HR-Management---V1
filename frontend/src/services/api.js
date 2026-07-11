import axios from "axios";
import {
  getAccessToken,
  setAccessToken,
  getRefreshToken,
  setRefreshToken,
  clearAccessToken,
} from "../utils/tokenStorage";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Token refresh state ---
let _refreshing = false;
let _queue = [];        // pending requests waiting for the refresh

function _processQueue(error, newToken = null) {
  _queue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(newToken);
  });
  _queue = [];
}

function _redirectToLogin() {
  clearAccessToken();
  // Avoid redirect loops if already on the login page
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

// Response interceptor — handles 401 and 403 caused by expired tokens
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // Only attempt refresh for 401 / 403 and only once per request
    const isAuthError =
      error.response?.status === 401 || error.response?.status === 403;

    if (!isAuthError || original._retried) {
      return Promise.reject(error);
    }

    // If a refresh is already in flight, queue this request
    if (_refreshing) {
      return new Promise((resolve, reject) => {
        _queue.push({ resolve, reject });
      })
        .then((newToken) => {
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        })
        .catch(Promise.reject.bind(Promise));
    }

    original._retried = true;
    _refreshing = true;

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      _refreshing = false;
      _redirectToLogin();
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_BASE_URL}/auth/refresh`,
        { refresh_token: refreshToken }
      );

      setAccessToken(data.access_token);
      if (data.refresh_token) setRefreshToken(data.refresh_token);

      api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
      original.headers.Authorization = `Bearer ${data.access_token}`;

      _processQueue(null, data.access_token);
      return api(original);
    } catch (refreshError) {
      _processQueue(refreshError, null);
      _redirectToLogin();
      return Promise.reject(refreshError);
    } finally {
      _refreshing = false;
    }
  }
);

export default api;
