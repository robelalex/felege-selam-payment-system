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
  AlertCircle,
  Trash2,
  CheckSquare,
  Square,
  Phone,
  User,
  Calendar as CalendarIcon,
  Banknote
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
  const [selectedPayments, setSelectedPayments] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  const itemsPerPage = 10;

  const months = [
    'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
    'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'
  ];

  const { selectedYear } = useYear();
  
  // Check screen size for default view mode
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setViewMode('grid');
      } else {
        setViewMode('table');
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [selectedYear]);

  useEffect(() => {
    applyFilters();
  }, [payments, searchTerm, filterStatus, filterMonth]);

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
      const url = queryString ? `/payments-filtered/?${queryString}` : '/payments-filtered/';
      
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
    
    filtered = filtered.filter(payment => payment.status === 'verified');
    
    if (searchTerm) {
      filtered = filtered.filter(payment => 
        (payment.student_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (payment.transaction_reference?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (payment.student_id?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (payment.student?.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(payment => payment.status === filterStatus);
    }

    if (filterMonth !== 'all') {
      filtered = filtered.filter(payment => 
        payment.deadline_month === filterMonth || 
        payment.month === filterMonth ||
        (payment.deadline?.month && months[payment.deadline.month - 1] === filterMonth)
      );
    }

    setFilteredPayments(filtered);
    setCurrentPage(1);
    setSelectAll(false);
    setSelectedPayments([]);
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

  const deletePayment = async (paymentId) => {
    if (window.confirm('Are you sure you want to delete this payment? This action cannot be undone.')) {
      try {
        await api.delete(`/payments/${paymentId}/`);
        await fetchPayments();
        setShowDetails(false);
      } catch (err) {
        console.error('Error deleting payment:', err);
        alert('Failed to delete payment. Please try again.');
      }
    }
  };

  const bulkDeletePayments = async () => {
    if (selectedPayments.length === 0) {
      alert('Please select at least one payment to delete.');
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete ${selectedPayments.length} payment(s)? This action cannot be undone.`)) {
      try {
        await api.post('/payments/bulk-delete/', { payment_ids: selectedPayments });
        await fetchPayments();
        setSelectedPayments([]);
        setSelectAll(false);
      } catch (err) {
        console.error('Error bulk deleting payments:', err);
        alert('Failed to delete payments. Please try again.');
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

  // Mobile Payment Card Component
  const PaymentCard = ({ payment, isSelected, onToggleSelect, onViewDetails }) => (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-3 shadow-sm">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(payment.id)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
            <span className="text-primary-600 font-semibold text-sm">
              {getStudentName(payment).charAt(0) || '?'}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{getStudentName(payment)}</h3>
            <p className="text-xs text-gray-500 font-mono">{getStudentId(payment)}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusBadge(payment.status)}`}>
          {getStatusIcon(payment.status)}
          {payment.status}
        </span>
      </div>
      
      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        <div>
          <p className="text-gray-500 text-xs">Amount</p>
          <p className="font-bold text-primary-600">{parseFloat(payment.amount).toLocaleString()} Birr</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Month</p>
          <p className="font-medium flex items-center gap-1">
            <Calendar className="h-3 w-3 text-gray-400" />
            {getMonthName(payment)}
          </p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Method</p>
          <p className="font-medium capitalize">{payment.payment_method || 'N/A'}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Date</p>
          <p className="font-medium text-sm">{new Date(payment.created_at).toLocaleDateString()}</p>
        </div>
      </div>
      
      {payment.transaction_reference && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-500 font-mono truncate">
            Ref: {payment.transaction_reference}
          </p>
        </div>
      )}
      
      <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100">
        <button
          onClick={() => onViewDetails(payment)}
          className="flex-1 btn-outline text-sm py-2 flex items-center justify-center gap-1 tap-target"
        >
          <Eye className="h-3 w-3" />
          Details
        </button>
        {payment.status === 'pending' && (
          <button
            onClick={() => { verifyPayment(payment.id); }}
            className="flex-1 btn-primary text-sm py-2 flex items-center justify-center gap-1 tap-target"
          >
            <CheckCircle className="h-3 w-3" />
            Verify
          </button>
        )}
      </div>
    </div>
  );

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
              onClick={bulkDeletePayments}
              className="bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 tap-target text-sm"
            >
              <Trash2 className="h-4 w-4" />
              Delete ({selectedPayments.length})
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

      {/* Stats Cards - Responsive */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
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
          {(searchTerm || filterStatus !== 'all' || filterMonth !== 'all') && (
            <button onClick={clearFilters} className="text-sm text-primary-600 hover:text-primary-700 font-medium tap-target">
              Clear Filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
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
        </div>
      </div>

      {/* View Toggle (Mobile only) */}
      <div className="md:hidden flex justify-end">
        <div className="bg-gray-100 rounded-lg p-1 flex gap-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500'
            }`}
          >
            Cards
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-gray-500'
            }`}
          >
            Table
          </button>
        </div>
      </div>

      {/* Payments Content */}
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
          {/* Mobile Card View */}
          {viewMode === 'grid' && (
            <div className="space-y-3 md:hidden">
              {paginatedPayments.map((payment) => (
                <PaymentCard
                  key={payment.id}
                  payment={payment}
                  isSelected={selectedPayments.includes(payment.id)}
                  onToggleSelect={toggleSelectPayment}
                  onViewDetails={(p) => {
                    setSelectedPayment(p);
                    setShowDetails(true);
                  }}
                />
              ))}
            </div>
          )}

          {/* Desktop Table View */}
          {(viewMode === 'table' || window.innerWidth >= 768) && (
            <div className="bg-white rounded-xl shadow-lg overflow-hidden hidden md:block">
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                              onClick={() => deletePayment(payment.id)}
                              className="text-red-600 hover:text-red-800 tap-target p-1"
                              title="Delete"
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
          )}

          {/* Pagination - Responsive */}
          {filteredPayments.length > 0 && (
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

      {/* Payment Details Modal - Keep as is but add responsive classes */}
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
                      <p className="font-semibold text-sm md:text-base">{getAcademicYear(selectedPayment)}</p>
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
                  {selectedPayment.status === 'pending' && (
                    <button onClick={() => { verifyPayment(selectedPayment.id); setShowDetails(false); }} className="btn-primary tap-target">
                      Verify Payment
                    </button>
                  )}
                  <button onClick={() => deletePayment(selectedPayment.id)} className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors tap-target">
                    Delete
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