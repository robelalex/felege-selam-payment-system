// src/services/teacherApi.js
//
// Dedicated axios instance for the teacher web portal.
//
// Why a separate instance instead of reusing services/api.js:
// The existing `api` client stores its token under the SAME localStorage
// keys ('access_token' / 'refresh_token' / 'isAdmin') that the Admin portal
// uses, and its 401 handler hard-redirects to '/admin/login'. If a teacher
// logged in through that client it would silently overwrite an existing
// admin session in the same browser (and vice versa), and a teacher's
// expired token would bounce them to the admin login page. Keeping the
// teacher token under its own keys ('teacher_access_token', etc.) makes the
// two portals fully independent, mirroring how the Flutter app keeps
// 'auth_token' (parent) and 'teacher_access_token' (teacher) separate.

import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://felege-selam-payment-system.onrender.com/api';

const teacherApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

teacherApi.interceptors.request.use((config) => {
  const isAuthEndpoint = config.url && (config.url.includes('/login/') || config.url.includes('/verify/'));
  const token = localStorage.getItem('teacher_access_token');
  if (token && !isAuthEndpoint) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  const schoolId = localStorage.getItem('teacher_school_id');
  if (schoolId) {
    config.headers['X-School-ID'] = schoolId;
  }

  return config;
});

teacherApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token missing/expired/rejected — same handling as the app: clear
      // the teacher session and send them back to the teacher login.
      localStorage.removeItem('teacher_access_token');
      localStorage.removeItem('teacher_user');
      localStorage.removeItem('teacher_school_id');
      if (window.location.pathname !== '/teacher-login') {
        window.location.href = '/teacher-login';
      }
    }
    return Promise.reject(error);
  }
);

export const getTeacherSession = () => {
  const token = localStorage.getItem('teacher_access_token');
  const userRaw = localStorage.getItem('teacher_user');
  if (!token || !userRaw) return null;
  try {
    return { token, user: JSON.parse(userRaw) };
  } catch {
    return null;
  }
};

export const saveTeacherSession = (user, accessToken) => {
  localStorage.setItem('teacher_access_token', accessToken);
  localStorage.setItem('teacher_user', JSON.stringify(user));
  if (user?.school?.id) {
    localStorage.setItem('teacher_school_id', String(user.school.id));
  }
};

export const clearTeacherSession = () => {
  localStorage.removeItem('teacher_access_token');
  localStorage.removeItem('teacher_user');
  localStorage.removeItem('teacher_school_id');
};

// ─── Auth (same endpoints as the web Admin login / Flutter teacher login) ──
export const teacherLogin = (email, password) => teacherApi.post('/login/', { email, password, portal: 'teacher' });
export const verifyTeacherOtp = (userId, otpCode) => teacherApi.post('/verify/', { user_id: userId, otp_code: otpCode, portal: 'teacher' });

// ─── My classes ──────────────────────────────────────────────────────────
export const getMyAssignments = () => teacherApi.get('/teacher/my-assignments/');
export const getClassAssignments = (grade) => teacherApi.get('/class-assignments/', { params: { grade } });

// ─── Terms / assessment types ───────────────────────────────────────────
export const getTerms = (academicYearId) => teacherApi.get('/terms/', { params: { academic_year_id: academicYearId } });

// ✅ Item 7 — semester groupings (quarter-structure schools only). An
// empty list back is expected/normal for a semester-structure school.
export const getSemesters = (academicYearId) => teacherApi.get('/semesters/', { params: { academic_year_id: academicYearId } });

// ✅ Item 7 — school's term_structure ('semester' | 'quarter'), to decide
// whether the Quarter/Semester toggle should even show up on results screens.
export const getSchoolInfo = () => teacherApi.get('/schools/');

// ─── Gradebook ───────────────────────────────────────────────────────────
export const getGradebook = ({ subjectId, termId, grade, section = '' }) =>
  teacherApi.get('/marks/gradebook/', { params: { subject_id: subjectId, term_id: termId, grade, section } });

export const saveMarks = ({ subjectId, assessmentTypeId, grade, section = '', entries }) =>
  teacherApi.post('/marks/bulk_save/', { subject_id: subjectId, assessment_type_id: assessmentTypeId, grade, section, entries });

export const submitMarks = ({ subjectId, assessmentTypeId, grade, section = '' }) =>
  teacherApi.post('/marks/submit/', { subject_id: subjectId, assessment_type_id: assessmentTypeId, grade, section });

export const submitStudent = ({ subjectId, termId, grade, section = '', studentId }) =>
  teacherApi.post('/marks/submit_student/', { subject_id: subjectId, term_id: termId, grade, section, student_id: studentId });

export const homeroomDecide = ({ accept, subjectId, assessmentTypeId, grade, section, note = '', studentId }) => {
  const body = { subject_id: subjectId, assessment_type_id: assessmentTypeId, grade, section, note };
  if (studentId != null) body.student_id = studentId;
  return teacherApi.post(`/marks/${accept ? 'homeroom_accept' : 'homeroom_reject'}/`, body);
};

// ✅ NEW: "everything submitted and waiting on this homeroom teacher,
// across all subjects" — backs the Pending Reviews rollup screen.
export const getHomeroomPending = ({ grade, section }) =>
  teacherApi.get('/marks/homeroom_pending/', { params: { grade, section } });

// ─── Homeroom: daily attendance ─────────────────────────────────────────
export const getAttendanceRoster = ({ grade, section, date }) =>
  teacherApi.get('/attendance/roster/', { params: { grade, section, date } });

export const saveAttendance = ({ grade, section, date, entries }) =>
  teacherApi.post('/attendance/bulk_save/', { grade, section, date, entries });

// ─── Subject teacher: period attendance ─────────────────────────────────
export const getSubjectAttendanceRoster = ({ subjectId, grade, section, date }) =>
  teacherApi.get('/subject-attendance/roster/', { params: { subject_id: subjectId, grade, section, date } });

export const saveSubjectAttendance = ({ subjectId, grade, section, date, entries }) =>
  teacherApi.post('/subject-attendance/bulk_save/', { subject_id: subjectId, grade, section, date, entries });

// ─── Results / ranking (Phase 4) ────────────────────────────────────────
export const getClassResults = ({ termId, grade, section = '' }) =>
  teacherApi.get('/results/class_results/', { params: { term_id: termId, grade, section } });

// Term 1 | Term 2 | ... | Average-of-terms view for the homeroom's
// "Check Result and Award" screen (Phase 6 cumulative logic, reused).
export const getClassResultsByTerms = ({ grade, section = '', academicYearId }) =>
  teacherApi.get('/results/class_results_terms/', { params: { grade, section, academic_year_id: academicYearId } });

// ✅ Item 7 — same idea, one level up: Semester 1 | Semester 2 | ... |
// year-average view, for quarter-structure schools. Only ever has data
// once at least one quarter's marks have been accepted for a semester.
export const getClassResultsBySemesters = ({ grade, section = '', academicYearId }) =>
  teacherApi.get('/semester-results/class_results_semesters/', { params: { grade, section, academic_year_id: academicYearId } });

export const extractError = (err, fallback) =>
  err.response?.data?.error || err.response?.data?.detail || fallback;

export default teacherApi;