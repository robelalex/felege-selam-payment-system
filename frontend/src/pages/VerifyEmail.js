// src/pages/VerifyEmail.js
//
// ✅ NEW — the landing page for the confirmation link sent by
// common/email_service.py:send_registration_confirmation_email(). Hits
// the (already-existing) GET /api/verify-email/<token>/ endpoint.
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import api from '../services/api';

function VerifyEmail() {
  const { token } = useParams();
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verify = async () => {
      try {
        const res = await api.get(`/verify-email/${token}/`);
        if (res.data.success) {
          setStatus('success');
          setMessage(res.data.message);
        } else {
          setStatus('error');
          setMessage(res.data.error || 'Verification failed.');
        }
      } catch (err) {
        setStatus('error');
        setMessage(err.response?.data?.error || 'This verification link is invalid or has expired.');
      }
    };
    verify();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader className="h-10 w-10 text-gray-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Confirming your email…</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Email confirmed</h1>
            <p className="text-sm text-gray-600 mb-6">
              {message} Your registration still needs to be reviewed and approved before you can log in —
              we'll email you once that's done.
            </p>
            <Link to="/admin/login" className="text-sm text-primary-600 font-medium">
              Back to login
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="h-10 w-10 text-red-500 mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Couldn't confirm email</h1>
            <p className="text-sm text-gray-600 mb-6">{message}</p>
            <Link to="/admin/login" className="text-sm text-primary-600 font-medium">
              Back to login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default VerifyEmail;
