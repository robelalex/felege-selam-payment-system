// src/pages/ParentDashboard.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  GraduationCap, BookOpen, Phone, Mail, Calendar, 
  DollarSign, CreditCard, Clock, CheckCircle, 
  XCircle, AlertCircle, Loader, Eye, Download, 
  ChevronRight, User, Home, Receipt, TrendingUp,
  Shield, Smartphone, Building2, Lock, ArrowLeft,
  Upload, Banknote
} from 'lucide-react';
import api from '../services/api';
import ParentLayout from '../components/Layout/ParentLayout';
import UploadSlipModal from '../components/UploadSlipModal';

function ParentDashboard() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState(null);
  const [payments, setPayments] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [academicYear, setAcademicYear] = useState(null);
  const [processingPaymentId, setProcessingPaymentId] = useState(null);
  const [error, setError] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedDeadline, setSelectedDeadline] = useState(null);
  const [showBankInfo, setShowBankInfo] = useState(null);

  useEffect(() => {
    fetchStudentData();
    fetchAcademicYear();
  }, [studentId]);

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

  const fetchAcademicYear = async () => {
    try {
      const response = await api.get('/academic-years/current/');
      setAcademicYear(response.data);
    } catch (err) {
      console.error('Error fetching academic year:', err);
    }
  };

  // UPDATED: Track which specific deadline is being processed
  const handleMakePayment = async (deadlineId, amount) => {
    setProcessingPaymentId(deadlineId);
    setError('');
    
    try {
      // Find the specific payment month from pendingPayments
      const payment = pendingPayments.find(p => p.id === deadlineId);
      
      if (!payment) {
        setError('Payment information not found');
        setProcessingPaymentId(null);
        return;
      }
      
      console.log('💰 Paying for specific month:', payment.month_name);
      console.log('💰 Deadline ID:', deadlineId);
      console.log('💰 Amount:', amount);
      
      // Store payment info in sessionStorage for receipt after payment
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
      console.log('💾 Stored pending payment info:', pendingPaymentInfo);
      
      const response = await api.post('/chapa/test-payment/', {
        student_id: student.student_id,
        deadline_id: deadlineId,
        amount: parseFloat(amount),
        month: payment.month_name,
        paid_by: student.parent_full_name || student.full_name || 'Parent',
        paid_by_phone: student.parent_phone || '0912345678'
      });
      
      console.log('💰 Payment response:', response.data);
      
      if (response.data.checkout_url) {
        // Redirect to Chapa payment page
        window.location.href = response.data.checkout_url;
      } else if (response.data.success) {
        alert('Payment initiated successfully!');
        fetchStudentData();
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
  // Get school bank details from the student object
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

  const pollPaymentStatus = async (checkoutRequestId) => {
    const interval = setInterval(async () => {
      try {
        const response = await api.get(`/payments/status/${checkoutRequestId}/`);
        if (response.data.status === 'completed') {
          clearInterval(interval);
          alert('Payment successful!');
          fetchStudentData();
        } else if (response.data.status === 'failed') {
          clearInterval(interval);
          alert('Payment failed. Please try again.');
        }
      } catch (err) {
        console.error('Status check error:', err);
      }
    }, 5000);
    
    setTimeout(() => clearInterval(interval), 120000);
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

  const getPaymentStatusBadge = (status) => {
    switch (status) {
      case 'paid':
      case 'completed':
      case 'verified':
        return <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs"><CheckCircle className="h-3 w-3" /> Paid</span>;
      case 'pending':
      case 'unpaid':
        return <span className="flex items-center gap-1 text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full text-xs"><Clock className="h-3 w-3" /> Pending</span>;
      case 'failed':
        return <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full text-xs"><XCircle className="h-3 w-3" /> Failed</span>;
      default:
        return <span className="text-gray-500 text-xs">{status}</span>;
    }
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

        {/* Pending Payments Section - Updated button with individual loading state */}
        {pendingPayments.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              Pending Payments ({pendingPayments.length})
            </h2>
            <div className="space-y-4">
              {pendingPayments.map((payment) => {
                const daysRemaining = getDaysRemaining(payment.due_date);
                return (
                  <div key={payment.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
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
                        </div>
                        <p className="text-sm text-gray-500">Due: {formatDate(payment.due_date)}</p>
                        <p className="text-xl font-bold text-red-600 mt-1">
                          ETB {parseFloat(payment.amount).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {/* UPDATED BUTTON: Only shows loading spinner for the clicked month */}
                        <button
                          onClick={() => handleMakePayment(payment.id, payment.amount)}
                          disabled={processingPaymentId === payment.id}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm"
                        >
                          {processingPaymentId === payment.id ? (
                            <Loader className="h-4 w-4 animate-spin" />
                          ) : (
                            <CreditCard className="h-4 w-4" />
                          )}
                          Pay Now
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
                          className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                        >
                          <Upload className="h-4 w-4" />
                          Upload Slip
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
          
          {payments.length === 0 ? (
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
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-600">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(payment.payment_date || payment.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {payment.description || payment.deadline_name || 'Tuition Fee'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                        ETB {parseFloat(payment.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {getPaymentStatusBadge(payment.status)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {payment.receipt_url && (
                          <a
                            href={payment.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800"
                          >
                            <Download className="h-4 w-4 inline" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
            setShowUploadModal(false);
          }}
        />
      )}
    </ParentLayout>
  );
}

export default ParentDashboard;