// src/pages/AdminPayments.js
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Download, CheckCircle, Clock, XCircle,
  ChevronLeft, ChevronRight, Eye, RefreshCw,
  AlertCircle, Trash2, CheckSquare, Square,
  DollarSign
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
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedPayments, setSelectedPayments] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const itemsPerPage = 10;
  const { selectedYear } = useYear();

  const months = [
    'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
    'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'
  ];

  const grades = ['1', '2', '3', '4', '5', '6', '7', '8'];

  useEffect(() => { fetchPayments(); }, [selectedYear]);

  useEffect(() => {
    applyFilters();
  }, [payments, searchTerm, filterStatus, filterMonth, filterGrade, filterSource]);

  useEffect(() => {
    if (selectAll) {
      setSelectedPayments(paginatedPayments.map(p => p.id));
    } else {
      setSelectedPayments([]);
    }
  }, [selectAll, currentPage, filteredPayments]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
      }
      
      const queryString = params.toString();
      const url = queryString ? `/payments/?${queryString}` : '/payments/';
      
      const savedSchool = localStorage.getItem('selectedSchool');
      let schoolId = null;
      if (savedSchool) {
        try {
          const school = JSON.parse(savedSchool);
          schoolId = school.id;
        } catch (e) {
          console.error('Error parsing school:', e);
        }
      }
      
      const response = await api.get(url, {
        headers: schoolId ? { 'X-School-ID': schoolId } : {}
      });
      
      setPayments(response.data);
    } catch (err) {
      console.error('Error fetching payments:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...payments];
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(payment => 
        (getStudentName(payment).toLowerCase().includes(term)) ||
        (payment.transaction_reference?.toLowerCase().includes(term)) ||
        (getStudentId(payment).toLowerCase().includes(term))
      );
    }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(payment => payment.status === filterStatus);
    }

    // Month filter
    if (filterMonth !== 'all') {
      filtered = filtered.filter(payment => getMonthName(payment) === filterMonth);
    }

    // Grade filter
    if (filterGrade !== 'all') {
      filtered = filtered.filter(payment => {
        const studentGrade = payment.student_grade || payment.student?.grade || payment.grade;
        return String(studentGrade) === filterGrade;
      });
    }

    // Source filter
    if (filterSource !== 'all') {
      if (filterSource === 'slip') {
        filtered = filtered.filter(payment => payment.is_from_slip === true);
      } else if (filterSource === 'online') {
        filtered = filtered.filter(payment => !payment.is_from_slip && payment.payment_method === 'chapa');
      } else if (filterSource === 'cash') {
        filtered = filtered.filter(payment => payment.payment_method === 'cash');
      }
    }

    setFilteredPayments(filtered);
    setCurrentPage(1);
    setSelectAll(false);
    setSelectedPayments([]);
  };

  const archivePayment = async (paymentId) => {
    if (window.confirm('Move this payment to Payment History?')) {
      try {
        await api.post(`/payments/${paymentId}/archive_payment/`);
        await fetchPayments();
        setShowDetails(false);
      } catch (err) {
        console.error('Error archiving payment:', err);
        alert('Failed to archive payment. Please try again.');
      }
    }
  };

  const bulkArchive = async () => {
    if (selectedPayments.length === 0) {
      alert('Please select at least one payment to archive.');
      return;
    }
    if (window.confirm(`Move ${selectedPayments.length} payment(s) to Payment History?`)) {
      try {
        await api.post('/payments/bulk_archive/', { payment_ids: selectedPayments });
        await fetchPayments();
        setSelectedPayments([]);
        setSelectAll(false);
      } catch (err) {
        console.error('Error bulk archiving payments:', err);
        alert('Failed to archive payments. Please try again.');
      }
    }
  };

  const toggleSelectPayment = (paymentId) => {
    setSelectedPayments(prev => 
      prev.includes(paymentId) 
        ? prev.filter(id => id !== paymentId)
        : [...prev, paymentId]
    );
    setSelectAll(false);
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
      }
      
      const queryString = params.toString();
      const url = queryString ? `/payments/export/?${queryString}` : '/payments/export/';
      
      const response = await api.get(url, { responseType: 'blob' });
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
    setFilterGrade('all');
    setFilterSource('all');
  };

