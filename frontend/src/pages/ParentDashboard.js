// src/pages/ParentDashboard.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  GraduationCap, BookOpen, Phone, Mail, Calendar, 
  DollarSign, CreditCard, Clock, CheckCircle, 
  XCircle, AlertCircle, Loader, Eye, Download, 
  ChevronRight, User, Home, Receipt, TrendingUp,
  Shield, Smartphone, Building2, Lock, ArrowLeft,
  Upload, Banknote, Trash2, AlertTriangle
} from 'lucide-react';
import api from '../services/api';
import ParentLayout from '../components/Layout/ParentLayout';
import UploadSlipModal from '../components/UploadSlipModal';
import ReceiptModal from '../components/ReceiptModal';

function ParentDashboard() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState(null);
  const [payments, setPayments] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [pendingSlips, setPendingSlips] = useState([]);
  const [academicYear, setAcademicYear] = useState(null);
  const [processingPaymentId, setProcessingPaymentId] = useState(null);
  const [error, setError] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedDeadline, setSelectedDeadline] = useState(null);
  const [showBankInfo, setShowBankInfo] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  
  // ✅ NEW: Chapa status state
  const [chapaConfigured, setChapaConfigured] = useState(true);
  const [loadingChapa, setLoadingChapa] = useState(true);

  useEffect(() => {
    fetchStudentData();
    fetchAcademicYear();
    fetchPendingSlips();
    checkChapaStatus(); // ✅ Check if Chapa is configured
  }, [studentId]);

  // ✅ NEW: Check Chapa status for this school
  const checkChapaStatus = async () => {
    setLoadingChapa(true);
    try {
      const response = await api.get('/schools/chapa-config/');
      setChapaConfigured(response.data.chapa_enabled);
    } catch (err) {
      console.error('Error checking Chapa status:', err);
      setChapaConfigured(false);
    } finally {
      setLoadingChapa(false);
    }
  };

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      const studentResponse = await api.get(`/students/${studentId}/`);
      setStudent(studentResponse.data);
      
      const paymentResponse = await api.get(`/students/${studentId}/payment_history/`);
      setPayments(paymentResponse.data);
      
      const pendingResponse = await api.get(`/students/${studentId}/pending_payments/`);
      setPendingPayments(pendingResponse.data);
      
      localStorage.setItem('selectedStudent', JSON.stringify(studentResponse.data));
      
    } catch (err) {
      console.error('Error fetching student data:', err);
      setError('Failed to load student information. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingSlips = async () => {
    try {
      const response = await api.get(`/students/${studentId}/pending_slips/`);
      setPendingSlips(response.data);
      console.log('📋 Pending slips:', response.data);
    } catch (err) {
      console.error('Error fetching pending slips:', err);
      setPendingSlips([]);
    }
  };

  const fetchAcademicYear = async () => {
    try {
      const response = await api.get('/academic-years/current/');
      setAcademicYear(response.data);
    } catch (err) {
      console.error('Error fetching academic year:', err);
    }
  };

  // ✅ FIXED: Check verification_status instead of legacy status
  const hasPendingSlip = (deadlineId) => {
    return pendingSlips.some(slip => 
      slip.deadline_id === deadlineId && 
      slip.verification_status !== 'verified'
    );
  };

  const isAlreadyPaid = (deadlineId) => {
    return payments.some(payment => 
      payment.deadline_id === deadlineId && 
      (payment.status === 'verified' || payment.status === 'completed')
    );
  };

  const isPayNowDisabled = (deadlineId) => {
    return isAlreadyPaid(deadlineId) || hasPendingSlip(deadlineId) || !chapaConfigured;
  };

  const getDisabledReason = (deadlineId) => {
    if (!chapaConfigured) return 'Online payments are currently unavailable. Please contact the school.';
    if (isAlreadyPaid(deadlineId)) return 'Already paid for this month';
    if (hasPendingSlip(deadlineId)) return 'You have a pending bank slip. Please wait for auto-verification.';
    return null;
  };

  const handleMakePayment = async (deadlineId, amount) => {
    // Prevent if already paid, has pending slip, or Chapa not configured
    if (isPayNowDisabled(deadlineId)) {
      const reason = getDisabledReason(deadlineId);
      alert(`❌ Cannot process payment: ${reason}`);
      return;
    }
    
    setProcessingPaymentId(deadlineId);
    setError('');
    
    try {
      const payment = pendingPayments.find(p => p.id === deadlineId);
      
      if (!payment) {
        setError('Payment information not found');
        setProcessingPaymentId(null);
        return;
      }
      
      console.log('💰 Paying for specific month:', payment.month_name);
      
      const pendingPaymentInfo = {
        deadline_id: deadlineId,
        amount: parseFloat(amount),
        month_name: payment.month_name,
        academic_year: payment.academic_year,
        student_id: student.student_id,
        student_name: student.full_name,
        grade: student.grade,
        section: student.section,
        school_name: student.school_name || 'School Name',
      };
      sessionStorage.setItem('pendingPayment', JSON.stringify(pendingPaymentInfo));
      
      const response = await api.post('/chapa/test-payment/', {
        student_id: student.student_id,
        deadline_id: deadlineId,
        amount: parseFloat(amount),
        month: payment.month_name,
        paid_by: student.parent_full_name || student.full_name || 'Parent',
        paid_by_phone: student.parent_phone || '0912345678'
      });
      
      if (response.data.checkout_url) {
        window.location.href = response.data.checkout_url;
      } else if (response.data.success) {
        alert('Payment initiated successfully!');
        fetchStudentData();
        fetchPendingSlips();
      } else {
        setError(response.data.error || 'Payment initiation failed');
      }
      
    } catch (err) {
      console.error('Payment error:', err);
      setError(err.response?.data?.error || 'Payment initiation failed. Please try again.');
    } finally {
      setProcessingPaymentId(null);
    }
  };

  const handleBankTransfer = (payment) => {
    const schoolName = student?.school_name || 'School Name';
    const bankName = student?.bank_name || 'Commercial Bank of Ethiopia';
    const accountName = student?.bank_account_holder || schoolName;
    const accountNumber = student?.bank_account_number || 'Not provided';
    
    setShowBankInfo({
      payment: payment,
      amount: payment.amount,
      instructions: [
        `Bank: ${bankName}`,
        `Account Name: ${accountName}`,
        `Account Number: ${accountNumber}`,
        `Reference: Use Student ID: ${student?.student_id}`,
        `Month: ${payment.month_name}`,
        'After transfer, upload the bank slip'
      ]
    });
  };

  const handleUploadClick = (deadline) => {
    setSelectedDeadline(deadline);
    setShowUploadModal(true);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getDaysRemaining = (dueDate) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <ParentLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </ParentLayout>
    );
  }

  if (error || !student) {
    return (
      <ParentLayout>
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-700">{error || 'Student not found'}</p>
          </div>
          <button
            onClick={() => navigate('/parent/enter-student-id')}
            className="mt-4 text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Student ID Entry
          </button>
        </div>
      </ParentLayout>
    );
  }

  return (
    <ParentLayout>
      <div className="space-y-6">
        {/* Student Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-indigo-100 rounded-full">
                <GraduationCap className="h-8 w-8 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{student.full_name}</h1>
                <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-4 w-4" />
                    {student.grade} - {student.section || 'Section A'}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    ID: {student.student_id}
                  </span>
                  {academicYear && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Year: {academicYear.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Monthly Tuition</p>
              <p className="text-2xl font-bold text-indigo-600">
                ETB {parseFloat(student.monthly_fee || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* ✅ NEW: Chapa Configuration Warning */}
        {!loadingChapa && !chapaConfigured && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-lg shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-800 text-sm">⚠️ Online Payments Unavailable</h3>
                <p className="text-yellow-700 text-sm mt-1">
                  Online payments are currently not available for this school. Please contact the school administration for payment options.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Contact Information */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-indigo-600" />
            Parent/Guardian Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-gray-600">
              <Mail className="h-4 w-4 text-gray-400" />
              <span>{student.parent_email || 'Not provided'}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Phone className="h-4 w-4 text-gray-400" />
              <span>{student.parent_phone || 'Not provided'}</span>
            </div>
          </div>
        </div>

        {/* Pending Payments Section */}
        {pendingPayments.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              Pending Payments ({pendingPayments.length})
            </h2>
            <div className="space-y-4">
              {pendingPayments.map((payment) => {
                const daysRemaining = getDaysRemaining(payment.due_date);
                const payNowDisabled = isPayNowDisabled(payment.id);
                const disabledReason = getDisabledReason(payment.id);
                const hasPending = hasPendingSlip(payment.id);
                
                return (
                  <div key={payment.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-semibold text-gray-900">{payment.month_name}</p>
                          {daysRemaining <= 10 && daysRemaining > 0 && (
                            <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                              {daysRemaining} days reminder
                            </span>
                          )}
                          {daysRemaining <= 0 && (
                            <span className="text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                              Overdue
                            </span>
                          )}
                          {hasPending && (
                            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Slip Verifying...
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">Due: {formatDate(payment.due_date)}</p>
                        <p className="text-xl font-bold text-red-600 mt-1">
                          ETB {parseFloat(payment.amount).toLocaleString()}
                        </p>
                        {hasPending && (
                          <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Auto-verifying with CBE bank servers...
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {/* Pay Now button with Chapa status check */}
                        <button
                          onClick={() => handleMakePayment(payment.id, payment.amount)}
                          disabled={processingPaymentId === payment.id || payNowDisabled}
                          title={disabledReason || ''}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm ${
                            payNowDisabled
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-indigo-600 text-white hover:bg-indigo-700'
                          }`}
                        >
                          {processingPaymentId === payment.id ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : (
                            <CreditCard className="h-4 w-4" />
                          )}
                          {!chapaConfigured ? 'Unavailable' : hasPending ? 'Verifying...' : 'Pay Now'}
                        </button>
                        <button
                          onClick={() => handleBankTransfer(payment)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                          <Banknote className="h-4 w-4" />
                          Bank Transfer
                        </button>
                        <button
                          onClick={() => handleUploadClick(payment)}
                          disabled={hasPending}
                          title={hasPending ? 'Verification in progress. Wait for completion.' : ''}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm ${
                            hasPending
                              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          <Upload className="h-4 w-4" />
                          {hasPending ? 'Verifying...' : 'Upload Slip'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Payment History */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Receipt className="h-5 w-5 text-gray-600" />
            Payment History
          </h2>
          
          {payments.length === 0 && pendingSlips.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No payment records found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Description</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Amount</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pendingSlips.map((slip) => (
                    <tr key={`slip-${slip.id}`} className="hover:bg-gray-50 bg-yellow-50/30">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(slip.uploaded_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {slip.month_name || slip.deadline?.month_name || 'Tuition Fee'}
                        <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">
                          Bank Slip Uploaded
                        </span>
                        {slip.transaction_reference && (
                          <p className="text-xs text-gray-400 mt-0.5 font-mono">
                            Ref: {slip.transaction_reference.substring(0, 20)}...
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                        ETB {parseFloat(slip.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {slip.verification_status === 'verified' ? (
                          <span className="inline-flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs">
                            <CheckCircle className="h-3 w-3" /> Verified by System
                          </span>
                        ) : slip.verification_status === 'failed' || slip.verification_status === 'manual_review' ? (
                          <span className="inline-flex items-center gap-1 text-orange-600 bg-orange-50 px-2 py-1 rounded-full text-xs">
                            <AlertTriangle className="h-3 w-3" /> Needs Attention
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-1 rounded-full text-xs">
                            <Loader className="h-3 w-3 animate-spin" /> Verifying...
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedPayment({ ...slip, is_slip: true });
                            setShowReceiptModal(true);
                          }}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View Slip"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(payment.payment_date || payment.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {payment.description || payment.deadline_name || 'Tuition Fee'}
                        {payment.is_from_slip && (
                          <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                            Bank Slip
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                        ETB {parseFloat(payment.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {payment.status === 'verified' && (
                          <span className="inline-flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs">
                            <CheckCircle className="h-3 w-3" /> Verified
                          </span>
                        )}
                        {payment.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full text-xs">
                            <Clock className="h-3 w-3" /> Pending
                          </span>
                        )}
                        {payment.status === 'rejected' && (
                          <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs">
                            <XCircle className="h-3 w-3" /> Rejected
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedPayment(payment);
                            setShowReceiptModal(true);
                          }}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View Receipt"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Receipt Modal */}
        {showReceiptModal && selectedPayment && (
          <ReceiptModal
            payment={selectedPayment}
            student={student}
            onClose={() => {
              setShowReceiptModal(false);
              setSelectedPayment(null);
            }}
          />
        )}

        {/* Payment Methods Info */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6">
          <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-600" />
            Payment Options
          </h3>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <span className="flex items-center gap-2">
              <Smartphone className="h-4 w-4" />
              Telebirr
            </span>
            <span className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Chapa
            </span>
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Bank Transfer
            </span>
            <span className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Bank Slip Upload
            </span>
            <span className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Secure & Encrypted
            </span>
          </div>
        </div>
      </div>

      {/* Bank Transfer Info Modal */}
      {showBankInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowBankInfo(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Bank Transfer Instructions</h3>
            <div className="space-y-2">
              {showBankInfo.instructions.map((instruction, idx) => (
                <p key={idx} className="text-sm text-gray-700">{instruction}</p>
              ))}
            </div>
            <button
              onClick={() => {
                setShowBankInfo(null);
                handleUploadClick(showBankInfo.payment);
              }}
              className="mt-4 w-full btn-primary flex items-center justify-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload Bank Slip
            </button>
            <button onClick={() => setShowBankInfo(null)} className="mt-2 w-full btn-secondary">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Upload Slip Modal */}
      {showUploadModal && (
        <UploadSlipModal
          student={student}
          deadline={selectedDeadline}
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            fetchStudentData();
            fetchPendingSlips();
            setShowUploadModal(false);
          }}
        />
      )}
    </ParentLayout>
  );
}

export default ParentDashboard;