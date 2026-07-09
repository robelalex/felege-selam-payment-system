// src/pages/PaymentSuccess.js
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Clock, RefreshCw } from 'lucide-react';
import api from '../services/api';

const MAX_RETRIES = 8;
const RETRY_INTERVAL = 4000;

function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState('');
  const [attemptText, setAttemptText] = useState('Connecting...');
  const [dots, setDots] = useState(0);
  const navigate = useNavigate();
  const tx_ref = searchParams.get('tx_ref');

  useEffect(() => {
    if (!verifying) return;
    const timer = setInterval(() => setDots(d => (d + 1) % 4), 500);
    return () => clearInterval(timer);
  }, [verifying]);

  const checkPayment = useCallback(async (attempt = 0) => {
    if (!tx_ref) {
      setError('No payment reference found.');
      setVerifying(false);
      return;
    }

    setAttemptText(
      attempt === 0 ? 'Verifying your payment' : `Checking payment status (${attempt + 1}/${MAX_RETRIES})`
    );

    // Step 1: local DB status (fast path — works for both dashboard and reminder-link payments)
    try {
      const localRes = await api.get(`/payments/status/${tx_ref}/`, { timeout: 8000 });
      if (localRes.data.success && localRes.data.verified && localRes.data.receipt_token) {
        navigate(`/receipt/${localRes.data.receipt_token}`, { replace: true });
        return;
      }
    } catch (localErr) {
      if (localErr.response?.status !== 404) {
        console.warn('Local DB check failed:', localErr.message);
      }
    }

    // Step 2: ask Chapa directly (covers the gap before the webhook lands)
    try {
      const chapaRes = await api.get(`/chapa/verify/?tx_ref=${tx_ref}`, { timeout: 10000 });
      if (chapaRes.data.success && chapaRes.data.verified && chapaRes.data.receipt_token) {
        navigate(`/receipt/${chapaRes.data.receipt_token}`, { replace: true });
        return;
      }
      if (attempt < MAX_RETRIES - 1) {
        setTimeout(() => checkPayment(attempt + 1), RETRY_INTERVAL);
        return;
      }
    } catch (chapaErr) {
      console.warn(`Attempt ${attempt + 1} error:`, chapaErr.message);
      if (attempt < MAX_RETRIES - 1) {
        setTimeout(() => checkPayment(attempt + 1), RETRY_INTERVAL);
        return;
      }
    }

    setError(
      'We could not automatically confirm your payment. ' +
      'If money was deducted from your account, it will appear in your payment history shortly.'
    );
    setVerifying(false);
  }, [tx_ref, navigate]);

  useEffect(() => {
    const timer = setTimeout(() => checkPayment(0), 2000);
    return () => clearTimeout(timer);
  }, [checkPayment]);

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
            <div className="absolute inset-0 rounded-full border-4 border-primary-600 border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Clock className="h-8 w-8 text-primary-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Verifying Payment</h2>
          <p className="text-gray-500 text-sm mb-2">{attemptText}{''.padEnd(dots + 1, '.')}</p>
          <p className="text-xs text-gray-400">Please keep this page open</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Clock className="h-12 w-12 text-yellow-500" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Verification Pending</h1>
        <p className="text-gray-500 text-sm mb-6">{error}</p>
        <button
          onClick={() => { setVerifying(true); setError(''); checkPayment(0); }}
          className="btn-primary w-full mb-3 flex items-center justify-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Check Again
        </button>
        <button onClick={() => navigate('/parent/enter-student-id')} className="btn-secondary w-full">
          Back to Student Portal
        </button>
      </div>
    </div>
  );
}

export default PaymentSuccess;