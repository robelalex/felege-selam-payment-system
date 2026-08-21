// src/pages/superadmin/SuperAdminLogin.js
//
// ✅ NEW — dedicated platform-owner login (build spec §2). Deliberately
// NOT AuthSplitLayout (that's the school-admin brand: blue gradient,
// "manage students/staff/parents" copy, register link). This screen uses
// the same dark slate + indigo language as SuperAdminLayout.js so it's
// unmistakable which surface you're in — "platform owner access", not a
// school's login. Not linked from AdminLogin.js, AdminRegister.js, or
// anywhere else a school admin would see; Robel reaches it only by typing
// /superadmin/login directly.
//
// Reuses the exact same email+password+OTP mechanism as AdminLogin.js
// (POST /login/ then /verify/) — this is presentation + access-scoping,
// not a second auth system. The only difference in the request itself is
// portal: 'superadmin', which the backend (admin_login_step1/step2) uses
// to reject any non-is_superuser account before an OTP is ever sent —
// mirroring the existing portal: 'teacher' pattern. The frontend check
// here is UX only; that backend check is the real enforcement.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, Mail, ArrowRight, AlertCircle, Loader, Eye, EyeOff, KeyRound } from 'lucide-react';
import api from '../../services/api';
import { PLATFORM_NAME } from '../../config/brand';

function SuperAdminLogin() {
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

  const requestOtp = async () => {
    return api.post('/login/', { email, password, portal: 'superadmin' });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await requestOtp();
      if (response.data.success && response.data.requires_otp) {
        setUserId(response.data.user_id);
        setStep('otp');
        setResendTimer(60);
        setError('');
      } else {
        setError(response.data.error || 'Invalid email or password');
      }
    } catch (err) {
      console.error('Super admin login error:', err);
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/verify/', {
        user_id: userId,
        otp_code: otpCode,
        portal: 'superadmin',
      });

      if (response.data.success) {
        if (!response.data.user?.is_super_admin) {
          // Backend already rejects non-superusers before OTP is sent,
          // but this is a defense-in-depth check on the frontend too —
          // never route a non-platform-owner into the superadmin shell.
          setError('This account is not authorized for platform admin access.');
          return;
        }

        localStorage.removeItem('selectedAcademicYear');
        localStorage.removeItem('selectedStudent');
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');

        localStorage.setItem('isAdmin', 'true');
        localStorage.setItem('adminUser', JSON.stringify(response.data.user));

        if (response.data.access) {
          localStorage.setItem('access_token', response.data.access);
        }
        if (response.data.refresh) {
          localStorage.setItem('refresh_token', response.data.refresh);
        }

        window.dispatchEvent(new CustomEvent('authChanged'));

        // On success, redirect only to /superadmin/dashboard — never
        // anywhere else (build spec §2).
        navigate('/superadmin/dashboard');
      } else {
        setError(response.data.error || 'Invalid OTP code');
      }
    } catch (err) {
      console.error('Super admin OTP verification error:', err);
      setError(err.response?.data?.error || 'OTP verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;
    setLoading(true);
    setError('');
    try {
      const response = await requestOtp();
      if (response.data.success) {
        setUserId(response.data.user_id);
        setResendTimer(60);
        setError('');
      } else {
        setError(response.data.error || 'Failed to resend code');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLogin = () => {
    setStep('login');
    setOtpCode('');
    setError('');
  };

  return (
    <div className="min-h-screen flex bg-slate-950">
      {/* Left panel — dark, platform-owner branding. Distinct on purpose
          from AdminLogin's blue school-facing panel. */}
      <div className="hidden lg:flex lg:w-[42%] relative bg-slate-900 text-slate-200 flex-col justify-between p-12 overflow-hidden border-r border-slate-800">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-indigo-500/10" />
        <div className="absolute bottom-0 -left-16 w-56 h-56 rounded-full bg-indigo-500/10" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="w-11 h-11 bg-indigo-500/15 rounded-xl flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-indigo-400" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white block leading-tight">Platform Admin</span>
              <span className="text-xs text-slate-500">{PLATFORM_NAME}</span>
            </div>
          </div>

          <h1 className="text-3xl xl:text-4xl font-bold leading-tight mb-4 text-white">
            Platform owner access only.
          </h1>
          <p className="text-slate-400 text-base leading-relaxed max-w-md">
            This is not a school login. This account controls approvals, subscriptions,
            and access for every school on {PLATFORM_NAME}.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-slate-500">
          <KeyRound className="h-3.5 w-3.5" />
          Restricted — OTP-verified, superuser accounts only
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-slate-950">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 justify-center mb-8">
            <div className="w-9 h-9 bg-indigo-500/15 rounded-lg flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-indigo-400" />
            </div>
            <span className="font-bold text-white">Platform Admin</span>
          </div>

          {step === 'otp' ? (
            <>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center p-3 bg-indigo-500/15 rounded-full mb-4">
                  <ShieldCheck className="h-7 w-7 text-indigo-400" />
                </div>
                <h1 className="text-2xl font-bold text-white">Verify it's you</h1>
                <p className="text-slate-400 mt-2 text-sm">
                  We sent a 6-digit code to <strong className="text-slate-200">{email}</strong>
                </p>
              </div>

              <div className="bg-slate-900 rounded-2xl shadow-sm border border-slate-800 p-6 sm:p-8">
                <form onSubmit={handleVerifyOTP} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Verification code
                    </label>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="w-full text-center text-2xl tracking-widest bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-600"
                      placeholder="000000"
                      maxLength={6}
                      required
                      autoFocus
                    />
                    <p className="text-sm text-slate-500 mt-2">Code expires in 10 minutes.</p>
                  </div>

                  {error && (
                    <div className="bg-red-500/10 border-l-4 border-red-500 p-4 rounded">
                      <div className="flex items-center">
                        <AlertCircle className="h-5 w-5 text-red-400 mr-2 flex-shrink-0" />
                        <p className="text-red-300 text-sm">{error}</p>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading || otpCode.length !== 6}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader className="h-5 w-5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        Verify &amp; sign in
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleResendOTP}
                      disabled={resendTimer > 0}
                      className="text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resendTimer > 0 ? `Resend code (${resendTimer}s)` : 'Resend code'}
                    </button>
                  </div>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleBackToLogin}
                      className="text-sm text-slate-500 hover:text-slate-300"
                    >
                      ← Back
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-white">Platform admin sign in</h1>
                <p className="text-slate-400 mt-2 text-sm">Restricted to the platform owner account.</p>
              </div>

              <div className="bg-slate-900 rounded-2xl shadow-sm border border-slate-800 p-6 sm:p-8">
                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-600 rounded-lg pl-10 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="owner@platform.com"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-600 rounded-lg pl-10 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Enter your password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-500/10 border-l-4 border-red-500 p-4 rounded">
                      <div className="flex items-center">
                        <AlertCircle className="h-5 w-5 text-red-400 mr-2 flex-shrink-0" />
                        <p className="text-red-300 text-sm">{error}</p>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader className="h-5 w-5 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      <>
                        Sign in
                        <ArrowRight className="h-5 w-5" />
                      </>
                    )}
                  </button>

                  <p className="text-center text-xs text-slate-600">
                    Not a platform admin? This page is not for school accounts.
                  </p>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default SuperAdminLogin;
