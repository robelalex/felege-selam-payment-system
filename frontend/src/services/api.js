// src/services/api.js
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000/api';
console.log('🔍 API Base URL:', API_BASE_URL);  // ADD THIS LINE

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
  return api.post('/payments/initiate_payment/', paymentData);
};

// School APIs
export const getSchoolInfo = () => {
  return api.get('/schools/');
};

export default api;