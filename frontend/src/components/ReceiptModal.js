// src/components/ReceiptModal.js
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Download, Printer, CheckCircle } from 'lucide-react';

function ReceiptModal({ payment, student, onClose }) {
  const [schoolName, setSchoolName] = useState('ABFM Academy');
  const [studentInfo, setStudentInfo] = useState(null);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    // ✅ Get student from prop first, then localStorage
    let studentData = student;
    
    if (!studentData) {
      const savedStudent = localStorage.getItem('selectedStudent');
      if (savedStudent) {
        studentData = JSON.parse(savedStudent);
      }
    }
    
    if (studentData) {
      setStudentInfo(studentData);
      // Set school name from student data or default to ABFM Academy
      if (studentData.school_name) {
        setSchoolName(studentData.school_name);
      } else if (studentData.student_id && studentData.student_id.startsWith('ABFM')) {
        setSchoolName('ABFM Academy');
      }
    }
  }, [student]);

  // Get student data
  const studentName = studentInfo?.full_name || student?.full_name || 'N/A';
  const studentId = studentInfo?.student_id || student?.student_id || 'N/A';
  const studentGrade = studentInfo?.grade || student?.grade || 'N/A';
  const studentSection = studentInfo?.section || student?.section || '';
  
  // Get payment data
  const paymentMonth = payment?.month || payment?.month_name || 'N/A';
  const paymentAmount = payment?.amount || '0';
  const paymentMethod = payment?.payment_method || 'chapa';
  const paymentRef = payment?.transaction_reference || payment?.tx_ref || 'N/A';
  const paymentDate = payment?.payment_date || payment?.created_at || new Date().toISOString();

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

  const formatAmount = (amount) => {
    if (!amount || amount === '0') return '0 Birr';
    return `${parseFloat(amount).toLocaleString()} Birr`;
  };

  const handleDownload = () => {
    const receiptContent = `
      <!DOCTYPE html>
      <html>
      <head><title>Receipt - ${schoolName}</title>
      <style>
        body { font-family: Arial; margin: 40px; }
        .receipt { max-width: 600px; margin: auto; padding: 30px; border: 1px solid #ddd; border-radius: 10px; }
        .header { text-align: center; }
        .header h1 { color: #2563eb; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .label { font-weight: bold; }
        .total { font-size: 18px; font-weight: bold; color: #2563eb; }
        .footer { text-align: center; margin-top: 30px; }
      </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header"><h1>${schoolName}</h1><p>Payment Receipt</p></div>
          <div class="row"><span class="label">Student Name:</span><span>${studentName}</span></div>
          <div class="row"><span class="label">Student ID:</span><span>${studentId}</span></div>
          <div class="row"><span class="label">Grade:</span><span>${studentGrade} ${studentSection}</span></div>
          <div class="row"><span class="label">Date:</span><span>${formatDate(paymentDate)}</span></div>
          <div class="row"><span class="label">Payment For:</span><span>${paymentMonth}</span></div>
          <div class="row"><span class="label">Amount:</span><span class="total">${formatAmount(paymentAmount)}</span></div>
          <div class="row"><span class="label">Method:</span><span>${paymentMethod}</span></div>
          <div class="row"><span class="label">Transaction Ref:</span><span>${paymentRef}</span></div>
          <div class="footer"><p>Thank you for your payment!</p></div>
        </div>
      </body>
      </html>
    `;
    const blob = new Blob([receiptContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt-${studentId}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html><head><title>Receipt - ${schoolName}</title>
      <style>
        body { font-family: Arial; margin: 40px; }
        .receipt { max-width: 600px; margin: auto; }
        .header { text-align: center; }
        .header h1 { color: #2563eb; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .label { font-weight: bold; }
        .total { font-size: 18px; font-weight: bold; color: #2563eb; }
        .footer { text-align: center; margin-top: 30px; }
      </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header"><h1>${schoolName}</h1><p>Payment Receipt</p></div>
          <div class="row"><span class="label">Student Name:</span><span>${studentName}</span></div>
          <div class="row"><span class="label">Student ID:</span><span>${studentId}</span></div>
          <div class="row"><span class="label">Grade:</span><span>${studentGrade}</span></div>
          <div class="row"><span class="label">Date:</span><span>${formatDate(paymentDate)}</span></div>
          <div class="row"><span class="label">Amount:</span><span class="total">${formatAmount(paymentAmount)}</span></div>
          <div class="footer"><p>Thank you for your payment!</p></div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
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
        className="bg-white rounded-xl shadow-2xl max-w-sm w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold">Payment Receipt</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg tap-target">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="text-center">
            <h3 className="font-bold text-primary-600 text-lg">{schoolName}</h3>
            <p className="text-xs text-gray-500">Official Payment Receipt</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between"><span className="text-gray-500 text-sm">Student:</span><span className="font-medium text-sm">{studentName}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 text-sm">ID:</span><span className="font-mono text-sm">{studentId}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 text-sm">Grade:</span><span className="text-sm">{studentGrade} {studentSection}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 text-sm">Date:</span><span className="text-sm">{formatDate(paymentDate)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 text-sm">Payment For:</span><span className="text-sm">{paymentMonth}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 text-sm">Amount:</span><span className="font-bold text-primary-600 text-base">{formatAmount(paymentAmount)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 text-sm">Method:</span><span className="text-sm capitalize">{paymentMethod}</span></div>
            <div className="flex justify-between"><span className="text-gray-500 text-sm">Transaction:</span><span className="text-xs font-mono break-all max-w-[180px] text-right">{paymentRef}</span></div>
            <div className="flex justify-between pt-1"><span className="text-gray-500 text-sm">Status:</span><span className="text-green-600 text-sm flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Verified</span></div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleDownload} className="flex-1 btn-primary text-sm py-2 tap-target">Download</button>
            <button onClick={handlePrint} className="flex-1 btn-secondary text-sm py-2 tap-target">Print</button>
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