// src/pages/teacher/TeacherForgotPassword.js
//
// Teacher-portal "Forgot Password". Mirrors the admin ForgotPassword.js
// flow exactly, with two differences: it calls teacherForgotPassword
// (which tags portal: 'teacher' so the emailed link points back to
// /teacher/reset-password instead of /admin/reset-password), and every
// "back to login" link goes to /teacher-login instead of /admin/login.
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, AlertCircle, Loader, CheckCircle, School } from 'lucide-react';
import { teacherForgotPassword, extractError } from '../../services/teacherApi';
import AuthSplitLayout from '../../components/Auth/AuthSplitLayout';

function TeacherForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await teacherForgotPassword(email.trim());
      setSuccess(true);
    } catch (err) {
      setError(extractError(err, 'Failed to send reset link. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthSplitLayout panelTitle="Almost there." panelSubtitle="Check your inbox for a link to set a new password.">
        <div className="text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="inline-flex items-center justify-center p-3 bg-green-100 rounded-full mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Check Your Email</h2>
            <p className="text-gray-600 mb-4">
              If an account exists for {email}, we've sent a password reset link to it.
            </p>
            <Link to="/teacher-login" className="btn-primary inline-flex items-center gap-2">
              Back to Login
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
        <div className="inline-flex items-center justify-center p-3 bg-primary-100 rounded-full mb-4">
          <School className="h-7 w-7 text-primary-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Forgot Password?</h1>
        <p className="text-gray-500 mt-2 text-sm">Enter the email your school admin set up for you — we'll send a reset link there.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-10"
                placeholder="teacher@school.com"
                required
                autoFocus
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
                Sending...
              </>
            ) : (
              'Send Reset Link'
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

export default TeacherForgotPassword;
