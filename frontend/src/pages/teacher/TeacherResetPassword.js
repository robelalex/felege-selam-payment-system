// src/pages/teacher/TeacherResetPassword.js
//
// Teacher-portal "Reset Password" — the page the emailed link from
// TeacherForgotPassword.js lands on (/teacher/reset-password?token=...).
// The backend endpoint itself is fully generic (any account, by token —
// see authentication/views.py reset_password), so this only differs
// from the admin ResetPassword.js in where it sends the teacher
// afterward.
import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Lock, AlertCircle, Loader, CheckCircle, ArrowLeft } from 'lucide-react';
import { teacherResetPassword, extractError } from '../../services/teacherApi';
import AuthSplitLayout from '../../components/Auth/AuthSplitLayout';

function TeacherResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await teacherResetPassword(token, password);
      if (response.data.success) {
        setSuccess(true);
        setTimeout(() => navigate('/teacher-login'), 3000);
      }
    } catch (err) {
      setError(extractError(err, 'Failed to reset password. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthSplitLayout>
        <div className="text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Invalid Reset Link</h2>
            <p className="text-gray-600 mb-4">The password reset link is invalid or has expired.</p>
            <Link to="/teacher/forgot-password" className="btn-primary inline-flex items-center gap-2">
              Request New Link
            </Link>
          </div>
        </div>
      </AuthSplitLayout>
    );
  }

  if (success) {
    return (
      <AuthSplitLayout>
        <div className="text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="inline-flex items-center justify-center p-3 bg-green-100 rounded-full mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Password Reset Successful!</h2>
            <p className="text-gray-600 mb-4">You can now sign in with your new password.</p>
            <Link to="/teacher-login" className="btn-primary inline-flex items-center gap-2">
              Go to Login
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reset Password</h1>
        <p className="text-gray-500 mt-2 text-sm">Enter your new password</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">New Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-10"
                placeholder="Enter new password"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field pl-10"
                placeholder="Confirm new password"
                required
              />
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
                <Loader className="h-5 w-5 animate-spin" />
                Resetting...
              </>
            ) : (
              'Reset Password'
            )}
          </button>

          <p className="text-center text-sm text-gray-600">
            <Link to="/teacher-login" className="text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" />
              Back to Login
            </Link>
          </p>
        </form>
      </div>
    </AuthSplitLayout>
  );
}

export default TeacherResetPassword;
