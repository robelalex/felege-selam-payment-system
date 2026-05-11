// src/services/api.js
import axios from 'axios';

// ✅ Use environment variable for API URL
// Production: uses /api (Vercel proxy)
// Local: uses localhost
// const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/api';
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

// Add a request interceptor to include the selected year and school
api.interceptors.request.use(
  (config) => {
    console.log('📤 INTERCEPTOR - URL:', config.url);
    console.log('📤 INTERCEPTOR - Method:', config.method);
    
    // ✅ Ensure CSRF token is included for non-GET requests
    if (config.method !== 'get' && !config.headers['X-CSRFToken']) {
      const token = getCSRFToken();
      if (token) {
        config.headers['X-CSRFToken'] = token;
      }
    }
    
    // ✅ SKIP adding parameters for excluded endpoints
    const isRegistration = config.url && config.url.includes('/admin/register/');
    const isPaymentInitiation = config.url && config.url.includes('/payments/initiate-payment/');
    const isChapaPayment = config.url && config.url.includes('/chapa/test-payment/');
    const isChapaInitiate = config.url && config.url.includes('/chapa/initiate/');
    const isStaffCreate = config.url && config.url.includes('/staff/create/');
    const isLogin = config.url && config.url.includes('/login/');
    const isVerify = config.url && config.url.includes('/verify/');
    
    // ✅ Check if this request should skip year parameters
    const shouldSkipParams = isLogin || isVerify || isStaffCreate || isChapaPayment || isChapaInitiate;
    
    if (shouldSkipParams) {
      console.log('📤 INTERCEPTOR - SKIPPING year params for excluded endpoint');
    } 
    else if (!isRegistration && !isPaymentInitiation) {
      // Get selected year from localStorage
      const savedYear = localStorage.getItem('selectedAcademicYear');
      console.log('📤 INTERCEPTOR - savedYear from localStorage:', savedYear);
      
      if (savedYear) {
        try {
          const year = JSON.parse(savedYear);
          console.log('📤 INTERCEPTOR - Parsed year object:', year);
          
          if (year && year.id) {
            // Add year as a query parameter
            if (!config.params) {
              config.params = {};
            }
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
      if (isRegistration) {
        console.log('📤 INTERCEPTOR - SKIPPING year params for registration endpoint');
      }
      if (isPaymentInitiation) {
        console.log('📤 INTERCEPTOR - SKIPPING year params for payment initiation endpoint');
      }
    }
    
    // Get selected school from localStorage and add to headers
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
  (error) => {
    return Promise.reject(error);
  }
);

// ========== USER PROFILE API ==========
export const getCurrentUserProfile = () => {
  return api.get('/users/me/');
};

export const getUserSchoolId = () => {
  const savedSchool = localStorage.getItem('selectedSchool');
  if (savedSchool) {
    try {
      const school = JSON.parse(savedSchool);
      return school.id;
    } catch (e) {
      console.error('Error getting school ID:', e);
      return null;
    }
  }
  return null;
};

// Student APIs
export const getStudentById = (studentId) => {
  return api.get(`/students/search_by_id/?student_id=${studentId}`);
};

export const getStudentPaymentHistory = (studentId) => {
  return getStudentById(studentId).then(response => {
    const studentDbId = response.data.id;
    return api.get(`/students/${studentDbId}/payment_history/`);
  });
};

export const getStudentPendingPayments = (studentId) => {
  return getStudentById(studentId).then(response => {
    const studentDbId = response.data.id;
    return api.get(`/students/${studentDbId}/pending_payments/`);
  });
};

// Payment APIs
export const getActiveDeadlines = () => {
  return api.get('/deadlines/active_deadlines/');
};

export const initiatePayment = (paymentData) => {
  return api.post('/payments/initiate-payment/', paymentData);
};

// School APIs
export const getSchoolInfo = () => {
  return api.get('/schools/');
};

// Academic Year APIs
export const getAcademicYears = () => {
  return api.get('/academic-years/');
};

export const getCurrentAcademicYear = () => {
  return api.get('/academic-years/current/');
};

export const setCurrentAcademicYear = (yearId) => {
  return api.post(`/academic-years/${yearId}/set_current/`);
};

export const createAcademicYear = (yearData) => {
  return api.post('/academic-years/', yearData);
};

export const promoteStudents = (fromYearId, toYearId) => {
  return api.post(`/academic-years/${fromYearId}/promote_students/`, {
    to_year_id: toYearId
  });
};

export default api;