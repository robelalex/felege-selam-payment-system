// src/services/api.js
import axios from 'axios';

// ✅ CHANGED: Hardcoded production backend URL
const API_BASE_URL = 'https://felege-selam-payment-system.onrender.com/api';
console.log('🔍 API Base URL:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Add a request interceptor to include the selected year and school
api.interceptors.request.use(
  (config) => {
    console.log('📤 INTERCEPTOR - URL:', config.url);
    console.log('📤 INTERCEPTOR - Method:', config.method);
    
    // ✅ SKIP adding parameters for registration endpoint
    const isRegistration = config.url && config.url.includes('/admin/register/');
    
    if (!isRegistration) {
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
            // Send both id and year_ec to support different backend formats
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
      console.log('📤 INTERCEPTOR - SKIPPING year params for registration endpoint');
    }
    
    // Get selected school from localStorage and add to headers
    const savedSchool = localStorage.getItem('selectedSchool');
    console.log('📤 INTERCEPTOR - savedSchool from localStorage:', savedSchool);
    
    if (savedSchool) {
      try {
        const school = JSON.parse(savedSchool);
        console.log('📤 INTERCEPTOR - Parsed school object:', school);
        
        if (school && school.id) {
          // Add school ID to headers for backend filtering
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

// ========== 🆕 NEW: User Profile API (ADD THIS) ==========
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
// ========== END OF NEW ADDITIONS ==========

// Student APIs - Updated to match router with /students/ prefix
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
  return api.post('/payments/initiate_payment/', paymentData);
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