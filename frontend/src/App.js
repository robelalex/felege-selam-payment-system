// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Layouts
import ParentLayout from './components/Layout/ParentLayout';
import AdminLayout from './components/Layout/AdminLayout';

// Context 
import { YearProvider } from './context/YearContext';
import { AuthProvider } from './context/AuthContext';
import { ChapaWarningProvider } from './context/ChapaWarningContext';  // ✅ ADD THIS

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
import PrivacyPolicy from './pages/PrivacyPolicy';
import AdminPaymentHistory from './pages/AdminPaymentHistory';
import SchoolSettings from './pages/SchoolSettings';
import BankSlips from './pages/BankSlips';
import VerifyETSettings from './pages/VerifyETSettings';
import SchoolChapaSettings from './pages/SchoolChapaSettings';

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
  const token = localStorage.getItem('access_token');
  return (isAdmin || token) ? children : <Navigate to="/admin/login" />;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <YearProvider>
          <Router>
            <Toaster position="top-right" />
            <Routes>
              {/* Root redirects to parent login */}
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

              {/* ========== ADMIN ROUTES - WRAPPED WITH CHAPA WARNING PROVIDER ========== */}
              {/* Dashboard */}
              <Route
                path="/admin/dashboard"
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <AdminDashboard />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                }
              />

              {/* Reminders */}
              <Route
                path="/admin/reminders"
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <AdminReminders />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                }
              />

              {/* Reports */}
              <Route
                path="/admin/reports"
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <Reports />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                }
              />

              {/* Students */}
              <Route
                path="/admin/students"
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <AdminStudents />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                }
              />

              {/* Payments */}
              <Route
                path="/admin/payments"
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <AdminPayments />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                }
              />

              {/* Academic Years */}
              <Route
                path="/admin/academic-years"
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <AdminAcademicYears />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                }
              />

              {/* SMS Dashboard */}
              <Route
                path="/admin/sms"
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <SMSDashboard />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                }
              />

              {/* Bank Slips */}
              <Route
                path="/admin/slips"
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <AdminSlips />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                }
              />

              {/* Test */}
              <Route
                path="/admin/test"
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <TestDashboard />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                }
              />

              {/* Super Admin */}
              <Route
                path="/superadmin/dashboard"
                element={
                  <ProtectedRoute>
                    <SuperAdminDashboard />
                  </ProtectedRoute>
                }
              />

              {/* Deadlines */}
              <Route 
                path="/admin/deadlines" 
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <AdminDeadlines />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                } 
              />

              {/* Staff Management */}
              <Route 
                path="/admin/staff" 
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <StaffManagement />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                } 
              />

              {/* Registrar Dashboard */}
              <Route 
                path="/registrar/dashboard" 
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <RegistrarDashboard />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                } 
              />

              {/* Payment Manager Dashboard */}
              <Route 
                path="/payment/dashboard" 
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <PaymentManagerDashboard />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                } 
              />

              {/* Reporting Dashboard */}
              <Route 
                path="/reports/dashboard" 
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <ReportingDashboard />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                } 
              />

              {/* Reminder Dashboard */}
              <Route 
                path="/reminder/dashboard" 
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <ReminderDashboard />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                } 
              />

              {/* School Settings - SMS Configuration */}
              <Route 
                path="/school-settings" 
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <SchoolSettings />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                } 
              />

              {/* Bank Slips */}
              <Route 
                path="/bank-slips" 
                element={
                  <ProtectedRoute>
                    <ChapaWarningProvider>
                      <AdminLayout>
                        <BankSlips />
                      </AdminLayout>
                    </ChapaWarningProvider>
                  </ProtectedRoute>
                } 
              />

              {/* Test Routes */}
              <Route path="/login-test" element={<LoginTest />} />
              <Route path="/simple-test" element={<SimpleTest />} />
              <Route path="/payment/success" element={<PaymentSuccess />} />

              {/* Parent Portal Routes */}
              <Route path="/parent/login" element={<ParentLogin />} />
              <Route path="/parent/enter-student-id" element={<EnterStudentId />} />
              <Route path="/parent/dashboard/:studentId" element={<ParentDashboard />} />
              
              {/* Keep for backward compatibility */}
              <Route path="/parent/select-student" element={<SelectStudent />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/admin-dashboard/payment-history" element={<AdminPaymentHistory />} />
              <Route path="/school/verify-et-settings" element={<VerifyETSettings />} />
              
              {/* ✅ Chapa Settings - Already wrapped with ChapaWarningProvider */}
              <Route path="/admin/chapa-settings" element={
                <ProtectedRoute>
                  <ChapaWarningProvider>
                    <AdminLayout>
                      <SchoolChapaSettings />
                    </AdminLayout>
                  </ChapaWarningProvider>
                </ProtectedRoute>
              } />
            </Routes>
          </Router>
        </YearProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;