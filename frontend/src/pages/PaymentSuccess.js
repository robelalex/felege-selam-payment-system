// src/pages/PaymentSuccess.js
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, Loader, XCircle, Receipt } from 'lucide-react';
import api from '../services/api';
import ReceiptModal from '../components/ReceiptModal';

function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [payment, setPayment] = useState(null);
  const [student, setStudent] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const navigate = useNavigate();

useEffect(() => {
  const verifyPayment = async () => {
    const tx_ref = searchParams.get('tx_ref');
    
    if (tx_ref) {
      try {
        // Get the stored payment info
        const storedPayment = JSON.parse(sessionStorage.getItem('pendingPayment') || '{}');
        
        // Verify the payment with your backend
        const response = await api.get(`/chapa/verify/?tx_ref=${tx_ref}`);
        
        if (response.data.success && response.data.status === 'success') {
          setSuccess(true);
          
          // Create payment object with month info from sessionStorage
          const paymentData = {
            id: storedPayment.deadline_id,
            amount: storedPayment.amount,
            payment_method: 'chapa',
            month: storedPayment.month_name,  // Use stored month name
            academic_year: storedPayment.academic_year,
            transaction_reference: tx_ref,
            payment_date: new Date().toISOString()
          };
          
          setPayment(paymentData);
          
          // Create student object from stored data
          setStudent({
            full_name: storedPayment.student_name,
            student_id: storedPayment.student_id,
            grade: storedPayment.grade,
            section: storedPayment.section
          });
        }
      } catch (err) {
        console.error('Verification error:', err);
      }
    }
    setVerifying(false);
  };

  verifyPayment();
}, [searchParams]);

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          {success ? (
            <>
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
              <p className="text-gray-600 mb-6">Your payment has been processed successfully.</p>
              
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
                onClick={() => navigate('/')}
                className="btn-secondary w-full"
              >
                Back to Home
              </button>
            </>
          ) : (
            <>
              <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Failed</h1>
              <p className="text-gray-600 mb-6">There was an issue processing your payment.</p>
              <button
                onClick={() => navigate(-1)}
                className="btn-primary w-full"
              >
                Try Again
              </button>
            </>
          )}
        </div>
      </div>

      {/* Receipt Modal */}
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