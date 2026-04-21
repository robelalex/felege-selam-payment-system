// src/pages/AdminPayments.js
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Filter, 
  Download, 
  CheckCircle,
  Clock,
  XCircle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Calendar,
  DollarSign,
  Users,
  Eye,
  Printer,
  FileText,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import api from '../services/api';
import { useYear } from '../context/YearContext';

function AdminPayments() {
  const [payments, setPayments] = useState([]);
  const [filteredPayments, setFilteredPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const itemsPerPage = 10;

  const months = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
    'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
  ];

  const { selectedYear } = useYear();
  
  // Fetch payments when year changes
  useEffect(() => {
    console.log('🔄 AdminPayments: selectedYear changed to:', selectedYear);
    fetchPayments();
  }, [selectedYear]);

  // Apply filters when payments or filter criteria change
  useEffect(() => {
    applyFilters();
  }, [payments, searchTerm, filterStatus, filterMonth]);

const fetchPayments = async () => {
  setLoading(true);
  try {
    // Build query parameters
    const params = new URLSearchParams();
    
    if (selectedYear && selectedYear.id) {
      params.append('academic_year_id', selectedYear.id);
    }
    
    const queryString = params.toString();
    const url = queryString ? `/payments-filtered/?${queryString}` : '/payments-filtered/';
    
    // ✅ Get school from localStorage and add to headers
    const savedSchool = localStorage.getItem('selectedSchool');
    let schoolId = null;
    if (savedSchool) {
      try {
        const school = JSON.parse(savedSchool);
        schoolId = school.id;
        console.log('💰 School ID from localStorage:', schoolId);
      } catch (e) {
        console.error('Error parsing school:', e);
      }
    }
    
    console.log('💰 AdminPayments - Fetching payments');
    console.log('💰 Selected Year:', selectedYear);
    console.log('💰 Full URL:', url);
    console.log('💰 School ID being sent:', schoolId);
    
    const response = await api.get(url, {
      headers: schoolId ? { 'X-School-ID': schoolId } : {}
    });
    
    console.log('💰 Payments received:', response.data.length);
    
    setPayments(response.data);
  } catch (err) {
    console.error('Error fetching payments:', err);
  } finally {
    setLoading(false);
  }
};

  const applyFilters = () => {
    let filtered = [...payments];
    
    // Only show verified payments in main history
    filtered = filtered.filter(payment => payment.status === 'verified');
    
    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(payment => 
        (payment.student_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (payment.transaction_reference?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (payment.student_id?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (payment.student?.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(payment => payment.status === filterStatus);
    }

    // Month filter
    if (filterMonth !== 'all') {
      filtered = filtered.filter(payment => 
        payment.deadline_month === filterMonth || 
        payment.month === filterMonth ||
        (payment.deadline?.month && months[payment.deadline.month - 1] === filterMonth)
      );
    }

    console.log('💰 Filtered payments count:', filtered.length);
    setFilteredPayments(filtered);
    setCurrentPage(1);
  };

  const verifyPayment = async (paymentId) => {
    try {
      await api.post(`/payments/${paymentId}/verify_payment/`);
      await fetchPayments();
    } catch (err) {
      console.error('Error verifying payment:', err);
      alert('Failed to verify payment. Please try again.');
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'verified':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'verified':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
      }
      
      const queryString = params.toString();
      const url = queryString ? `/payments/export/?${queryString}` : '/payments/export/';
      
      const response = await api.get(url, {
        responseType: 'blob'
      });
      
      const url_blob = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url_blob;
      link.setAttribute('download', `payments_${selectedYear?.name || 'all'}_${new Date().toISOString().slice(0,10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export payments');
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterMonth('all');
  };

  const getMonthName = (payment) => {
    if (payment.deadline_month) return payment.deadline_month;
    if (payment.month) return payment.month;
    if (payment.deadline?.month) return months[payment.deadline.month - 1];
    return 'N/A';
  };

  const getAcademicYear = (payment) => {
    if (payment.academic_year) return payment.academic_year;
    if (payment.student?.academic_year) return payment.student.academic_year;
    return selectedYear?.name || 'N/A';
  };

  const getStudentName = (payment) => {
    if (payment.student_name) return payment.student_name;
    if (payment.student?.full_name) return payment.student.full_name;
    if (payment.student?.first_name) return `${payment.student.first_name} ${payment.student.last_name}`;
    return 'Unknown';
  };

  const getStudentId = (payment) => {
    if (payment.student_id) return payment.student_id;
    if (payment.student?.student_id) return payment.student.student_id;
    return 'N/A';
  };

  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage);
  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalAmount = filteredPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const verifiedCount = filteredPayments.filter(p => p.status === 'verified').length;
  const pendingCount = filteredPayments.filter(p => p.status === 'pending').length;
  const rejectedCount = filteredPayments.filter(p => p.status === 'rejected').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Payment Management</h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            {selectedYear ? (
              <span className="text-primary-600 font-medium">
                📅 Academic Year: {selectedYear.name || selectedYear.year_ec + ' E.C.'}
              </span>
            ) : (
              'No academic year selected'
            )}
          </p>
          <p className="text-sm text-gray-500">
            {filteredPayments.length} transactions • {totalAmount.toLocaleString()} Birr total
          </p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={handleExport}
            className="btn-outline flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <button 
            onClick={fetchPayments}
            className="btn-outline flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Amount</p>
              <p className="text-2xl font-bold text-gray-900">{totalAmount.toLocaleString()} Birr</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Verified</p>
              <p className="text-2xl font-bold text-green-600">{verifiedCount}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Rejected</p>
              <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          {(searchTerm || filterStatus !== 'all' || filterMonth !== 'all') && (
            <button
              onClick={clearFilters}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              Clear Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search student, ID, reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-9 py-2 text-sm"
            />
          </div>
          
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="input-field py-2 text-sm"
          >
            <option value="all">All Months</option>
            {months.map((month, index) => (
              <option key={index} value={month}>{month}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedPayments.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                    <AlertCircle className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                    <p>No payments found for {selectedYear?.name || 'selected academic year'}</p>
                    <button
                      onClick={clearFilters}
                      className="mt-2 text-primary-600 hover:text-primary-700 text-sm font-medium"
                    >
                      Clear Filters
                    </button>
                  </td>
                </tr>
              ) : (
                paginatedPayments.map((payment) => (
                  <motion.tr
                    key={payment.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedPayment(payment);
                      setShowDetails(true);
                    }}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-primary-600 font-semibold text-sm">
                            {getStudentName(payment).charAt(0) || '?'}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{getStudentName(payment)}</p>
                          <p className="text-xs text-gray-500">{getStudentId(payment)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">{parseFloat(payment.amount).toLocaleString()} Birr</td>
                    <td className="px-6 py-4 text-gray-600">{getMonthName(payment)}</td>
                    <td className="px-6 py-4 capitalize text-gray-600">{payment.payment_method || 'N/A'}</td>
                    <td className="px-6 py-4 font-mono text-sm text-gray-500">{payment.transaction_reference || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadge(payment.status)}`}>
                        {getStatusIcon(payment.status)}
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(payment.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      {payment.status === 'pending' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            verifyPayment(payment.id);
                          }}
                          className="btn-primary text-xs py-1.5 px-3"
                        >
                          Verify
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredPayments.length > 0 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-600">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredPayments.length)} of {filteredPayments.length} payments
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className={`p-2 bg-white rounded border hover:bg-gray-50 transition-colors ${
                    currentPage === 1 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                
                {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1 rounded transition-colors ${
                        currentPage === pageNum
                          ? 'bg-primary-600 text-white'
                          : 'bg-white border hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className={`p-2 bg-white rounded border hover:bg-gray-50 transition-colors ${
                    currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payment Details Modal */}
      <AnimatePresence>
        {showDetails && selectedPayment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowDetails(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-white rounded-xl shadow-2xl max-w-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Payment Details</h2>
                  <button
                    onClick={() => setShowDetails(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <XCircle className="h-5 w-5 text-gray-600" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Student</p>
                      <p className="font-semibold">{getStudentName(selectedPayment)}</p>
                      <p className="text-sm text-gray-600">ID: {getStudentId(selectedPayment)}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Amount</p>
                      <p className="font-semibold text-primary-600">{parseFloat(selectedPayment.amount).toLocaleString()} Birr</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Month</p>
                      <p className="font-semibold">{getMonthName(selectedPayment)}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Academic Year</p>
                      <p className="font-semibold">{getAcademicYear(selectedPayment)}</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-500">Transaction Reference</p>
                    <p className="font-mono text-sm">{selectedPayment.transaction_reference || 'N/A'}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Payment Method</p>
                      <p className="font-semibold capitalize">{selectedPayment.payment_method || 'N/A'}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Status</p>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusBadge(selectedPayment.status)}`}>
                        {getStatusIcon(selectedPayment.status)}
                        {selectedPayment.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Paid By</p>
                      <p className="font-semibold">{selectedPayment.paid_by || 'N/A'}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Phone</p>
                      <p className="font-semibold">{selectedPayment.paid_by_phone || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Created At</p>
                      <p className="font-semibold">{new Date(selectedPayment.created_at).toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-500">Verified At</p>
                      <p className="font-semibold">
                        {selectedPayment.verified_at 
                          ? new Date(selectedPayment.verified_at).toLocaleString()
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end mt-6">
                  {selectedPayment.status === 'pending' && (
                    <button
                      onClick={() => {
                        verifyPayment(selectedPayment.id);
                        setShowDetails(false);
                      }}
                      className="btn-primary mr-2"
                    >
                      Verify Payment
                    </button>
                  )}
                  <button
                    onClick={() => setShowDetails(false)}
                    className="btn-secondary"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AdminPayments;