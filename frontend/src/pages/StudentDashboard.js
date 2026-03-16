// src/pages/StudentDashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Calendar, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  ArrowLeft,
  AlertCircle,
  Loader,
  Upload,
  Smartphone,
  Check,
  ChevronDown,
  CreditCard,
  Banknote,
  Info
} from 'lucide-react';
import api from '../services/api';
import UploadSlipModal from '../components/UploadSlipModal';

function StudentDashboard() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  
  const [student, setStudent] = useState(null);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [paidPayments, setPaidPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedDeadline, setSelectedDeadline] = useState(null);
  const [expandedSection, setExpandedSection] = useState('pending');
  const [showPaymentInfo, setShowPaymentInfo] = useState(null);

  const fetchStudentData = useCallback(async () => {
    try {
      setLoading(true);
      
      const studentResponse = await api.get(`/students/search_by_id/?student_id=${studentId}`);
      setStudent(studentResponse.data);
      
      const studentDbId = studentResponse.data.id;
      
      const [historyResponse, pendingResponse] = await Promise.all([
        api.get(`/students/${studentDbId}/payment_history/`),
        api.get(`/students/${studentDbId}/pending_payments/`)
      ]);
      
      const allPayments = historyResponse.data || [];
      const paid = allPayments.filter(p => p.status === 'verified');
      setPaidPayments(paid);
      
      setPendingPayments(pendingResponse.data || []);
      
    } catch (err) {
      console.error('Error fetching student data:', err);
      setError('Failed to load student information. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    if (studentId) {
      fetchStudentData();
    }
  }, [studentId, fetchStudentData]);

  const handleTelebirrPayment = (deadline) => {
    // Show payment instructions modal
    setShowPaymentInfo({
      method: 'Telebirr',
      amount: deadline.amount,
      reference: student?.student_id,
      instructions: [
        'Dial *127# on your phone',
        'Select "Payment"',
        'Enter Merchant ID: 123456',
        `Enter Amount: ${deadline.amount} Birr`,
        `Enter Reference: ${student?.student_id}`,
        'Confirm and complete payment',
        'Payment will be auto-verified within 5 minutes'
      ]
    });
  };

  const handleCbeBirrPayment = (deadline) => {
    setShowPaymentInfo({
      method: 'CBE Birr',
      amount: deadline.amount,
      reference: student?.student_id,
      instructions: [
        'Open CBE Birr app',
        'Select "Payment"',
        'Choose "Merchant Payment"',
        'Enter Merchant Code: 789012',
        `Enter Amount: ${deadline.amount} Birr`,
        `Enter Reference: ${student?.student_id}`,
        'Confirm with your PIN',
        'Payment will be auto-verified within 10 minutes'
      ]
    });
  };

  const handleBankTransfer = (deadline) => {
    setShowPaymentInfo({
      method: 'Bank Transfer',
      amount: deadline.amount,
      reference: student?.student_id,
      instructions: [
        'Bank: Commercial Bank of Ethiopia',
        'Account Name: Felege Selam School',
        'Account Number: 10000001234567',
        `Amount: ${deadline.amount} Birr`,
        `Reference: Use Student ID: ${student?.student_id}`,
        'After transfer, upload the bank slip using the "Upload Bank Slip" button',
        'Payment will be verified within 24 hours'
      ],
      showUploadButton: true
    });
  };

  const handleUploadClick = (deadline) => {
    setSelectedDeadline(deadline);
    setShowUploadModal(true);
  };

  const getDaysOverdue = (dueDate) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = today - due;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const getStatusBadge = (dueDate) => {
    const daysOverdue = getDaysOverdue(dueDate);
    if (daysOverdue === 0) return { text: 'Due today', color: 'bg-yellow-100 text-yellow-800', icon: Clock };
    if (daysOverdue > 0) return { text: `${daysOverdue} days overdue`, color: 'bg-red-100 text-red-800', icon: AlertTriangle };
    return { text: 'Upcoming', color: 'bg-blue-100 text-blue-800', icon: Calendar };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 p-4 rounded-lg max-w-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-700">{error}</p>
          </div>
          <button 
            className="mt-4 btn-primary"
            onClick={() => navigate('/')}
          >
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  const totalOverdue = pendingPayments.reduce((sum, p) => {
    const daysOverdue = getDaysOverdue(p.due_date);
    return sum + (daysOverdue > 0 ? p.amount : 0);
  }, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <h1 className="text-xl font-semibold text-gray-900">Payment Portal</h1>
      </div>

      {/* Student Info Card */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-xl shadow-lg p-6 text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-full">
              <User className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{student?.full_name}</h2>
              <p className="text-primary-100">ID: {student?.student_id}</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="text-right">
              <p className="text-primary-200 text-sm">Grade</p>
              <p className="font-semibold">{student?.grade} {student?.section}</p>
            </div>
            <div className="text-right">
              <p className="text-primary-200 text-sm">Year</p>
              <p className="font-semibold">{student?.academic_year}</p>
            </div>
          </div>
        </div>
        
        {/* Balance Alert */}
        {totalOverdue > 0 && (
          <div className="mt-4 bg-red-500/20 rounded-lg p-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-white" />
            <p className="text-white">
              <span className="font-bold">{totalOverdue} Birr</span> overdue. Please pay soon to avoid penalties.
            </p>
          </div>
        )}
      </div>

      {/* Pending Payments Section */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <button
          onClick={() => setExpandedSection(expandedSection === 'pending' ? null : 'pending')}
          className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-orange-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              Pending Payments ({pendingPayments.length})
            </h2>
          </div>
          <ChevronDown className={`h-5 w-5 text-gray-500 transform transition-transform ${
            expandedSection === 'pending' ? 'rotate-180' : ''
          }`} />
        </button>

        <AnimatePresence>
          {expandedSection === 'pending' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="divide-y divide-gray-200"
            >
              {pendingPayments.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <p className="text-gray-600">No pending payments. All caught up!</p>
                </div>
              ) : (
                pendingPayments.map((payment) => {
                  const status = getStatusBadge(payment.due_date);
                  const StatusIcon = status.icon;
                  return (
                    <div key={payment.id} className="p-6 hover:bg-gray-50 transition-colors">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg text-gray-900">
                              {payment.month_name} {payment.academic_year}
                            </h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${status.color}`}>
                              <StatusIcon className="h-3 w-3" />
                              {status.text}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">Due: {new Date(payment.due_date).toLocaleDateString()}</p>
                          <p className="text-2xl font-bold text-primary-600 mt-2">{payment.amount} Birr</p>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            onClick={() => handleTelebirrPayment(payment)}
                            className="btn-primary flex items-center justify-center gap-2 px-4 py-2"
                            title="Pay with Telebirr"
                          >
                            <Smartphone className="h-4 w-4" />
                            Telebirr
                          </button>
                          <button
                            onClick={() => handleCbeBirrPayment(payment)}
                            className="btn-primary flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700"
                            title="Pay with CBE Birr"
                          >
                            <Banknote className="h-4 w-4" />
                            CBE Birr
                          </button>
                          <button
                            onClick={() => handleBankTransfer(payment)}
                            className="btn-secondary flex items-center justify-center gap-2 px-4 py-2"
                            title="Pay via Bank Transfer"
                          >
                            <CreditCard className="h-4 w-4" />
                            Bank Transfer
                          </button>
                          <button
                            onClick={() => handleUploadClick(payment)}
                            className="btn-outline flex items-center justify-center gap-2 px-4 py-2"
                            title="Upload bank slip after transfer"
                          >
                            <Upload className="h-4 w-4" />
                            Upload Slip
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Payment Instructions Modal */}
      <AnimatePresence>
        {showPaymentInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowPaymentInfo(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-primary-100 rounded-full">
                  <Info className="h-6 w-6 text-primary-600" />
                </div>
                <h2 className="text-xl font-bold">{showPaymentInfo.method} Payment</h2>
              </div>

              <div className="bg-primary-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-600">Amount</p>
                <p className="text-2xl font-bold text-primary-600">{showPaymentInfo.amount} Birr</p>
                <p className="text-sm text-gray-600 mt-1">Reference: {showPaymentInfo.reference}</p>
              </div>

              <div className="space-y-3 mb-6">
                <h3 className="font-semibold text-gray-900">Instructions:</h3>
                {showPaymentInfo.instructions.map((instruction, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-primary-100 rounded-full flex items-center justify-center text-xs font-bold text-primary-600 flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-sm text-gray-600">{instruction}</p>
                  </div>
                ))}
              </div>

              {showPaymentInfo.showUploadButton && (
                <button
                  onClick={() => {
                    setShowPaymentInfo(null);
                    handleUploadClick(selectedDeadline || pendingPayments[0]);
                  }}
                  className="btn-primary w-full mb-3"
                >
                  <Upload className="h-4 w-4 mr-2 inline" />
                  Upload Bank Slip
                </button>
              )}

              <button
                onClick={() => setShowPaymentInfo(null)}
                className="btn-secondary w-full"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Paid Payments Section */}
      {paidPayments.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <button
            onClick={() => setExpandedSection(expandedSection === 'paid' ? null : 'paid')}
            className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <h2 className="text-lg font-semibold text-gray-900">
                Payment History ({paidPayments.length})
              </h2>
            </div>
            <ChevronDown className={`h-5 w-5 text-gray-500 transform transition-transform ${
              expandedSection === 'paid' ? 'rotate-180' : ''
            }`} />
          </button>

          <AnimatePresence>
            {expandedSection === 'paid' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="divide-y divide-gray-200"
              >
                {paidPayments.map((payment, idx) => (
                  <div key={idx} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Check className="h-5 w-5 text-green-500" />
                        <div>
                          <p className="font-medium text-gray-900">{payment.month}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(payment.payment_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">{payment.amount} Birr</p>
                        <p className="text-xs text-gray-500 capitalize">{payment.payment_method}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Upload Slip Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <UploadSlipModal
            student={student}
            deadline={selectedDeadline}
            onClose={() => setShowUploadModal(false)}
            onSuccess={() => {
              fetchStudentData();
              setShowUploadModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default StudentDashboard;