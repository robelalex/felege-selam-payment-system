// src/pages/AdminLogin.js
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Mail, ArrowRight, AlertCircle, Loader, Eye, EyeOff, Shield } from 'lucide-react';
import api from '../services/api';
import AuthSplitLayout from '../components/Auth/AuthSplitLayout';
import { useLanguage } from '../context/LanguageContext';

function AdminLogin() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('login');
  const [userId, setUserId] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const navigate = useNavigate();

  React.useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Step 1: Login with email and password
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/login/', {
        email: email,
        password: password
      });

      if (response.data.success && response.data.requires_otp) {
        setUserId(response.data.user_id);
        setStep('otp');
        setResendTimer(60);
        setError('');
      } else {
        setError(response.data.error || 'Invalid email or password');
      }
    } catch (err) {
      console.error('Login error:', err);
      if (err.response?.data?.error === 'Account pending approval') {
        setError('Your account is pending Super Admin approval. Please wait for verification.');
      } else {
        setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/verify/', {
        user_id: userId,
        otp_code: otpCode
      });

      if (response.data.success) {
        // ✅ Clear any stale data from previous sessions first
        localStorage.removeItem('selectedAcademicYear');
        localStorage.removeItem('selectedStudent');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');

        // ✅ Save user info
        localStorage.setItem('isAdmin', 'true');
        localStorage.setItem('adminUser', JSON.stringify(response.data.user));

        // ✅ Save JWT tokens
        if (response.data.access) {
          localStorage.setItem('access_token', response.data.access);
        }
        if (response.data.refresh) {
          localStorage.setItem('refresh_token', response.data.refresh);
        }

        // ✅ Save school info
        if (response.data.user.school) {
          localStorage.setItem('selectedSchool', JSON.stringify({
            id: response.data.user.school.id,
            name: response.data.user.school.name,
            code: response.data.user.school.code,
            logo: response.data.user.school.logo
          }));
        }

        // ✅ Let YearContext know a token now exists, so it can fetch
        // academic years instead of waiting for the next full page load.
        window.dispatchEvent(new CustomEvent('authChanged'));

        // ✅ This form now only ever handles school-admin/staff logins.
        // The is_super_admin redirect branch that used to live here has
        // been removed — the platform super admin has their own
        // dedicated login at /superadmin/login (see SuperAdminLogin.js),
        // which sends portal='superadmin' so the backend can enforce
        // this server-side too. Every login through this form now goes
        // to /admin/dashboard, full stop.
        navigate('/admin/dashboard');
      } else {
        setError(response.data.error || 'Invalid OTP code');
      }
    } catch (err) {
      console.error('OTP verification error:', err);
      setError(err.response?.data?.error || 'OTP verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOTP = async () => {
    if (resendTimer > 0) return;

    setLoading(true);
    setError('');

    try {
      const response = await api.post('/login/', {
        email: email,
        password: password
      });

      if (response.data.success) {
        setUserId(response.data.user_id);
        setResendTimer(60);
        setError('');
      } else {
        setError(response.data.error || 'Failed to resend OTP');
      }
    } catch (err) {
      setError('Failed to resend OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setStep('login');
    setOtpCode('');
    setError('');
  };

  if (step === 'otp') {
    return (
      <AuthSplitLayout
        panelTitle="You're almost in."
        panelSubtitle="We just sent a 6-digit verification code to keep your school's admin account secure."
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 bg-primary-100 rounded-full mb-4">
            <Shield className="h-7 w-7 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('login_2fa_title')}</h1>
          <p className="text-gray-500 mt-2 text-sm">
            {t('login_2fa_subtitle')} <strong className="text-gray-700">{email}</strong>
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <form onSubmit={handleVerifyOTP} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('login_verify_code')}
              </label>
              <input
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="input-field text-center text-2xl tracking-widest"
                placeholder="000000"
                maxLength={6}
                required
                autoFocus
              />
              <p className="text-sm text-gray-500 mt-2">
                {t('login_code_expires')}
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                <div className="flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3"
            >
              {loading ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  {t('login_verifying')}
                </>
              ) : (
                <>
                  {t('login_verify_sign_in')}
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={resendTimer > 0}
                className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resendTimer > 0 ? `${t('login_resend_code')} (${resendTimer}s)` : t('login_resend_code')}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={handleBackToLogin}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← {t('login_back_to_login')}
              </button>
            </div>
          </form>
        </div>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('login_welcome_back')}</h1>
        <p className="text-gray-500 mt-2 text-sm">{t('login_subtitle')}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('login_email')}
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-10"
                placeholder="admin@school.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('login_password')}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-10 pr-10"
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link to="/admin/forgot-password" className="text-sm text-primary-600 hover:text-primary-700">
              {t('login_forgot_password')}
            </Link>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          >
            {loading ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                {t('login_signing_in')}
              </>
            ) : (
              <>
                {t('login_sign_in')}
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>

          <p className="text-center text-sm text-gray-600">
            {t('login_no_account')}{' '}
            <Link to="/admin/register" className="text-primary-600 hover:text-primary-700 font-medium">
              {t('login_register_school')}
            </Link>
          </p>
        </form>
      </div>
    </AuthSplitLayout>
  );
}

export default AdminLogin;