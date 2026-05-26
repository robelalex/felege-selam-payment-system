// src/pages/PaymentSuccess.js
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Loader, XCircle, Receipt, RefreshCw, Clock } from 'lucide-react';
import api from '../services/api';
import ReceiptModal from '../components/ReceiptModal';

const TIMEOUT_SECONDS = 30;
const MAX_RETRIES = 6;
const RETRY_INTERVAL = 5000; // 5 seconds

function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [payment, setPayment] = useState(null);
  const [student, setStudent] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(TIMEOUT_SECONDS);
  const [retryCount, setRetryCount] = useState(0);
  const [status, setStatus] = useState('Connecting to server...');
  const navigate = useNavigate();

  const tx_ref = searchParams.get('tx_ref');

  const checkPayment = useCallback(async (attempt = 0) => {
    if (!tx_ref) {
      setError('No payment reference found in URL.');
      setVerifying(false);
      return;
    }

    try {
      setStatus(attempt === 0
        ? 'Verifying your payment...'
        : `Checking payment status (attempt ${attempt + 1} of ${MAX_RETRIES})...`
      );

      // 10 second timeout per request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await api.get(`/payments/status/${tx_ref}/`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      console.log('🔍 Verification Response:', response.data);

      if (response.data.success && response.data.verified) {
        // Payment confirmed
        const storedPayment = JSON.parse(
          sessionStorage.getItem('pendingPayment') || '{}'
        );

        setSuccess(true);
        setVerifying(false);

        setPayment({
          id: response.data.payment_id || storedPayment.deadline_id,
          amount: response.data.amount || storedPayment.amount,
          payment_method: 'chapa',
          month: response.data.month || storedPayment.month_name,
          month_name: response.data.month || storedPayment.month_name,
          academic_year: storedPayment.academic_year,
          transaction_reference: tx_ref,
          invoice_number: response.data.invoice_number || '',
          payment_date: new Date().toISOString(),
        });

        const studentData = {
          full_name: response.data.student_name || storedPayment.student_name,
          student_id: storedPayment.student_id,
          grade: storedPayment.grade,
          section: storedPayment.section || 'A',
          academic_year: storedPayment.academic_year,
          school_name: 'ABFM Academy',
        };

        setStudent(studentData);
        localStorage.setItem('selectedStudent', JSON.stringify(studentData));
        return;
      }

      // Payment not verified yet — retry if attempts remain
      if (attempt < MAX_RETRIES - 1) {
        setRetryCount(attempt + 1);
        setStatus(`Payment pending. Checking again in 5 seconds... (${attempt + 1}/${MAX_RETRIES})`);
        setTimeout(() => checkPayment(attempt + 1), RETRY_INTERVAL);
      } else {
        // All retries exhausted
        setError(
          'Payment verification is taking longer than expected. ' +
          'If you completed payment, it will be updated automatically. ' +
          'Please check your payment history.'
        );
        setVerifying(false);
      }

    } catch (err) {
      console.error('Verification error:', err);

      if (err.name === 'AbortError' || err.code === 'ECONNABORTED') {
        // Request timed out
        if (attempt < MAX_RETRIES - 1) {
          setRetryCount(attempt + 1);
          setStatus(`Server is slow. Retrying... (${attempt + 1}/${MAX_RETRIES})`);
          setTimeout(() => checkPayment(attempt + 1), RETRY_INTERVAL);
        } else {
          setError(
            'Server is not responding. Your payment may still be processing. ' +
            'Please check your payment history in a few minutes.'
          );
          setVerifying(false);
        }
      } else {
        setError(`Verification error: ${err.message}`);
        setVerifying(false);
      }
    }
  }, [tx_ref]);

  // Start verification on mount
  useEffect(() => {
    checkPayment(0);
  }, [checkPayment]);

  // Countdown timer shown while verifying
  useEffect(() => {
    if (!verifying) return;
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [verifying, countdown]);

  // Manual retry
  const handleManualRetry = () => {
    setVerifying(true);
    setError('');
    setCountdown(TIMEOUT_SECONDS);
    setRetryCount(0);
    checkPayment(0);
  };

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <Loader className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            Verifying Payment
          </h2>
          <p className="text-gray-500 text-sm mb-4">{status}</p>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-4">
            {Array.from({ length: MAX_RETRIES }).map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i < retryCount
                    ? 'bg-primary-600'
                    : i === retryCount
                    ? 'bg-primary-300'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-2 text-gray-400 text-xs">
            <Clock className="h-3 w-3" />
            <span>
              {retryCount === 0
                ? `Timeout in ${countdown}s`
                : `Attempt ${retryCount + 1} of ${MAX_RETRIES}`}
            </span>
          </div>

          <p className="text-xs text-gray-400 mt-3">
            Please do not close this page
          </p>
        </div>
      </div>
    );
  }

  // ── Result screen ───────────────────────────────────────────────────────────
  return (
    <>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">

          {success ? (
            <>
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Payment Successful!
              </h1>
              <p className="text-gray-600 mb-2">
                Your payment has been confirmed.
              </p>
              {payment?.invoice_number && (
                <p className="text-sm text-gray-500 mb-6">
                  Invoice: <strong>{payment.invoice_number}</strong>
                </p>
              )}

              {payment && student && (
                <button
                  onClick={() => setShowReceipt(true)}
                  className="btn-primary w-full mb-3 flex items-center justify-center gap-2"
                >
                  <Receipt className="h-4 w-4" />
                  View Receipt
                </button>
              )}

              <button
                onClick={() => navigate('/parent/enter-student-id')}
                className="btn-secondary w-full"
              >
                Back to Student Portal
              </button>
            </>

          ) : (
            <>
              <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Verification Timeout
              </h1>
              <p className="text-gray-600 mb-4 text-sm">
                {error || 'Could not verify your payment in time.'}
              </p>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6 text-left">
                <p className="text-yellow-800 text-xs font-medium mb-1">
                  ⚠️ Did you complete the payment?
                </p>
                <p className="text-yellow-700 text-xs">
                  If money was deducted from your account, your payment will
                  be confirmed automatically within a few minutes. Check your
                  payment history.
                </p>
              </div>

              <button
                onClick={handleManualRetry}
                className="btn-primary w-full mb-3 flex items-center justify-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Check Again
              </button>

              <button
                onClick={() => navigate('/parent/enter-student-id')}
                className="btn-secondary w-full"
              >
                Back to Student Portal
              </button>
            </>
          )}

        </div>
      </div>

      {showReceipt && payment && student && (
        <ReceiptModal
          payment={payment}
          student={student}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </>
  );
}

export default PaymentSuccess;