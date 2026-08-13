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

// ✅ FIX: previously this instance was created with a hardcoded
// 'Content-Type': 'application/json' header applied to every single
// request. For plain JSON calls that's harmless (axios sets it anyway).
// But for FILE uploads (school logo, profile photo, staff photos, slip
// images...) it actively broke things: because the header was already
// explicitly set, axios did NOT replace it with the correct
// 'multipart/form-data; boundary=...' when the request body was a
// FormData object. Django then received a file's bytes tagged as
// "application/json" and rejected it — this is exactly the
// 'The submitted data was not a file...' 400 error, and it's also why
// the profile-photo save earlier looked like it "worked" (200 OK) but
// silently didn't change anything: for that endpoint we don't require
// the file, so Django just ignored the field instead of rejecting it.
// Removing this line fixes BOTH: plain JSON requests still work exactly
// as before (axios sets application/json automatically for those), and
// FormData/file-upload requests now get the correct multipart boundary.
const api = axios.create({
  baseURL: API_BASE_URL,
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
    // ✅ FIX: admin/staff and the parent portal both used the SAME
    // 'access_token' localStorage key. Since localStorage is shared across
    // every tab on this origin, logging into the parent portal in one tab
    // silently overwrote the admin's token in every other tab — an admin
    // mid-session would suddenly start sending the parent's JWT and get
    // "You do not have permission to perform this action." on admin-only
    // actions (e.g. creating a student). Using a separate token namespace
    // for the parent portal, picked by which portal the current page is on,
    // keeps the two sessions from clobbering each other.
    const isParentPortal = window.location.pathname.startsWith('/parent');
    const token = isParentPortal
      ? localStorage.getItem('parent_access_token')
      : localStorage.getItem('access_token');
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

      // ✅ FIX: pick the refresh token / storage keys / login redirect for
      // whichever portal this request actually belongs to, instead of
      // always using the admin's 'refresh_token' and always redirecting to
      // '/admin/login'. Previously a parent whose session expired got
      // bounced to the admin login page (confusing/wrong), and a full
      // `localStorage.clear()` here would also silently log out the OTHER
      // portal's session if both happened to be open in different tabs.
      const isParentPortal = window.location.pathname.startsWith('/parent');
      const accessKey = isParentPortal ? 'parent_access_token' : 'access_token';
      const refreshKey = isParentPortal ? 'parent_refresh_token' : 'refresh_token';
      const loginPath = isParentPortal ? '/parent/login' : '/admin/login';

      const refreshToken = localStorage.getItem(refreshKey);

      if (!refreshToken) {
        console.log('❌ No refresh token found — logging out');
        localStorage.removeItem(accessKey);
        localStorage.removeItem(refreshKey);
        window.location.href = loginPath;
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
        localStorage.setItem(accessKey, newAccessToken);
        console.log('✅ Token refreshed successfully');

        processQueue(null, newAccessToken);
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
        return api(originalRequest);

      } catch (refreshError) {
        console.log('❌ Token refresh failed — logging out');
        processQueue(refreshError, null);
        localStorage.removeItem(accessKey);
        localStorage.removeItem(refreshKey);
        window.location.href = loginPath;
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