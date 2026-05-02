// src/components/PaymentReceipt.js
import React, { useState, useEffect } from 'react';
import { Download, Printer, CheckCircle, Building2, User, Calendar, CreditCard, Hash, FileText } from 'lucide-react';

function PaymentReceipt({ payment, onClose }) {
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [studentInfo, setStudentInfo] = useState(null);

  useEffect(() => {
    // ✅ Get student from parent session (not admin)
    const savedStudent = localStorage.getItem('selectedStudent');
    if (savedStudent) {
      const student = JSON.parse(savedStudent);
      setStudentInfo(student);
      
      // Get school from student data if available
      if (student.school_name) {
        setSchoolInfo({
          name: student.school_name,
          logo: student.school_logo || null
        });
      }
    }
    
    // Fallback: if no student data, try to get from parent session
    if (!studentInfo) {
      const parentSession = localStorage.getItem('parentSession');
      if (parentSession) {
        const session = JSON.parse(parentSession);
        // You might need to fetch school from API using email
      }
    }
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // Create a printable version
    const printContent = document.getElementById('receipt-content');
    const originalContents = document.body.innerHTML;
    
    document.body.innerHTML = printContent.innerHTML;
    window.print();
    document.body.innerHTML = originalContents;
    window.location.reload();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatAmount = (amount) => {
    if (!amount) return '0 Birr';
    return `${parseFloat(amount).toLocaleString()} Birr`;
  };

  // Use payment data or fallback to session storage
  const receiptData = payment || (() => {
    const saved = sessionStorage.getItem('lastPayment');
    return saved ? JSON.parse(saved) : null;
  })();

  const studentName = studentInfo?.full_name || receiptData?.student_name || 'N/A';
  const studentId = studentInfo?.student_id || receiptData?.student_id || 'N/A';
  const studentGrade = studentInfo?.grade || receiptData?.grade || 'N/A';
  const schoolName = schoolInfo?.name || receiptData?.school_name || 'ABFM Academy';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Receipt Header */}
        <div className="bg-gradient-to-r from-green-600 to-teal-600 text-white p-6 text-center rounded-t-2xl">
          <div className="inline-flex items-center justify-center p-3 bg-white/20 rounded-full mb-3">
            <CheckCircle className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold">Payment Successful!</h2>
          <p className="text-green-100 mt-1">Your payment has been confirmed</p>
        </div>

        {/* Receipt Content */}
        <div id="receipt-content" className="p-6">
          {/* School Info */}
          <div className="text-center border-b border-gray-200 pb-4 mb-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Building2 className="h-5 w-5 text-gray-600" />
              <h3 className="text-xl font-bold text-gray-800">{schoolName}</h3>
            </div>
            <p className="text-sm text-gray-500">Official Payment Receipt</p>
          </div>

          {/* Student Details */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Student Information
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Student Name</p>
                <p className="font-semibold text-gray-800">{studentName}</p>
              </div>
              <div>
                <p className="text-gray-500">Student ID</p>
                <p className="font-semibold text-gray-800 font-mono">{studentId}</p>
              </div>
              <div>
                <p className="text-gray-500">Grade</p>
                <p className="font-semibold text-gray-800">{studentGrade}</p>
              </div>
              <div>
                <p className="text-gray-500">Date</p>
                <p className="font-semibold text-gray-800 text-xs">
                  {formatDate(receiptData?.created_at || receiptData?.payment_date || new Date())}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Details */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <h4 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Payment Details
            </h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500">Payment For</p>
                <p className="font-semibold text-gray-800">{receiptData?.month || receiptData?.month_name || 'Tuition Fee'}</p>
              </div>
              <div>
                <p className="text-gray-500">Amount</p>
                <p className="font-bold text-green-600 text-lg">{formatAmount(receiptData?.amount)}</p>
              </div>
              <div>
                <p className="text-gray-500">Payment Method</p>
                <p className="font-semibold text-gray-800 capitalize">{receiptData?.payment_method || 'Chapa'}</p>
              </div>
              <div>
                <p className="text-gray-500">Transaction Ref</p>
                <p className="font-semibold text-gray-800 text-xs font-mono break-all">
                  {receiptData?.transaction_reference || receiptData?.tx_ref || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Status</p>
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                  <CheckCircle className="h-3 w-3" />
                  Verified
                </span>
              </div>
              <div>
                <p className="text-gray-500">Receipt Number</p>
                <p className="font-semibold text-gray-800 font-mono text-xs">
                  RCP-{studentId}-{new Date().getFullYear()}
                </p>
              </div>
            </div>
          </div>

          {/* Thank You Message */}
          <div className="text-center pt-4 border-t border-gray-200">
            <p className="text-gray-600">Thank you for your payment!</p>
            <p className="text-xs text-gray-400 mt-1">Keep this receipt for your records</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={handleDownload}
            className="flex-1 btn-outline flex items-center justify-center gap-2 py-2 tap-target"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 btn-outline flex items-center justify-center gap-2 py-2 tap-target"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            onClick={onClose}
            className="flex-1 btn-primary flex items-center justify-center gap-2 py-2 tap-target"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default PaymentReceipt;