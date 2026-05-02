// src/pages/ParentDashboard.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  GraduationCap, BookOpen, Phone, Mail, Calendar, 
  DollarSign, CreditCard, Clock, CheckCircle, 
  XCircle, AlertCircle, Loader, Eye, Download, 
  ChevronRight, User, Home, Receipt, TrendingUp,
  Shield, Smartphone, Building2, Lock, ArrowLeft
} from 'lucide-react';
import api from '../services/api';
import ParentLayout from '../components/Layout/ParentLayout';

function ParentDashboard() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [student, setStudent] = useState(null);
  const [payments, setPayments] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [academicYear, setAcademicYear] = useState(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStudentData();
    fetchAcademicYear();
  }, [studentId]);

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      // Fetch student details
      const studentResponse = await api.get(`/students/${studentId}/`);
      setStudent(studentResponse.data);
      
      // Fetch payment history
      const paymentResponse = await api.get(`/students/${studentId}/payment_history/`);
      setPayments(paymentResponse.data);
      
      // Fetch pending payments
      const pendingResponse = await api.get(`/students/${studentId}/pending_payments/`);
      setPendingPayments(pendingResponse.data);
      
      // Store selected student in localStorage
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

  const handleMakePayment = async (deadlineId, amount) => {
    setProcessingPayment(true);
    setError('');
    
    try {
      // Check if Telebirr or Chapa is configured
      const school = JSON.parse(localStorage.getItem('selectedSchool') || '{}');
      
      // If Telebirr merchant ID exists, use Telebirr
      if (school.telebirr_merchant_id) {
        // Telebirr payment initialization
        const response = await api.post('/payments/initiate_telebirr/', {
          student_id: student.student_id,
          deadline_id: deadlineId,
          amount: amount,
          phone_number: student.parent_phone
        });
        
        if (response.data.payment_url) {
          window.location.href = response.data.payment_url;
        } else if (response.data.checkout_request_id) {
          // Telebirr uses checkout_request_id
          alert('Payment initiated. Please check your phone for the payment prompt.');
          // Poll for payment status
          pollPaymentStatus(response.data.checkout_request_id);
        }
      } 
      // Fallback to Chapa
      else {
        const response = await api.post('/payments/initiate_payment/', {
          student_id: student.student_id,
          deadline_id: deadlineId,
          amount: amount,
          email: student.parent_email,
          phone: student.parent_phone,
          first_name: student.first_name,
          last_name: student.last_name
        });
        
        if (response.data.payment_url) {
          window.location.href = response.data.payment_url;
        } else if (response.data.checkout_url) {
          window.location.href = response.data.checkout_url;
        }
      }
      
    } catch (err) {
      console.error('Payment error:', err);
      setError(err.response?.data?.error || 'Payment initiation failed. Please try again.');
    } finally {
      setProcessingPayment(false);
    }
  };

  const pollPaymentStatus = async (checkoutRequestId) => {
    const interval = setInterval(async () => {
      try {
        const response = await api.get(`/payments/status/${checkoutRequestId}/`);
        if (response.data.status === 'completed') {
          clearInterval(interval);
          alert('Payment successful!');
          fetchStudentData(); // Refresh data
        } else if (response.data.status === 'failed') {
          clearInterval(interval);
          alert('Payment failed. Please try again.');
        }
      } catch (err) {
        console.error('Status check error:', err);
      }
    }, 5000); // Check every 5 seconds
    
    // Stop polling after 2 minutes
    setTimeout(() => clearInterval(interval), 120000);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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
            onClick={() => navigate('/parent/select-student')}
            className="mt-4 text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Student Selection
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

        {/* Pending Payments Section */}
        {pendingPayments.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              Pending Payments
            </h2>
            <div className="space-y-3">
              {pendingPayments.map((payment) => (
                <div key={payment.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{payment.description || payment.deadline_name}</p>
                      <p className="text-sm text-gray-500">Due: {formatDate(payment.due_date)}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-xl font-bold text-red-600">
                        ETB {parseFloat(payment.amount).toLocaleString()}
                      </p>
                      <button
                        onClick={() => handleMakePayment(payment.id, payment.amount)}
                        disabled={processingPayment}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                      >
                        {processingPayment ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          <CreditCard className="h-4 w-4" />
                        )}
                        Pay Now
                      </button>
                    </div>
                  </div>
                </div>
              ))}
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
            Secure Payment Options
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
              <Lock className="h-4 w-4" />
              Secure & Encrypted
            </span>
          </div>
        </div>
      </div>
    </ParentLayout>
  );
}

export default ParentDashboard;