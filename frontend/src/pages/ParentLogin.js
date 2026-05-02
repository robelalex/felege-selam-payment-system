// src/pages/ParentLogin.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, AlertCircle, Loader, Shield, CheckCircle } from 'lucide-react';
import api from '../services/api';

function ParentLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('email');
  const [userId, setUserId] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [resendTimer, setResendTimer] = useState(0);

  React.useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/parent/send-otp/', {
        email: email
      });

      if (response.data.success) {
        setUserId(response.data.user_id);
        setStep('otp');
        setResendTimer(60);
        setError('');
      } else {
        setError(response.data.error || 'Failed to send OTP');
      }
    } catch (err) {
      console.error('Send OTP error:', err);
      setError(err.response?.data?.error || 'Email not found. Please check your email address.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/parent/verify/', {
        user_id: userId,
        otp_code: otpCode
      });

      if (response.data.success && response.data.students) {
        // Store parent session
        localStorage.setItem('parentSession', JSON.stringify({
          email: email,
          user_id: userId,
          verified: true,
          verifiedAt: new Date().toISOString()
        }));
        
        // ✅ FIX: Save the first student to localStorage for receipt
        if (response.data.students && response.data.students.length > 0) {
          const firstStudent = response.data.students[0];
          // Enhance student data with school name
          const studentWithSchool = {
            ...firstStudent,
            school_name: firstStudent.school_name || 'ABFM Academy',
            full_name: firstStudent.full_name,
            student_id: firstStudent.student_id,
            grade: firstStudent.grade,
            section: firstStudent.section || 'A'
          };
          localStorage.setItem('selectedStudent', JSON.stringify(studentWithSchool));
          console.log('✅ Student saved to localStorage:', studentWithSchool);
        }
        
        navigate('/parent/enter-student-id');
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

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await api.post('/parent/send-otp/', {
        email: email
      });
      
      if (response.data.success) {
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

  const handleBackToEmail = () => {
    setStep('email');
    setOtpCode('');
    setError('');
  };

  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-teal-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-3 bg-green-100 rounded-full mb-4">
              <Shield className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Verify Your Identity</h1>
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
                className="btn-primary w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700"
              >
                {loading ? (
                  <>
                    <Loader className="h-5 w-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify & Access Portal
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResendOTP}
                  disabled={resendTimer > 0}
                  className="text-sm text-green-600 hover:text-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {resendTimer > 0 ? `Resend code in ${resendTimer}s` : 'Resend code'}
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleBackToEmail}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back to email
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-teal-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-green-100 rounded-full mb-4">
            <Mail className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Parent Portal</h1>
          <p className="text-gray-600 mt-2">Access your child's academic information</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSendOTP} className="space-y-6">
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
                  placeholder="parent@example.com"
                  required
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">
                We'll send a 6-digit verification code to this email
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
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700"
            >
              {loading ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  Sending Code...
                </>
              ) : (
                <>
                  Send Verification Code
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>

            <div className="border-t pt-4">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>One-time code sent to your email</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500 mt-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Code expires in 10 minutes</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-500 mt-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>Your information is encrypted</span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default ParentLogin;