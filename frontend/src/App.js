// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Layouts
import ParentLayout from './components/Layout/ParentLayout';
import AdminLayout from './components/Layout/AdminLayout';

// Pages
import StudentSearch from './pages/StudentSearch';
import StudentDashboard from './pages/StudentDashboard';
import PaymentPage from './pages/PaymentPage';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminReminders from './pages/AdminReminders';
import Reports from './pages/Reports';
import AdminStudents from './pages/AdminStudents';
import AdminPayments from './pages/AdminPayments';
import AdminAcademicYears from './pages/AdminAcademicYears';
import SMSDashboard from './pages/SMSDashboard';
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
      <Router>
        <Toaster position="top-right" />
        <Routes>
          {/* Parent Routes - Using ParentLayout */}
          <Route
            path="/"
            element={
              <ParentLayout>
                <StudentSearch />
              </ParentLayout>
            }
          />
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

          {/* Admin Login - No Layout (centered form) */}
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Admin Routes - Using AdminLayout */}
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
        </Routes>
      </Router>
    </QueryClientProvider>

    
  );
}

export default App;