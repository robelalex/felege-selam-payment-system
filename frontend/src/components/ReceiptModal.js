// src/components/ReceiptModal.js
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  Download, 
  Printer, 
  CheckCircle,
  FileText
} from 'lucide-react';

function ReceiptModal({ payment, student, onClose }) {
  const [schoolName, setSchoolName] = useState('School');
  const [schoolLogo, setSchoolLogo] = useState(null);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    // Get school info from localStorage
    const savedSchool = localStorage.getItem('selectedSchool');
    if (savedSchool) {
      try {
        const school = JSON.parse(savedSchool);
        setSchoolName(school.name || 'School');
        setSchoolLogo(school.logo || null);
      } catch (e) {
        console.error('Error parsing school:', e);
      }
    }
  }, []);

  // Safely get values with fallbacks
  const studentName = student?.full_name || student?.name || 'N/A';
  const studentId = student?.student_id || 'N/A';
  const studentGrade = student?.grade || 'N/A';
  const studentSection = student?.section || '';
  
  const paymentMonth = payment?.month || payment?.month_name || 'N/A';
  const paymentAcademicYear = payment?.academic_year || student?.academic_year || '';
  const paymentAmount = payment?.amount || '0';
  const paymentMethod = payment?.payment_method || 'chapa';
  const paymentRef = payment?.transaction_reference || payment?.tx_ref || 'N/A';
  const paymentId = payment?.id || 'N/A';
  const paymentDate = payment?.payment_date || new Date().toISOString();

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  const handleDownload = () => {
    const receiptContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payment Receipt - ${schoolName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .receipt { max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #ddd; border-radius: 10px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #2563eb; margin: 0; }
          .details { margin: 20px 0; }
          .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; }
          .total { font-size: 18px; font-weight: bold; color: #2563eb; }
          .footer { text-align: center; margin-top: 30px; color: #888; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <h1>${schoolName}</h1>
            <p>Payment Receipt</p>
          </div>
          <div class="details">
            <div class="row"><span class="label">Receipt No:</span><span class="value">RCP-${paymentId}-${currentYear}</span></div>
            <div class="row"><span class="label">Date:</span><span class="value">${formatDate(paymentDate)}</span></div>
            <div class="row"><span class="label">Student Name:</span><span class="value">${studentName}</span></div>
            <div class="row"><span class="label">Student ID:</span><span class="value">${studentId}</span></div>
            <div class="row"><span class="label">Grade:</span><span class="value">${studentGrade} ${studentSection}</span></div>
            <div class="row"><span class="label">Payment For:</span><span class="value">${paymentMonth} ${paymentAcademicYear}</span></div>
            <div class="row"><span class="label">Amount Paid:</span><span class="value total">${paymentAmount} Birr</span></div>
            <div class="row"><span class="label">Payment Method:</span><span class="value">${paymentMethod}</span></div>
            <div class="row"><span class="label">Transaction Ref:</span><span class="value">${paymentRef}</span></div>
            <div class="row"><span class="label">Status:</span><span class="value" style="color: #22c55e;">✓ Verified</span></div>
          </div>
          <div class="footer"><p>Thank you for your payment!</p></div>
        </div>
      </body>
      </html>
    `;
    const blob = new Blob([receiptContent], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt-${studentId}-${paymentMonth}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    const printContent = `
      <html>
      <head>
        <title>Payment Receipt - ${schoolName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .receipt { max-width: 600px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #2563eb; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .label { font-weight: bold; }
          .value { color: #333; }
          .total { font-size: 18px; font-weight: bold; color: #2563eb; }
          .footer { text-align: center; margin-top: 30px; color: #888; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <h1>${schoolName}</h1>
            <p>Payment Receipt</p>
          </div>
          <div class="row"><span class="label">Student Name:</span><span class="value">${studentName}</span></div>
          <div class="row"><span class="label">Student ID:</span><span class="value">${studentId}</span></div>
          <div class="row"><span class="label">Grade:</span><span class="value">${studentGrade} ${studentSection}</span></div>
          <div class="row"><span class="label">Date:</span><span class="value">${formatDate(paymentDate)}</span></div>
          <div class="row"><span class="label">Payment For:</span><span class="value">${paymentMonth}</span></div>
          <div class="row"><span class="label">Amount:</span><span class="value total">${paymentAmount} Birr</span></div>
          <div class="row"><span class="label">Method:</span><span class="value">${paymentMethod}</span></div>
          <div class="footer"><p>Thank you for your payment!</p></div>
        </div>
      </body>
      </html>
    `;
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        className="bg-white rounded-xl shadow-2xl max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            {schoolLogo ? (
              <img src={schoolLogo} alt={schoolName} className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <div className="p-1.5 bg-green-100 rounded-full">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            )}
            <h2 className="text-lg font-bold text-gray-900">Payment Receipt</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        {/* School Name in Receipt */}
        <div className="px-5 pt-3">
          <div className="text-center border-b border-gray-100 pb-2">
            <h3 className="font-bold text-primary-600">{schoolName}</h3>
          </div>
        </div>

        {/* Receipt Content */}
        <div className="p-5 space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <span className="text-sm text-gray-500">Student Name:</span>
              <span className="text-sm font-medium text-gray-800">{studentName}</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <span className="text-sm text-gray-500">Student ID:</span>
              <span className="text-sm font-medium text-gray-800">{studentId}</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <span className="text-sm text-gray-500">Grade:</span>
              <span className="text-sm font-medium text-gray-800">{studentGrade} {studentSection}</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <span className="text-sm text-gray-500">Date:</span>
              <span className="text-sm font-medium text-gray-800">{formatDate(paymentDate)}</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <span className="text-sm text-gray-500">Payment For:</span>
              <span className="text-sm font-medium text-gray-800">{paymentMonth} {paymentAcademicYear}</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <span className="text-sm text-gray-500">Amount:</span>
              <span className="text-base font-bold text-primary-600">{paymentAmount} Birr</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <span className="text-sm text-gray-500">Payment Method:</span>
              <span className="text-sm font-medium capitalize text-gray-800">{paymentMethod}</span>
            </div>
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <span className="text-sm text-gray-500">Transaction Ref:</span>
              <span className="text-xs font-mono text-gray-500 break-all max-w-[180px] text-right">{paymentRef}</span>
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="text-sm text-gray-500">Status:</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                <CheckCircle className="h-3 w-3" />
                Verified
              </span>
            </div>
          </div>

          {/* Receipt Number */}
          <div className="bg-gray-50 rounded-lg p-3 mt-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">Receipt Number:</span>
              <span className="text-xs font-semibold text-gray-700">RCP-{paymentId}-{currentYear}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={handleDownload} className="flex-1 btn-primary text-sm py-2 flex items-center justify-center gap-2">
              <Download className="h-4 w-4" />
              Download
            </button>
            <button onClick={handlePrint} className="flex-1 btn-secondary text-sm py-2 flex items-center justify-center gap-2">
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>

          <div className="bg-blue-50 rounded-lg p-2 mt-1">
            <p className="text-xs text-blue-700 text-center">Thank you for your payment!</p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default ReceiptModal;