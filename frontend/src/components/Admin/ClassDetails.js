// src/components/Admin/ClassDetails.js
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  Search, 
  Download,
  CheckCircle,
  Clock,
  AlertCircle,
  Mail,
  Phone,
  ChevronDown,
  ChevronUp,
  Eye,
  RefreshCw,
  DollarSign,
  Calendar
} from 'lucide-react';
import api from '../../services/api';

const ClassDetails = ({ grade, students, onBack }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState({});
  const [expandedStudent, setExpandedStudent] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const months = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ];

  // Fetch payment data for all students in this class
  useEffect(() => {
    fetchPaymentData();
  }, [students]);

  const fetchPaymentData = async () => {
    setLoading(true);
    try {
      const paymentPromises = students.map(async (student) => {
        try {
          const response = await api.get(`/students/${student.id}/payment_history/`);
          return { 
            studentId: student.id, 
            payments: response.data,
            totalPaid: response.data.reduce((sum, p) => sum + parseFloat(p.amount), 0)
          };
        } catch (err) {
          console.error(`Error fetching payments for student ${student.id}:`, err);
          return { studentId: student.id, payments: [], totalPaid: 0 };
        }
      });

      const results = await Promise.all(paymentPromises);
      
      const paymentMap = {};
      results.forEach(result => {
        paymentMap[result.studentId] = {
          payments: result.payments,
          totalPaid: result.totalPaid
        };
      });
      
      setPaymentData(paymentMap);
    } catch (err) {
      console.error('Error fetching payment data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Get payment status for a specific student and month
  const getPaymentStatus = (studentId, monthName) => {
    const studentPayments = paymentData[studentId]?.payments || [];
    const payment = studentPayments.find(p => p.month === monthName);
    
    if (payment) {
      return payment.status === 'verified' ? 'paid' : 'pending';
    }
    return 'pending';
  };

  // Get status icon based on payment status
  const getStatusIcon = (status) => {
    switch(status) {
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-green-500" title="Paid" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" title="Pending" />;
      default:
        return <AlertCircle className="h-4 w-4 text-red-500" title="Overdue" />;
    }
  };

  // Calculate payment summary for a student
  const getPaymentSummary = (studentId) => {
    const studentPayments = paymentData[studentId]?.payments || [];
    const paidCount = studentPayments.filter(p => p.status === 'verified').length;
    const totalPaid = paymentData[studentId]?.totalPaid || 0;
    const pendingCount = studentPayments.filter(p => p.status === 'pending').length;
    
    return { paidCount, pendingCount, totalPaid };
  };

  // Filter students based on search
  const filteredStudents = students.filter(student => {
    const matchesSearch = 
      student.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.student_id?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  // Pagination
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleExport = () => {
    // Create CSV content with summary
    let csvContent = "Student Name,Student ID,Grade,Parent Phone,Total Paid,Paid Months,Pending Months\n";
    
    students.forEach(student => {
      const summary = getPaymentSummary(student.id);
      csvContent += `${student.full_name},${student.student_id},${student.grade},${student.parent_phone},${summary.totalPaid},${summary.paidCount},${summary.pendingCount}\n`;
    });

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `grade-${grade}-summary.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const toggleStudent = (studentId) => {
    if (expandedStudent === studentId) {
      setExpandedStudent(null);
    } else {
      setExpandedStudent(studentId);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Grade {grade}</h1>
            <p className="text-gray-600 mt-1">{students.length} students enrolled</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={fetchPaymentData}
            className="p-2 bg-white rounded-lg shadow-sm hover:shadow transition-all border border-gray-200"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm hover:shadow transition-all border border-gray-200"
          >
            <Download className="h-4 w-4" />
            Export Summary
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-10"
          />
        </div>
      </div>

      {/* Students List */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-200">
              {paginatedStudents.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No students found
                </div>
              ) : (
                paginatedStudents.map((student) => {
                  const summary = getPaymentSummary(student.id);
                  const isExpanded = expandedStudent === student.id;
                  
                  return (
                    <div key={student.id} className="hover:bg-gray-50 transition-colors">
                      {/* Student Summary Row - Click to Expand */}
                      <div 
                        className="px-6 py-4 cursor-pointer"
                        onClick={() => toggleStudent(student.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-primary-600 font-semibold">
                                {student.full_name?.charAt(0) || '?'}
                              </span>
                            </div>
                            
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <h3 className="font-semibold text-gray-900">{student.full_name}</h3>
                                <span className="text-xs text-gray-500 font-mono">{student.student_id}</span>
                              </div>
                              <div className="flex items-center gap-4 mt-1">
                                <div className="flex items-center gap-1 text-sm text-gray-600">
                                  <Phone className="h-3 w-3" />
                                  {student.parent_phone}
                                </div>
                                <div className="flex items-center gap-1 text-sm text-gray-600">
                                  <DollarSign className="h-3 w-3" />
                                  {summary.totalPaid} Birr
                                </div>
                                <div className="flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3 text-green-500" />
                                  <span className="text-xs">{summary.paidCount} paid</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-yellow-500" />
                                  <span className="text-xs">{summary.pendingCount} pending</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">
                              Click to {isExpanded ? 'hide' : 'view'} details
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-gray-400" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Payment Details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-gray-50 px-6 py-4 border-t border-gray-200"
                          >
                            <h4 className="font-medium text-gray-700 mb-3">Payment History</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                              {months.map(month => {
                                const status = getPaymentStatus(student.id, month);
                                const studentPayments = paymentData[student.id]?.payments || [];
                                const payment = studentPayments.find(p => p.month === month);
                                
                                return (
                                  <div 
                                    key={month} 
                                    className={`p-3 rounded-lg border ${
                                      status === 'paid' 
                                        ? 'bg-green-50 border-green-200' 
                                        : 'bg-yellow-50 border-yellow-200'
                                    }`}
                                  >
                                    <p className="text-xs font-medium text-gray-600 mb-1">{month}</p>
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-semibold">
                                        {payment?.amount || '200'} Birr
                                      </span>
                                      {getStatusIcon(status)}
                                    </div>
                                    {payment?.payment_method && (
                                      <p className="text-xs text-gray-500 mt-1 capitalize">
                                        {payment.payment_method}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Pagination */}
            {filteredStudents.length > 0 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-sm text-gray-600">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredStudents.length)} of {filteredStudents.length} students
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className={`px-3 py-1 rounded border ${
                        currentPage === 1 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      Previous
                    </button>
                    {[...Array(totalPages)].map((_, i) => (
                      <button
                        key={i + 1}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`px-3 py-1 rounded ${
                          currentPage === i + 1
                            ? 'bg-primary-600 text-white'
                            : 'bg-white border hover:bg-gray-50'
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className={`px-3 py-1 rounded border ${
                        currentPage === totalPages 
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                          : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-sm text-blue-600">Total Students</p>
          <p className="text-2xl font-bold text-blue-700">{students.length}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-sm text-green-600">Total Collected</p>
          <p className="text-2xl font-bold text-green-700">
            {Object.values(paymentData).reduce((sum, data) => sum + (data.totalPaid || 0), 0)} Birr
          </p>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4">
          <p className="text-sm text-yellow-600">Students with Payments</p>
          <p className="text-2xl font-bold text-yellow-700">
            {Object.values(paymentData).filter(data => data.payments?.length > 0).length}
          </p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4">
          <p className="text-sm text-purple-600">Collection Rate</p>
          <p className="text-2xl font-bold text-purple-700">
            {students.length > 0 
              ? Math.round((Object.values(paymentData).filter(data => data.payments?.length > 0).length / students.length) * 100)
              : 0}%
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default ClassDetails;