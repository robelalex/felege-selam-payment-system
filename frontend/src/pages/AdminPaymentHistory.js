// src/pages/AdminPaymentHistory.js
import React, { useState, useEffect } from 'react';
import {
  Search, RefreshCw, AlertCircle, Trash2,
  ChevronLeft, ChevronRight, Eye, XCircle,
  CheckCircle, Clock, Archive
} from 'lucide-react';
import api from '../services/api';
import { useYear } from '../context/YearContext';

function AdminPaymentHistory() {
  const [payments, setPayments] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const itemsPerPage = 10;
  const { selectedYear } = useYear();

  const months = [
    'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
    'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'
  ];

  const grades = ['1', '2', '3', '4', '5', '6', '7', '8'];

  useEffect(() => { fetchHistory(); }, [selectedYear]);

  useEffect(() => {
    let filteredData = [...payments];
    
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filteredData = filteredData.filter(p =>
        (getStudentName(p).toLowerCase().includes(term)) ||
        (getStudentId(p).toLowerCase().includes(term)) ||
        (p.transaction_reference?.toLowerCase().includes(term))
      );
    }
    
    // Status filter
    if (filterStatus !== 'all') {
      filteredData = filteredData.filter(p => p.status === filterStatus);
    }
    
    // Month filter
    if (filterMonth !== 'all') {
      filteredData = filteredData.filter(p => getMonthName(p) === filterMonth);
    }
    
    // Grade filter
    if (filterGrade !== 'all') {
      filteredData = filteredData.filter(p => {
        const studentGrade = p.student?.grade || p.grade;
        return String(studentGrade) === filterGrade;
      });
    }
    
    setFiltered(filteredData);
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterMonth, filterGrade, payments]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear?.id) params.append('academic_year_id', selectedYear.id);
      const url = params.toString()
        ? `/payments/history/?${params}`
        : '/payments/history/';
      const response = await api.get(url);
      setPayments(response.data);
      setFiltered(response.data);
    } catch (err) {
      console.error('Error fetching payment history:', err);
    } finally {
      setLoading(false);
    }
  };

  const permanentDelete = async (paymentId) => {
    if (window.confirm('Permanently delete this payment? This cannot be undone.')) {
      try {
        await api.delete(`/payments/${paymentId}/permanent_delete/`);
        await fetchHistory();
        setShowDetails(false);
      } catch (err) {
        console.error('Error deleting payment:', err);
        alert('Failed to delete. Please try again.');
      }
    }
  };

  const getStudentName = (p) =>
    p.student_name || p.student?.full_name || 'Unknown';

  const getStudentId = (p) =>
    p.student_id || p.student?.student_id || 'N/A';

  const getStudentGrade = (p) => {
    const grade = p.student?.grade || p.grade;
    return grade ? `Grade ${grade}` : 'N/A';
  };

  const getMonthName = (p) => {
    if (p.deadline_month) return p.deadline_month;
    if (p.month) return p.month;
    if (p.deadline?.month) return months[p.deadline.month - 1];
    return 'N/A';
  };

  const getStatusBadge = (s) => {
    switch (s) {
      case 'verified': return 'bg-green-100 text-green-700 border-green-200';
      case 'pending':  return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'rejected': return 'bg-red-100 text-red-700 border-red-200';
      default:         return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = (s) => {
    switch (s) {
      case 'verified': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':  return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-600" />;
      default:         return null;
    }
  };

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
            <Archive className="h-7 w-7 text-primary-600" />
            Payment History
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} archived payment{filtered.length !== 1 ? 's' : ''}
            {selectedYear ? ` — ${selectedYear.name}` : ''}
          </p>
        </div>
        <button
          onClick={fetchHistory}
          className="btn-outline flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-lg p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search student, ID, or reference..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-9 py-2 text-sm w-full"
          />
        </div>
      </div>

      {/* Status, Month, and Grade Filters */}
      <div className="bg-white rounded-xl shadow-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field py-2 text-sm w-full"
            >
              <option value="all">All Status</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
            <select 
              value={filterMonth} 
              onChange={(e) => setFilterMonth(e.target.value)}
              className="input-field py-2 text-sm w-full"
            >
              <option value="all">All Months</option>
              {months.map((month, index) => (
                <option key={index} value={month}>{month}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
            <select 
              value={filterGrade} 
              onChange={(e) => setFilterGrade(e.target.value)}
              className="input-field py-2 text-sm w-full"
            >
              <option value="all">All Grades</option>
              {grades.map((grade) => (
                <option key={grade} value={grade}>Grade {grade}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <Archive className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No archived payments</p>
          <p className="text-gray-400 text-sm mt-1">
            Payments you remove from the main page will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Archived On</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginated.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{getStudentName(payment)}</p>
                        <p className="text-xs text-gray-500">{getStudentId(payment)}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{getStudentGrade(payment)}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {parseFloat(payment.amount).toLocaleString()} Birr
                      </td>
                      <td className="px-4 py-3 text-gray-600">{getMonthName(payment)}</td>
                      <td className="px-4 py-3 capitalize text-gray-600">
                        {payment.payment_method || 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusBadge(payment.status)}`}>
                          {getStatusIcon(payment.status)}
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {payment.archived_at
                          ? new Date(payment.archived_at).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setSelectedPayment(payment); setShowDetails(true); }}
                            className="text-blue-600 hover:text-blue-800 p-1"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => permanentDelete(payment.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Permanently delete"
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
          {totalPages > 1 && (
            <div className="bg-white rounded-xl shadow-lg px-4 py-3 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {((currentPage - 1) * itemsPerPage) + 1}–
                {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 bg-white rounded border hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                  const pageNum = i + 1;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1 rounded text-sm ${
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
                  onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 bg-white rounded border hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {showDetails && selectedPayment && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowDetails(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">Payment Details</h2>
              <button onClick={() => setShowDetails(false)}>
                <XCircle className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <div className="space-y-3">
              {[
                ['Student', getStudentName(selectedPayment)],
                ['Student ID', getStudentId(selectedPayment)],
                ['Grade', getStudentGrade(selectedPayment)],
                ['Amount', `${parseFloat(selectedPayment.amount).toLocaleString()} Birr`],
                ['Month', getMonthName(selectedPayment)],
                ['Method', selectedPayment.payment_method || 'N/A'],
                ['Reference', selectedPayment.transaction_reference || 'N/A'],
                ['Paid By', selectedPayment.paid_by || 'N/A'],
                ['Phone', selectedPayment.paid_by_phone || 'N/A'],
                ['Archived On', selectedPayment.archived_at
                  ? new Date(selectedPayment.archived_at).toLocaleString()
                  : '—'],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="font-semibold text-sm text-gray-900 break-all">{value}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => permanentDelete(selectedPayment.id)}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm"
              >
                Permanently Delete
              </button>
              <button
                onClick={() => setShowDetails(false)}
                className="btn-secondary text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPaymentHistory;