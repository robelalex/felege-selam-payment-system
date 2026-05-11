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
          // Get the stored payment info from sessionStorage
          const storedPayment = JSON.parse(sessionStorage.getItem('pendingPayment') || '{}');
          
          console.log('📦 Stored Payment:', storedPayment);
          console.log('🔍 Verifying tx_ref:', tx_ref);
          
          // ✅ CHANGED: Use the new payment-status endpoint instead of chapa/verify
          const response = await api.get(`/payments/status/${tx_ref}/`);
          
          console.log('🔍 Verification Response:', response.data);
          
          if (response.data.success && response.data.verified) {
            setSuccess(true);
            
            // Create complete payment object with all fields
            const paymentData = {
              id: storedPayment.deadline_id || response.data.payment_id,
              amount: response.data.amount || storedPayment.amount,
              payment_method: 'chapa',
              month: response.data.month || storedPayment.month_name,
              month_name: response.data.month || storedPayment.month_name,
              academic_year: storedPayment.academic_year,
              transaction_reference: tx_ref,
              payment_date: new Date().toISOString()
            };
            
            console.log('📄 Payment Data for Receipt:', paymentData);
            setPayment(paymentData);
            
            // Create complete student object with school name
            const studentData = {
              full_name: response.data.student_name || storedPayment.student_name,
              student_id: storedPayment.student_id,
              grade: storedPayment.grade,
              section: storedPayment.section || 'A',
              academic_year: storedPayment.academic_year,
              school_name: 'ABFM Academy'
            };
            
            console.log('👨‍🎓 Student Data for Receipt:', studentData);
            setStudent(studentData);
            
            // Save student to localStorage for receipt component
            localStorage.setItem('selectedStudent', JSON.stringify(studentData));
            console.log('✅ Student saved to localStorage:', studentData);
            
          } else {
            console.error('Verification failed:', response.data);
          }
        } catch (err) {
          console.error('Verification error:', err);
          console.error('Error response:', err.response?.data);
        }
      } else {
        console.log('No tx_ref found in URL');
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
                onClick={() => navigate('/parent/enter-student-id')}
                className="btn-secondary w-full"
              >
                Back to Student Portal
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