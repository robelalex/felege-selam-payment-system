// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Layouts
import ParentLayout from './components/Layout/ParentLayout';
import AdminLayout from './components/Layout/AdminLayout';
//Context 
import { YearProvider } from './context/YearContext';
// Pages
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import StudentSearch from './pages/StudentSearch';
import StudentDashboard from './pages/StudentDashboard';
import PaymentPage from './pages/PaymentPage';
import AdminLogin from './pages/AdminLogin';
import AdminRegister from './pages/AdminRegister';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminDashboard from './pages/AdminDashboard';
import AdminReminders from './pages/AdminReminders';
import Reports from './pages/Reports';
import AdminStudents from './pages/AdminStudents';
import AdminPayments from './pages/AdminPayments';
import AdminAcademicYears from './pages/AdminAcademicYears';
import SMSDashboard from './pages/SMSDashboard';
import AdminSlips from './pages/AdminSlips';
import TestDashboard from './pages/TestDashboard';
import LoginTest from './pages/LoginTest';
import SimpleTest from './pages/SimpleTest';
import PaymentSuccess from './pages/PaymentSuccess';
import AdminDeadlines from './pages/AdminDeadlines';
import ParentLogin from './pages/ParentLogin';
import SelectStudent from './pages/SelectStudent';
import ParentDashboard from './pages/ParentDashboard';
import EnterStudentId from './pages/EnterStudentId';
import StaffManagement from './pages/StaffManagement';
import RegistrarDashboard from './pages/RegistrarDashboard';
import PaymentManagerDashboard from './pages/PaymentManagerDashboard';
import ReportingDashboard from './pages/ReportingDashboard';
import ReminderDashboard from './pages/ReminderDashboard';
// Styles
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

const ProtectedRoute = ({ children }) => {
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  return isAdmin ? children : <Navigate to="/admin/login" />;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YearProvider>
      <Router>
        <Toaster position="top-right" />
        <Routes>
          {/* ✅ CHANGED: Root now redirects to parent login */}
          <Route path="/" element={<Navigate to="/parent/login" />} />
          
          {/* Parent Routes - Using ParentLayout */}
          <Route
            path="/student/:studentId"
            element={
              <ParentLayout>
                <StudentDashboard />
              </ParentLayout>
            }
          />
          <Route
            path="/payment"
            element={
              <ParentLayout>
                <PaymentPage />
              </ParentLayout>
            }
          />

          {/* Admin Authentication Routes - No Layout */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/register" element={<AdminRegister />} />
          <Route path="/admin/forgot-password" element={<ForgotPassword />} />
          <Route path="/admin/reset-password" element={<ResetPassword />} />

          {/* Admin Routes - Using AdminLayout (Protected) */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <AdminDashboard />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reminders"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <AdminReminders />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <Reports />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/students"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <AdminStudents />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/payments"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <AdminPayments />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/academic-years"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <AdminAcademicYears />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/sms"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <SMSDashboard />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/slips"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <AdminSlips />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/test"
            element={
              <ProtectedRoute>
                <AdminLayout>
                  <TestDashboard />
                </AdminLayout>
              </ProtectedRoute>
            }
          />
          <Route
              path="/superadmin/dashboard"
              element={
                <ProtectedRoute>
                  <SuperAdminDashboard />
              </ProtectedRoute>
            }
          />

          <Route path="/admin/deadlines" element={
  <ProtectedRoute>
    <AdminLayout>
      <AdminDeadlines />
    </AdminLayout>
  </ProtectedRoute>
} />

<Route path="/admin/staff" element={
  <ProtectedRoute>
    <AdminLayout>
      <StaffManagement />
    </AdminLayout>
  </ProtectedRoute>
} />

<Route path="/registrar/dashboard" element={
  <ProtectedRoute>
    <AdminLayout>
      <RegistrarDashboard />
    </AdminLayout>
  </ProtectedRoute>
} />

<Route path="/payment/dashboard" element={
  <ProtectedRoute>
    <AdminLayout>
      <PaymentManagerDashboard />
    </AdminLayout>
  </ProtectedRoute>
} />

<Route path="/reports/dashboard" element={
  <ProtectedRoute>
    <AdminLayout>
      <ReportingDashboard />
    </AdminLayout>
  </ProtectedRoute>
} />

<Route path="/reminder/dashboard" element={
  <ProtectedRoute>
    <AdminLayout>
      <ReminderDashboard />
    </AdminLayout>
  </ProtectedRoute>
} />

          {/* Test Routes */}
          <Route path="/login-test" element={<LoginTest />} />
          <Route path="/simple-test" element={<SimpleTest />} />
          <Route path="/payment/success" element={<PaymentSuccess />} />

          {/* ✅ Parent Portal Routes - CORRECT ORDER */}
          <Route path="/parent/login" element={<ParentLogin />} />
          <Route path="/parent/enter-student-id" element={<EnterStudentId />} />
          <Route path="/parent/dashboard/:studentId" element={<ParentDashboard />} />
          
          {/* Keep for backward compatibility */}
          <Route path="/parent/select-student" element={<SelectStudent />} />
          
          {/* ✅ Old StudentSearch - you can remove this route if not needed */}
          {/* <Route path="/" element={<StudentSearch />} /> */}
        </Routes>
      </Router>
      </YearProvider>
    </QueryClientProvider>
  );
}

export default App;