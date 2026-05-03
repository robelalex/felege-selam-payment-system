// src/pages/AdminLogin.js
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Mail, ArrowRight, AlertCircle, Loader, Eye, EyeOff, Shield } from 'lucide-react';
import api from '../services/api';

function AdminLogin() {
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
    // ✅ CORRECT: Use '/login/' not '/admin/login/'
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
    // ✅ CORRECT: Use '/verify/' not '/admin/verify/'
    const response = await api.post('/verify/', {
      user_id: userId,
      otp_code: otpCode
    });

    if (response.data.success) {
      localStorage.setItem('isAdmin', 'true');
      localStorage.setItem('adminUser', JSON.stringify(response.data.user));
      
      if (response.data.user.school) {
        localStorage.setItem('selectedSchool', JSON.stringify({
          id: response.data.user.school.id,
          name: response.data.user.school.name,
          code: response.data.user.school.code,
          logo: response.data.user.school.logo
        }));
      }
      
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
    // ✅ CORRECT: Use '/login/' not '/admin/login/'
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-3 bg-primary-100 rounded-full mb-4">
              <Shield className="h-8 w-8 text-primary-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Two-Factor Authentication</h1>
            <p className="text-gray-600 mt-2">
              Enter the 6-digit code sent to <strong>{email}</strong>
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8">
            <form onSubmit={handleVerifyOTP} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Verification Code
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
                  Code expires in 10 minutes
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
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify & Sign In
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
                  {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend code'}
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back to login
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-primary-100 rounded-full mb-4">
            <Lock className="h-8 w-8 text-primary-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome Back</h1>
          <p className="text-gray-600 mt-2">Sign in to your admin account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
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
                Password
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
                Forgot Password?
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
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>

            <p className="text-center text-sm text-gray-600">
              Don't have an account?{' '}
              <Link to="/admin/register" className="text-primary-600 hover:text-primary-700 font-medium">
                Register School
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AdminLogin;