// src/pages/teacher/TeacherLogin.js
//
// Hidden teacher portal entry point — not linked from any nav/menu.
// Same email+password+OTP flow as /admin/login (staff accounts created
// via StaffMemberViewSet.create_login already support this), but goes
// through teacherApi so the session never touches the admin's tokens.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, ArrowRight, AlertCircle, Loader, Eye, EyeOff, Shield, School } from 'lucide-react';
import { teacherLogin, verifyTeacherOtp, saveTeacherSession, extractError } from '../../services/teacherApi';
import AuthSplitLayout from '../../components/Auth/AuthSplitLayout';

function TeacherLogin() {
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

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await teacherLogin(email.trim(), password);
      if (response.data.success && response.data.requires_otp) {
        setUserId(response.data.user_id);
        setStep('otp');
        setResendTimer(60);
      } else {
        setError(response.data.error || 'Invalid email or password');
      }
    } catch (err) {
      setError(extractError(err, 'Login failed. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await verifyTeacherOtp(userId, otpCode);
      if (response.data.success) {
        saveTeacherSession(response.data.user, response.data.access);
        navigate('/teacher/dashboard');
      } else {
        setError(response.data.error || 'Invalid OTP code');
      }
    } catch (err) {
      setError(extractError(err, 'OTP verification failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    setError('');
    try {
      const response = await teacherLogin(email.trim(), password);
      if (response.data.success) {
        setUserId(response.data.user_id);
        setResendTimer(60);
      } else {
        setError(response.data.error || 'Failed to resend OTP');
      }
    } catch (err) {
      setError(extractError(err, 'Failed to resend OTP. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (step === 'otp') {
    return (
      <AuthSplitLayout
        panelTitle="Almost in."
        panelSubtitle="We sent a 6-digit verification code to keep your teacher account secure."
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 bg-primary-100 rounded-full mb-4">
            <Shield className="h-7 w-7 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Verify Your Identity</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Enter the 6-digit code sent to <strong className="text-gray-700">{email}</strong>
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div>
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
                  <Loader className="h-5 w-5 animate-spin" /> Verifying...
                </>
              ) : (
                <>
                  Verify & Sign In <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendTimer > 0}
                className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resendTimer > 0 ? `Resend code (${resendTimer}s)` : 'Resend code'}
              </button>
            </div>

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setStep('login'); setOtpCode(''); setError(''); }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← Back to login
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
        <div className="inline-flex items-center justify-center p-3 bg-primary-100 rounded-full mb-4">
          <School className="h-7 w-7 text-primary-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Teacher Sign In</h1>
        <p className="text-gray-500 mt-2 text-sm">Sign in to manage your classes, marks, and attendance.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-10"
                placeholder="teacher@school.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
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
                <Loader className="h-5 w-5 animate-spin" /> Signing in...
              </>
            ) : (
              <>
                Sign In <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </form>
      </div>
    </AuthSplitLayout>
  );
}

export default TeacherLogin;
