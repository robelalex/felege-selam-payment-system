// src/services/api.js
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://felege-selam-payment-system.onrender.com/api';

console.log('🔍 API Base URL:', API_BASE_URL);
console.log('🔍 Environment:', process.env.NODE_ENV);

// ✅ Helper function to get CSRF token from cookie
const getCSRFToken = () => {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, 10) === 'csrftoken=') {
        cookieValue = decodeURIComponent(cookie.substring(10));
        break;
      }
    }
  }
  return cookieValue;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// ✅ Set CSRF token in default headers
const csrfToken = getCSRFToken();
if (csrfToken) {
  api.defaults.headers.common['X-CSRFToken'] = csrfToken;
  console.log('✅ CSRF Token set in axios defaults');
}

// ===== REQUEST INTERCEPTOR =====
api.interceptors.request.use(
  (config) => {
    console.log('📤 INTERCEPTOR - URL:', config.url);
    console.log('📤 INTERCEPTOR - Method:', config.method);

    // ✅ Attach JWT token — but NOT on login/verify endpoints
    const isAuthEndpoint = config.url && (
      config.url.includes('/login/') ||
      config.url.includes('/verify/') ||
      config.url.includes('/token/refresh/')
    );
    const token = localStorage.getItem('access_token');
    if (token && !isAuthEndpoint) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    // ✅ Ensure CSRF token is included for non-GET requests
    if (config.method !== 'get' && !config.headers['X-CSRFToken']) {
      const csrf = getCSRFToken();
      if (csrf) {
        config.headers['X-CSRFToken'] = csrf;
      }
    }

    // ✅ SKIP adding year/school parameters for excluded endpoints
    const isRegistration = config.url && config.url.includes('/admin/register/');
    const isPaymentInitiation = config.url && config.url.includes('/payments/initiate-payment/');
    const isChapaPayment = config.url && config.url.includes('/chapa/test-payment/');
    const isChapaInitiate = config.url && config.url.includes('/chapa/initiate/');
    const isStaffCreate = config.url && config.url.includes('/staff/create/');
    const isLogin = config.url && config.url.includes('/login/');
    const isVerify = config.url && config.url.includes('/verify/');
    const isSMSConfig = config.url && (config.url.includes('/sms-config/') || config.url.includes('/sms-config-preflight/'));
    const isSMSTest = config.url && config.url.includes('/sms-test/');
    const isSMSMultiSchool = config.url && config.url.includes('/sms/multi-school/');

    const shouldSkipParams = isLogin || isVerify || isStaffCreate || isChapaPayment || isChapaInitiate || isSMSConfig || isSMSTest || isSMSMultiSchool;

    if (shouldSkipParams) {
      console.log('📤 INTERCEPTOR - SKIPPING year params for excluded endpoint');
    } else if (!isRegistration && !isPaymentInitiation) {
      const savedYear = localStorage.getItem('selectedAcademicYear');
      console.log('📤 INTERCEPTOR - savedYear from localStorage:', savedYear);

      if (savedYear) {
        try {
          const year = JSON.parse(savedYear);
          console.log('📤 INTERCEPTOR - Parsed year object:', year);
          if (year && year.id) {
            if (!config.params) config.params = {};
            config.params.academic_year_id = year.id;
            config.params.academic_year = year.year_ec;
            config.params.year_id = year.id;
            console.log('📤 INTERCEPTOR - Added params:', config.params);
          }
        } catch (e) {
          console.error('Error parsing saved year:', e);
        }
      } else {
        console.log('📤 INTERCEPTOR - No saved year found!');
      }
    } else {
      if (isRegistration) console.log('📤 INTERCEPTOR - SKIPPING year params for registration endpoint');
      if (isPaymentInitiation) console.log('📤 INTERCEPTOR - SKIPPING year params for payment initiation endpoint');
    }

    // ✅ Add school ID header
    const savedSchool = localStorage.getItem('selectedSchool');
    console.log('📤 INTERCEPTOR - savedSchool from localStorage:', savedSchool);
    if (savedSchool) {
      try {
        const school = JSON.parse(savedSchool);
        console.log('📤 INTERCEPTOR - Parsed school object:', school);
        if (school && school.id) {
          config.headers['X-School-ID'] = school.id;
          console.log('📤 INTERCEPTOR - Added X-School-ID header:', school.id);
        }
      } catch (e) {
        console.error('Error parsing saved school:', e);
      }
    } else {
      console.log('📤 INTERCEPTOR - No saved school found!');
    }

    console.log('📤 INTERCEPTOR - Final config.params:', config.params);
    console.log('📤 INTERCEPTOR - Final headers:', config.headers);
    return config;
  },
  (error) => Promise.reject(error)
);

