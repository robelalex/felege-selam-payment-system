// src/components/ReceiptModal.js
import React from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  Download, 
  Printer, 
  CheckCircle,
  Calendar,
  User,
  CreditCard,
  FileText
} from 'lucide-react';

function ReceiptModal({ payment, student, onClose }) {
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDownload = () => {
    // Create receipt HTML content
    const receiptContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payment Receipt - Felege Selam School</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .receipt { max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #ddd; border-radius: 10px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #2563eb; margin: 0; }
          .header p { color: #666; margin: 5px 0; }
          .details { margin: 20px 0; }
          .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
          .row:last-child { border-bottom: none; }
          .label { font-weight: bold; color: #555; }
          .value { color: #333; }
          .total { font-size: 18px; font-weight: bold; color: #2563eb; }
          .footer { text-align: center; margin-top: 30px; color: #888; font-size: 12px; }
          .stamp { margin-top: 20px; text-align: right; }
          .stamp img { width: 100px; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <h1>Felege Selam School</h1>
            <p>Payment Receipt</p>
            <p>Jimma, Ethiopia</p>
          </div>
          
          <div class="details">
            <div class="row">
              <span class="label">Receipt No:</span>
              <span class="value">RCP-${payment.id}-${new Date().getFullYear()}</span>
            </div>
            <div class="row">
              <span class="label">Date:</span>
              <span class="value">${formatDate(payment.payment_date || new Date())}</span>
            </div>
            <div class="row">
              <span class="label">Student Name:</span>
              <span class="value">${student.full_name}</span>
            </div>
            <div class="row">
              <span class="label">Student ID:</span>
              <span class="value">${student.student_id}</span>
            </div>
            <div class="row">
              <span class="label">Grade:</span>
              <span class="value">${student.grade} ${student.section}</span>
            </div>
<div class="row">
  <span class="label">Payment For:</span>
  <span class="value">${payment.month} ${payment.academic_year || ''}</span>
</div>
            <div class="row">
              <span class="label">Amount Paid:</span>
              <span class="value total">${payment.amount} Birr</span>
            </div>
            <div class="row">
              <span class="label">Payment Method:</span>
              <span class="value">${payment.payment_method}</span>
            </div>
            <div class="row">
              <span class="label">Transaction Ref:</span>
              <span class="value">${payment.transaction_reference || 'N/A'}</span>
            </div>
            <div class="row">
              <span class="label">Status:</span>
              <span class="value" style="color: #22c55e;">✓ Verified</span>
            </div>
          </div>
          
          <div class="stamp">
            <p>_________________________</p>
            <p>Authorized Signature</p>
          </div>
          
          <div class="footer">
            <p>This is an electronically generated receipt. Valid without signature.</p>
            <p>Thank you for your payment!</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Create blob and download
    const blob = new Blob([receiptContent], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt-${student.student_id}-${payment.month}.html`;
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
        <title>Payment Receipt - Felege Selam School</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .receipt { max-width: 600px; margin: 0 auto; padding: 30px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #2563eb; }
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
            <h1>Felege Selam School</h1>
            <p>Payment Receipt</p>
            <p>Jimma, Ethiopia</p>
          </div>
          <div class="details">
            <div class="row"><span class="label">Receipt No:</span><span class="value">RCP-${payment.id}</span></div>
            <div class="row"><span class="label">Date:</span><span class="value">${formatDate(payment.payment_date)}</span></div>
            <div class="row"><span class="label">Student:</span><span class="value">${student.full_name}</span></div>
            <div class="row"><span class="label">ID:</span><span class="value">${student.student_id}</span></div>
            <div class="row"><span class="label">Grade:</span><span class="value">${student.grade} ${student.section}</span></div>
            <div class="row"><span class="label">Payment For:</span><span class="value">${payment.month}</span></div>
            <div class="row"><span class="label">Amount:</span><span class="value total">${payment.amount} Birr</span></div>
            <div class="row"><span class="label">Method:</span><span class="value">${payment.payment_method}</span></div>
          </div>
          <div class="footer">
            <p>Thank you for your payment!</p>
          </div>
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
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-full">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Payment Receipt</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Receipt Content */}
        <div className="p-6">
          <div className="bg-gray-50 rounded-xl p-6 mb-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Receipt Number</p>
                <p className="font-semibold">RCP-{payment.id}-{new Date().getFullYear()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Date</p>
                <p className="font-semibold">{formatDate(payment.payment_date || new Date())}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Student</p>
                <p className="font-semibold">{student.full_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Student ID</p>
                <p className="font-semibold">{student.student_id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Grade</p>
                <p className="font-semibold">{student.grade} {student.section}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Academic Year</p>
                <p className="font-semibold">{student.academic_year}</p>
              </div>
            </div>
          </div>

// In ReceiptModal.js, update the payment display section
<div className="bg-primary-50 rounded-xl p-6 mb-6">
  <div className="grid grid-cols-2 gap-4">
    <div>
      <p className="text-sm text-primary-600">Payment For</p>
      <p className="font-bold text-lg">
        {payment.month} {payment.academic_year || ''}
      </p>
    </div>
    <div>
      <p className="text-sm text-primary-600">Amount Paid</p>
      <p className="font-bold text-2xl text-primary-600">{payment.amount} Birr</p>
    </div>
    <div>
      <p className="text-sm text-primary-600">Payment Method</p>
      <p className="font-semibold capitalize">{payment.payment_method}</p>
    </div>
    <div>
      <p className="text-sm text-primary-600">Status</p>
      <p className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-sm">
        <CheckCircle className="h-4 w-4" />
        Verified
      </p>
    </div>
  </div>
</div>

          {/* Transaction Details */}
          {payment.transaction_reference && (
            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-500">Transaction Reference</p>
              <p className="font-mono text-sm">{payment.transaction_reference}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="btn-primary flex items-center gap-2 flex-1 justify-center"
            >
              <Download className="h-4 w-4" />
              Download Receipt
            </button>
            <button
              onClick={handlePrint}
              className="btn-secondary flex items-center gap-2 flex-1 justify-center"
            >
              <Printer className="h-4 w-4" />
              Print Receipt
            </button>
          </div>

          {/* Note about bank slip upload */}
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700 flex items-start gap-2">
              <FileText className="h-5 w-5 flex-shrink-0" />
              <span>
                For bank transfer payments, please upload your bank slip using the "Upload Slip" button. 
                This digital receipt serves as proof of payment.
              </span>
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default ReceiptModal;