// src/pages/PaymentSuccess.js
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Loader, XCircle, Receipt, RefreshCw, Clock } from 'lucide-react';
import api from '../services/api';
import ReceiptModal from '../components/ReceiptModal';

const MAX_RETRIES = 8;
const RETRY_INTERVAL = 4000;

function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [payment, setPayment] = useState(null);
  const [student, setStudent] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [error, setError] = useState('');
  const [attemptText, setAttemptText] = useState('Connecting...');
  const [dots, setDots] = useState(0);
  const navigate = useNavigate();
  const tx_ref = searchParams.get('tx_ref');

  // Animated dots while waiting
  useEffect(() => {
    if (!verifying) return;
    const timer = setInterval(() => setDots(d => (d + 1) % 4), 500);
    return () => clearInterval(timer);
  }, [verifying]);

  const buildPaymentObjects = useCallback((data, storedPayment) => {
    setPayment({
      id: data.payment_id || storedPayment.deadline_id,
      amount: data.amount || storedPayment.amount,
      payment_method: 'chapa',
      month: data.month || storedPayment.month_name,
      month_name: data.month || storedPayment.month_name,
      academic_year: storedPayment.academic_year,
      transaction_reference: tx_ref,
      invoice_number: data.invoice_number || '',
      payment_date: new Date().toISOString(),
    });

    const studentData = {
      full_name: data.student_name || storedPayment.student_name,
      student_id: storedPayment.student_id,
      grade: storedPayment.grade,
      section: storedPayment.section || 'A',
      academic_year: storedPayment.academic_year,
      school_name: 'ABFM Academy',
    };
    setStudent(studentData);
    localStorage.setItem('selectedStudent', JSON.stringify(studentData));
  }, [tx_ref]);

  const checkPayment = useCallback(async (attempt = 0) => {
    if (!tx_ref) {
      setError('No payment reference found.');
      setVerifying(false);
      return;
    }

    const storedPayment = JSON.parse(
      sessionStorage.getItem('pendingPayment') || '{}'
    );

    setAttemptText(
      attempt === 0
        ? 'Verifying your payment'
        : `Checking payment status (${attempt + 1}/${MAX_RETRIES})`
    );

    // ── Step 1: Check local DB first ──────────────────────────────────────
    try {
      const localRes = await api.get(`/payments/status/${tx_ref}/`, {
        timeout: 8000
      });

      if (localRes.data.success && localRes.data.verified) {
        buildPaymentObjects(localRes.data, storedPayment);
        setSuccess(true);
        setVerifying(false);
        return;
      }
    } catch (localErr) {
      // 404 is expected if payment not in DB yet — continue to Chapa verify
      if (localErr.response?.status !== 404) {
        console.warn('Local DB check failed:', localErr.message);
      }
    }

    // ── Step 2: Ask Chapa directly ────────────────────────────────────────
    try {
      const chapaRes = await api.get(`/chapa/verify/?tx_ref=${tx_ref}`, {
        timeout: 10000
      });

      console.log(`Attempt ${attempt + 1} - Chapa response:`, chapaRes.data);

      if (chapaRes.data.success && chapaRes.data.verified) {
        // Payment confirmed by Chapa
        buildPaymentObjects(chapaRes.data, storedPayment);
        setSuccess(true);
        setVerifying(false);
        return;
      }

      // Chapa says not verified yet — retry
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

    // ── All retries exhausted ─────────────────────────────────────────────
    setError(
      'We could not automatically confirm your payment. ' +
      'If money was deducted from your account, it will appear ' +
      'in your payment history within a few minutes.'
    );
    setVerifying(false);
  }, [tx_ref, buildPaymentObjects]);

  useEffect(() => {
    // Small delay to let Chapa process before first check
    const timer = setTimeout(() => checkPayment(0), 2000);
    return () => clearTimeout(timer);
  }, [checkPayment]);

  const handleManualRetry = () => {
    setVerifying(true);
    setError('');
    setSuccess(false);
    checkPayment(0);
  };

  // ── Loading screen ────────────────────────────────────────────────────────
  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 text-center">

          {/* Animated circle */}
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
            <div className="absolute inset-0 rounded-full border-4 border-primary-600 border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Clock className="h-8 w-8 text-primary-600" />
            </div>
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Verifying Payment
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            {attemptText}{''.padEnd(dots + 1, '.')}
          </p>

          {/* Progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
            <div
              className="bg-primary-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${(parseInt(attemptText.match(/\d+/) || [1]) / MAX_RETRIES) * 100}%` }}
            />
          </div>

          <p className="text-xs text-gray-400">
            Please keep this page open
          </p>
        </div>
      </div>
    );
  }

  // ── Result screen ─────────────────────────────────────────────────────────
  return (
    <>
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-lg p-8 text-center">

          {success ? (
            <>
              {/* Success animation */}
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Payment Confirmed!
              </h1>
              <p className="text-gray-500 text-sm mb-1">
                Your payment has been verified successfully.
              </p>
              {payment?.invoice_number && (
                <p className="text-xs text-gray-400 mb-6">
                  Invoice: <span className="font-semibold text-gray-600">{payment.invoice_number}</span>
                </p>
              )}
              {!payment?.invoice_number && <div className="mb-6" />}

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
              <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Clock className="h-12 w-12 text-yellow-500" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                Verification Pending
              </h1>
              <p className="text-gray-500 text-sm mb-4">
                {error}
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
                <p className="text-blue-800 text-xs font-semibold mb-1">
                  ℹ️ What to do next
                </p>
                <ul className="text-blue-700 text-xs space-y-1">
                  <li>• Wait 2–3 minutes and tap "Check Again"</li>
                  <li>• Check your payment history below</li>
                  <li>• If deducted, contact school admin</li>
                </ul>
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