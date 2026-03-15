// src/pages/StudentDashboard.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStudentById, getStudentPaymentHistory, getStudentPendingPayments } from '../services/api';
import { 
  User, 
  Calendar, 
  CreditCard, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Download,
  Printer,
  ArrowLeft,
  AlertCircle,
  Loader
} from 'lucide-react';

function StudentDashboard() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  
  const [student, setStudent] = useState(null);
  const [payments, setPayments] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStudentData = async () => {
      try {
        setLoading(true);
        
        const studentResponse = await getStudentById(studentId);
        setStudent(studentResponse.data);
        
        const historyResponse = await getStudentPaymentHistory(studentId);
        setPayments(historyResponse.data);
        
        const pendingResponse = await getStudentPendingPayments(studentId);
        setPendingPayments(pendingResponse.data);
        
      } catch (err) {
        console.error('Error fetching student data:', err);
        setError('Failed to load student information. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchStudentData();
  }, [studentId]);

  const handleMakePayment = (deadline) => {
    navigate('/payment', { 
      state: { 
        studentId: studentId,
        deadline: deadline,
        studentName: student.full_name
      } 
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading student information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 max-w-md">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
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

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header with Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors group"
        >
          <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
          Back to Search
        </button>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-2">
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print</span>
          </button>
          <button className="btn-secondary flex items-center gap-2">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download PDF</span>
          </button>
        </div>
      </div>

      {/* Student Info Card - Modern Gradient Design */}
      <div className="card bg-gradient-to-r from-primary-600 to-primary-800 text-white overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full -translate-x-24 translate-y-24"></div>
        
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-full backdrop-blur-sm">
                <User className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{student.full_name}</h1>
                <p className="text-primary-100 flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                    ID: {student.student_id}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="px-4 py-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <p className="text-xs text-primary-100">Grade</p>
                <p className="text-lg font-semibold">{student.grade} {student.section}</p>
              </div>
              <div className="px-4 py-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <p className="text-xs text-primary-100">Year</p>
                <p className="text-lg font-semibold">{student.academic_year} E.C.</p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div>
              <p className="text-xs text-primary-200">Father's Name</p>
              <p className="font-medium">{student.father_name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-primary-200">Monthly Fee</p>
              <p className="font-medium">{student.monthly_fee} Birr</p>
            </div>
            <div>
              <p className="text-xs text-primary-200">Parent Phone</p>
              <p className="font-medium">{student.parent_phone}</p>
            </div>
            <div>
              <p className="text-xs text-primary-200">Status</p>
              <p className="font-medium capitalize">{student.status}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Payments Card */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-yellow-100 rounded-lg">
            <Clock className="h-5 w-5 text-yellow-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800">Pending Payments</h2>
          {pendingPayments.length > 0 && (
            <span className="ml-auto bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
              {pendingPayments.length} pending
            </span>
          )}
        </div>

        {pendingPayments.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-green-700 font-medium">No pending payments!</p>
            <p className="text-green-600 text-sm mt-1">All fees are paid up to date.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">Month</th>
                  <th className="table-header">Academic Year</th>
                  <th className="table-header">Amount</th>
                  <th className="table-header">Due Date</th>
                  <th className="table-header">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pendingPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell font-medium">{payment.month_name}</td>
                    <td className="table-cell">{payment.academic_year}</td>
                    <td className="table-cell">{payment.amount} Birr</td>
                    <td className="table-cell">
                      {new Date(payment.due_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td className="table-cell">
                      <button 
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-all duration-200 text-sm font-medium shadow-sm hover:shadow-md transform hover:-translate-y-0.5 flex items-center gap-2"
                        onClick={() => handleMakePayment(payment)}
                      >
                        <CreditCard className="h-4 w-4" />
                        Pay Now
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Bank Slip Button */}
{pendingPayments.length > 0 && (
  <div className="mt-4">
    <button
      onClick={() => {/* We'll add state management later */}}
      className="btn-primary flex items-center gap-2"
    >
      <Upload className="h-4 w-4" />
      Upload Bank Slip
    </button>
  </div>
)}

      {/* Payment History Card */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Calendar className="h-5 w-5 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800">Payment History</h2>
          {payments.length > 0 && (
            <span className="ml-auto bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
              {payments.length} payments
            </span>
          )}
        </div>

        {payments.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">No payment history found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">Month</th>
                  <th className="table-header">Academic Year</th>
                  <th className="table-header">Amount</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Payment Date</th>
                  <th className="table-header">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-cell font-medium">{payment.month}</td>
                    <td className="table-cell">{payment.academic_year}</td>
                    <td className="table-cell">{payment.amount} Birr</td>
                    <td className="table-cell">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        payment.status === 'verified' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {payment.status === 'verified' ? (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        ) : (
                          <Clock className="h-3 w-3 mr-1" />
                        )}
                        {payment.status}
                      </span>
                    </td>
                    <td className="table-cell">
                      {new Date(payment.payment_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td className="table-cell capitalize">{payment.payment_method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="flex justify-center pt-4">
        <button 
          className="btn-secondary flex items-center gap-2 px-6 py-3"
          onClick={() => navigate('/')}
        >
          <ArrowLeft className="h-4 w-4" />
          Search Another Student
        </button>
      </div>
    </div>
  );
}

export default StudentDashboard;