// In AdminPayments.js, replace getMonthName with this:
const getMonthName = (payment) => {
  // ✅ NEW: Use deadline_month from backend (Amharic name)
  if (payment.deadline_month) return payment.deadline_month;
  
  // Fallback: Convert integer to name
  if (payment.deadline?.month) {
    const monthInt = parseInt(payment.deadline.month);
    if (monthInt >= 1 && monthInt <= 13) {
      return months[monthInt - 1];
    }
  }
  
  if (payment.month) {
    const monthInt = parseInt(payment.month);
    if (monthInt >= 1 && monthInt <= 13) {
      return months[monthInt - 1];
    }
  }
  
  return 'N/A';
};

  const getStudentName = (payment) => {
    if (payment.student_name) return payment.student_name;
    if (payment.student?.full_name) return payment.student.full_name;
    return 'Unknown';
  };

  const getStudentId = (payment) => {
    if (payment.student_id) return payment.student_id;
    if (payment.student?.student_id) return payment.student.student_id;
    return 'N/A';
  };

  const getStudentGrade = (payment) => {
    const grade = payment.student_grade || payment.student?.grade || payment.grade;
    return grade ? `Grade ${grade}` : 'N/A';
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
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Payment Management</h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            {selectedYear ? (
              <span className="text-primary-600 font-medium">
                📅 {selectedYear.name || selectedYear.year_ec + ' E.C.'}
              </span>
            ) : (
              'No academic year selected'
            )}
          </p>
          <p className="text-sm text-gray-500">
            {filteredPayments.length} transactions • {totalAmount.toLocaleString()} Birr total
          </p>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          {selectedPayments.length > 0 && (
            <button 
              onClick={bulkArchive}
              className="bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 tap-target text-sm"
            >
              <Trash2 className="h-4 w-4" />
              Archive ({selectedPayments.length})
            </button>
          )}
          <button onClick={handleExport} className="btn-outline flex items-center gap-2 tap-target">
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button onClick={fetchPayments} className="btn-outline flex items-center gap-2 tap-target">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 md:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500">Total Amount</p>
              <p className="text-lg md:text-2xl font-bold text-gray-900">{totalAmount.toLocaleString()} Birr</p>
            </div>
            <div className="p-2 md:p-3 bg-blue-100 rounded-full">
              <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 md:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500">Verified</p>
              <p className="text-lg md:text-2xl font-bold text-green-600">{verifiedCount}</p>
            </div>
            <div className="p-2 md:p-3 bg-green-100 rounded-full">
              <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 md:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500">Pending</p>
              <p className="text-lg md:text-2xl font-bold text-yellow-600">{pendingCount}</p>
            </div>
            <div className="p-2 md:p-3 bg-yellow-100 rounded-full">
              <Clock className="h-4 w-4 md:h-5 md:w-5 text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 md:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-gray-500">Rejected</p>
              <p className="text-lg md:text-2xl font-bold text-red-600">{rejectedCount}</p>
            </div>
            <div className="p-2 md:p-3 bg-red-100 rounded-full">
              <XCircle className="h-4 w-4 md:h-5 md:w-5 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base md:text-lg font-semibold text-gray-900">Filters</h2>
          {(searchTerm || filterStatus !== 'all' || filterMonth !== 'all' || filterGrade !== 'all' || filterSource !== 'all') && (
            <button onClick={clearFilters} className="text-sm text-primary-600 hover:text-primary-700 font-medium tap-target">
              Clear Filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search student, ID, reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-9 py-2 text-sm w-full"
            />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field py-2 text-sm">
            <option value="all">All Status</option>
            <option value="verified">Verified</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="input-field py-2 text-sm">
            <option value="all">All Months</option>
            {months.map((month, index) => (
              <option key={index} value={month}>{month}</option>
            ))}
          </select>
          <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)} className="input-field py-2 text-sm">
            <option value="all">All Grades</option>
            {grades.map((grade) => (
              <option key={grade} value={grade}>Grade {grade}</option>
            ))}
          </select>
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="input-field py-2 text-sm">
            <option value="all">All Sources</option>
            <option value="online">Online Payment</option>
            <option value="slip">Bank Slip</option>
            <option value="cash">Cash</option>
          </select>
        </div>
      </div>

      {/* Payments Table */}
      {filteredPayments.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-3 text-gray-400" />
          <p className="text-gray-500">No payments found for {selectedYear?.name || 'selected academic year'}</p>
          <button onClick={clearFilters} className="mt-2 text-primary-600 hover:text-primary-700 text-sm font-medium tap-target">
            Clear Filters
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button onClick={() => setSelectAll(!selectAll)} className="flex items-center gap-2">
                        {selectAll ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                        Select
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedPayments.includes(payment.id)}
                          onChange={() => toggleSelectPayment(payment.id)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {getStudentName(payment)}
                            {payment.is_from_slip && (
                              <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                                Slip
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">{getStudentId(payment)}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{getStudentGrade(payment)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{parseFloat(payment.amount).toLocaleString()} Birr</td>
                      <td className="px-4 py-3 text-gray-600">{getMonthName(payment)}</td>
                      <td className="px-4 py-3 capitalize text-gray-600">{payment.payment_method || 'N/A'}</td>
                      <td className="px-4 py-3 font-mono text-sm text-gray-500">{payment.transaction_reference || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusBadge(payment.status)}`}>
                          {getStatusIcon(payment.status)}
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(payment.created_at).toLocaleDateString()}
                       </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedPayment(payment);
                              setShowDetails(true);
                            }}
                            className="text-blue-600 hover:text-blue-800 tap-target p-1"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => archivePayment(payment.id)}
                            className="text-red-600 hover:text-red-800 tap-target p-1"
                            title="Archive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                       </td>
                     </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {filteredPayments.length > 0 && totalPages > 1 && (
            <div className="bg-white rounded-xl shadow-lg px-4 py-3 md:px-6 md:py-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs sm:text-sm text-gray-600 text-center sm:text-left">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredPayments.length)} of {filteredPayments.length}
                </p>
                <div className="flex justify-center gap-1 sm:gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="tap-target px-2 py-1 sm:px-3 sm:py-1.5 bg-white rounded border hover:bg-gray-50 disabled:opacity-50"
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
                        className={`tap-target px-2 py-1 sm:px-3 sm:py-1.5 rounded text-sm ${
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
                    className="tap-target px-2 py-1 sm:px-3 sm:py-1.5 bg-white rounded border hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

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
              className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg md:text-xl font-bold text-gray-900">Payment Details</h2>
                  <button onClick={() => setShowDetails(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors tap-target">
                    <XCircle className="h-5 w-5 text-gray-600" />
                  </button>
                </div>

                <div className="space-y-3 md:space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
                      <p className="text-xs md:text-sm text-gray-500">Student</p>
                      <p className="font-semibold text-sm md:text-base">{getStudentName(selectedPayment)}</p>
                      <p className="text-xs text-gray-600">ID: {getStudentId(selectedPayment)}</p>
                      <p className="text-xs text-gray-600">Grade: {getStudentGrade(selectedPayment)}</p>
                    </div>
                    <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
                      <p className="text-xs md:text-sm text-gray-500">Amount</p>
                      <p className="font-semibold text-primary-600 text-lg md:text-xl">{parseFloat(selectedPayment.amount).toLocaleString()} Birr</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
                      <p className="text-xs md:text-sm text-gray-500">Month</p>
                      <p className="font-semibold text-sm md:text-base">{getMonthName(selectedPayment)}</p>
                    </div>
                    <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
                      <p className="text-xs md:text-sm text-gray-500">Academic Year</p>
                      <p className="font-semibold text-sm md:text-base">{selectedYear?.name || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
                    <p className="text-xs md:text-sm text-gray-500">Transaction Reference</p>
                    <p className="font-mono text-xs md:text-sm break-all">{selectedPayment.transaction_reference || 'N/A'}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
                      <p className="text-xs md:text-sm text-gray-500">Payment Method</p>
                      <p className="font-semibold capitalize text-sm md:text-base">{selectedPayment.payment_method || 'N/A'}</p>
                    </div>
                    <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
                      <p className="text-xs md:text-sm text-gray-500">Status</p>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusBadge(selectedPayment.status)}`}>
                        {getStatusIcon(selectedPayment.status)}
                        {selectedPayment.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
                      <p className="text-xs md:text-sm text-gray-500">Paid By</p>
                      <p className="font-semibold text-sm md:text-base">{selectedPayment.paid_by || 'N/A'}</p>
                    </div>
                    <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
                      <p className="text-xs md:text-sm text-gray-500">Phone</p>
                      <p className="font-semibold text-sm md:text-base">{selectedPayment.paid_by_phone || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
                      <p className="text-xs md:text-sm text-gray-500">Created At</p>
                      <p className="font-semibold text-sm md:text-base">{new Date(selectedPayment.created_at).toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
                      <p className="text-xs md:text-sm text-gray-500">Verified At</p>
                      <p className="font-semibold text-sm md:text-base">
                        {selectedPayment.verified_at ? new Date(selectedPayment.verified_at).toLocaleString() : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-2 mt-6">
                  <button
                    onClick={() => archivePayment(selectedPayment.id)}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 tap-target"
                  >
                    Archive Payment
                  </button>
                  <button onClick={() => setShowDetails(false)} className="btn-secondary tap-target">
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