// ===== RESPONSE INTERCEPTOR - auto refresh token on 401 =====
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Don't try to refresh on auth endpoints
    const isAuthEndpoint = originalRequest.url?.includes('/login/') ||
      originalRequest.url?.includes('/verify/') ||
      originalRequest.url?.includes('/token/refresh/');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      
      if (isRefreshing) {
        // Queue this request until token is refreshed
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');

      if (!refreshToken) {
        console.log('❌ No refresh token found — logging out');
        localStorage.clear();
        window.location.href = '/admin/login';
        return Promise.reject(error);
      }

      try {
        console.log('🔄 Refreshing access token...');
        const response = await axios.post(
          `${API_BASE_URL}/token/refresh/`,
          { refresh: refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const newAccessToken = response.data.access;
        localStorage.setItem('access_token', newAccessToken);
        console.log('✅ Token refreshed successfully');

        processQueue(null, newAccessToken);
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
        return api(originalRequest);

      } catch (refreshError) {
        console.log('❌ Token refresh failed — logging out');
        processQueue(refreshError, null);
        localStorage.clear();
        window.location.href = '/admin/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ========== USER PROFILE API ==========
export const getCurrentUserProfile = () => api.get('/users/me/');

export const getUserSchoolId = () => {
  const savedSchool = localStorage.getItem('selectedSchool');
  if (savedSchool) {
    try {
      return JSON.parse(savedSchool).id;
    } catch (e) {
      console.error('Error getting school ID:', e);
      return null;
    }
  }
  return null;
};

// Student APIs
export const getStudentById = (studentId) => api.get(`/students/search_by_id/?student_id=${studentId}`);

export const getStudentPaymentHistory = (studentId) =>
  getStudentById(studentId).then(response => api.get(`/students/${response.data.id}/payment_history/`));

export const getStudentPendingPayments = (studentId) =>
  getStudentById(studentId).then(response => api.get(`/students/${response.data.id}/pending_payments/`));

// Payment APIs
export const getActiveDeadlines = () => api.get('/deadlines/active_deadlines/');
export const initiatePayment = (paymentData) => api.post('/payments/initiate-payment/', paymentData);

// School APIs
export const getSchoolInfo = () => api.get('/schools/');

// Academic Year APIs
export const getAcademicYears = () => api.get('/academic-years/');
export const getCurrentAcademicYear = () => api.get('/academic-years/current/');
export const setCurrentAcademicYear = (yearId) => api.post(`/academic-years/${yearId}/set_current/`);
export const createAcademicYear = (yearData) => api.post('/academic-years/', yearData);
export const promoteStudents = (fromYearId, toYearId) =>
  api.post(`/academic-years/${fromYearId}/promote_students/`, { to_year_id: toYearId });

// ✅ Function to fetch CSRF token from backend
export const fetchCSRFToken = async () => {
  try {
    const response = await api.get('/csrf/');
    const csrfToken = response.data.csrfToken;
    if (csrfToken) {
      api.defaults.headers.common['X-CSRFToken'] = csrfToken;
      document.cookie = `csrftoken=${csrfToken}; path=/; SameSite=None; Secure`;
      console.log('✅ CSRF token fetched and set:', csrfToken);
    }
    return csrfToken;
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error);
    return null;
  }
};

export default api;