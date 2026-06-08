// frontend/src/pages/BankSlips.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  CheckCircle,
  XCircle,
  Eye,
  Trash2,
  Loader,
  RefreshCw,
  Search,
  Filter,
  Calendar,
  GraduationCap,
  User,
  Building2,
  Clock,
  AlertCircle
} from 'lucide-react';
import api from '../services/api';
import { useYear } from '../context/YearContext';

function BankSlips() {
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedSlips, setSelectedSlips] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  
  // ✅ Filter states
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  
  // Debounce timeout
  const searchTimeout = useRef(null);

  const { selectedYear } = useYear();

  const months = [
    'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
    'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'
  ];

  const grades = [1, 2, 3, 4, 5, 6, 7, 8];

  const fetchSlips = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
      }
      
      if (filterGrade && filterGrade !== 'all') {
        params.append('grade', filterGrade);
      }
      
      if (filterMonth && filterMonth !== 'all') {
        params.append('month', filterMonth);
      }
      
      if (studentSearch && studentSearch.trim()) {
        params.append('student_search', studentSearch);
      }
      
      const url = `/slips/pending/${params.toString() ? `?${params}` : ''}`;
      const response = await api.get(url);
      setSlips(response.data);
      setSelectedSlips([]);
    } catch (err) {
      console.error('Error fetching slips:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, filterGrade, filterMonth, studentSearch]);

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    searchTimeout.current = setTimeout(() => {
      fetchSlips();
    }, 500);
    
    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [studentSearch, fetchSlips]);

  useEffect(() => {
    fetchSlips();
  }, [selectedYear, filterGrade, filterMonth, fetchSlips]);

  const handleVerify = async (slipId) => {
    setActionLoading(true);
    try {
      await api.post(`/slips/${slipId}/verify/`, { action: 'verify' });
      fetchSlips();
      setShowModal(false);
    } catch (err) {
      console.error('Error verifying slip:', err);
      alert('Failed to verify slip');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (slipId) => {
    setActionLoading(true);
    try {
      await api.post(`/slips/${slipId}/verify/`, { action: 'reject' });
      fetchSlips();
      setShowModal(false);
    } catch (err) {
      console.error('Error rejecting slip:', err);
      alert('Failed to reject slip');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (slipId) => {
    if (!window.confirm('Are you sure you want to delete this slip?')) return;
    
    setActionLoading(true);
    try {
      await api.delete(`/slips/${slipId}/delete/`);
      fetchSlips();
    } catch (err) {
      console.error('Error deleting slip:', err);
      alert('Failed to delete slip');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSlips.length === 0) {
      alert('Please select at least one slip');
      return;
    }
    
    if (!window.confirm(`Delete ${selectedSlips.length} slip(s)?`)) return;
    
    setBulkDeleting(true);
    try {
      await api.post('/slips/bulk-delete/', { slip_ids: selectedSlips });
      fetchSlips();
      setSelectedSlips([]);
    } catch (err) {
      console.error('Error bulk deleting:', err);
      alert('Failed to delete slips');
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleSelect = (slipId) => {
    setSelectedSlips(prev =>
      prev.includes(slipId)
        ? prev.filter(id => id !== slipId)
        : [...prev, slipId]
    );
  };

  const selectAll = () => {
    if (selectedSlips.length === slips.length) {
      setSelectedSlips([]);
    } else {
      setSelectedSlips(slips.map(s => s.id));
    }
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 85) return 'text-green-600 bg-green-100';
    if (confidence >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Bank Slips</h1>
          <p className="text-sm text-gray-500 mt-1">
            {slips.length} pending slip{slips.length !== 1 ? 's' : ''} awaiting verification
          </p>
        </div>
        <button
          onClick={fetchSlips}
          className="p-2 bg-white rounded-lg shadow-sm hover:shadow transition-all"
        >
          <RefreshCw className="h-5 w-5 text-gray-600" />
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Grade Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <GraduationCap className="h-4 w-4 inline mr-1" />
              Filter by Grade
            </label>
            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="input-field"
            >
              <option value="all">All Grades</option>
              {grades.map(grade => (
                <option key={grade} value={grade}>Grade {grade}</option>
              ))}
            </select>
          </div>

          {/* Month Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="h-4 w-4 inline mr-1" />
              Filter by Month
            </label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="input-field"
            >
              <option value="all">All Months</option>
              {months.map((month, index) => (
                <option key={index} value={index + 1}>{month}</option>
              ))}
            </select>
          </div>

          {/* Student Search */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="h-4 w-4 inline mr-1" />
              Search by Student ID or Name
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Enter student ID or name..."
                className="input-field pl-10"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedSlips.length > 0 && (
        <div className="bg-primary-50 rounded-xl shadow-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedSlips.length === slips.length && slips.length > 0}
              onChange={selectAll}
              className="rounded text-primary-600"
            />
            <span className="text-sm font-medium text-primary-800">
              {selectedSlips.length} slip{selectedSlips.length !== 1 ? 's' : ''} selected
            </span>
          </div>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {bulkDeleting ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete Selected
          </button>
        </div>
      )}

      {/* Slips Grid */}
      {slips.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-500">No pending slips found</p>
          <p className="text-sm text-gray-400 mt-1">Try changing your filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {slips.map((slip) => (
            <motion.div
              key={slip.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
            >
              {/* Slip Image */}
              <div 
                className="relative h-48 bg-gray-100 cursor-pointer"
                onClick={() => {
                  setSelectedSlip(slip);
                  setShowModal(true);
                }}
              >
                {slip.slip_image ? (
                  <img
                    src={slip.slip_image}
                    alt="Bank slip"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <FileText className="h-12 w-12 text-gray-400" />
                  </div>
                )}
                <button className="absolute bottom-2 right-2 p-2 bg-black/50 rounded-lg text-white hover:bg-black/70 transition-all">
                  <Eye className="h-4 w-4" />
                </button>
              </div>

              {/* Slip Info */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{slip.student_name}</h3>
                    <p className="text-xs text-gray-500">ID: {slip.student_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary-600">{slip.amount} Birr</p>
                    <p className="text-xs text-gray-500">Grade {slip.grade}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-gray-600">
                    <Calendar className="h-3 w-3" />
                    {slip.month}
                  </span>
                  <span className="flex items-center gap-1 text-gray-600">
                    <Building2 className="h-3 w-3" />
                    {slip.bank_name || 'N/A'}
                  </span>
                </div>

                {/* AI Confidence */}
                {slip.ai_confidence > 0 && (
                  <div className={`text-xs px-2 py-1 rounded-full inline-flex items-center gap-1 ${getConfidenceColor(slip.ai_confidence)}`}>
                    <AlertCircle className="h-3 w-3" />
                    AI Confidence: {slip.ai_confidence}%
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedSlips.includes(slip.id)}
                      onChange={() => toggleSelect(slip.id)}
                      className="rounded text-primary-600"
                    />
                    <button
                      onClick={() => handleDelete(slip.id)}
                      disabled={actionLoading}
                      className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReject(slip.id)}
                      disabled={actionLoading}
                      className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleVerify(slip.id)}
                      disabled={actionLoading}
                      className="px-3 py-1 text-sm text-green-600 border border-green-300 rounded-lg hover:bg-green-50 transition-colors"
                    >
                      Verify
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal for viewing slip details */}
      <AnimatePresence>
        {showModal && selectedSlip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-primary-600 px-6 py-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold text-white">Slip Details</h2>
                  <button onClick={() => setShowModal(false)} className="text-white hover:bg-white/20 rounded-lg p-1">
                    <XCircle className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {selectedSlip.slip_image && (
                  <img
                    src={selectedSlip.slip_image}
                    alt="Bank slip"
                    className="w-full rounded-lg border"
                  />
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Student</p>
                    <p className="font-medium">{selectedSlip.student_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">ID</p>
                    <p className="font-mono text-sm">{selectedSlip.student_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Grade</p>
                    <p className="font-medium">Grade {selectedSlip.grade}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Month</p>
                    <p className="font-medium">{selectedSlip.month}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Amount</p>
                    <p className="text-xl font-bold text-primary-600">{selectedSlip.amount} Birr</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Bank</p>
                    <p className="font-medium">{selectedSlip.bank_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Uploaded By</p>
                    <p className="font-medium">{selectedSlip.uploaded_by}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Uploaded At</p>
                    <p className="text-sm">{new Date(selectedSlip.uploaded_at).toLocaleString()}</p>
                  </div>
                </div>

                {selectedSlip.ai_message && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-500">AI Analysis</p>
                    <p className="text-sm">{selectedSlip.ai_message}</p>
                    {selectedSlip.ai_extracted_amount && (
                      <p className="text-xs text-gray-500 mt-1">
                        Extracted Amount: {selectedSlip.ai_extracted_amount} Birr
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => handleReject(selectedSlip.id)}
                    disabled={actionLoading}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleVerify(selectedSlip.id)}
                    disabled={actionLoading}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Verify
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

export default BankSlips;