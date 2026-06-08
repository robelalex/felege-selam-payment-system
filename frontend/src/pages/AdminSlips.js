// src/pages/AdminSlips.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Eye,
  Download,
  RefreshCw,
  AlertCircle,
  Trash2,
  CheckSquare,
  Square,
  Search,
  GraduationCap,
  Calendar
} from 'lucide-react';
import api from '../services/api';
import { useYear } from '../context/YearContext';

// Get the base URL from environment or use default
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

// Ethiopian months
const months = [
  'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
  'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'
];

const grades = [1, 2, 3, 4, 5, 6, 7, 8];

function AdminSlips() {
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [error, setError] = useState('');
  const [selectedSlips, setSelectedSlips] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  
  // ✅ NEW: Filter states
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  
  // Debounce timeout
  const searchTimeout = useRef(null);
  
  const { selectedYear } = useYear();

  // ✅ Debounced search
  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    searchTimeout.current = setTimeout(() => {
      fetchPendingSlips();
    }, 500);
    
    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [studentSearch]);

  useEffect(() => {
    fetchPendingSlips();
  }, [selectedYear, filterGrade, filterMonth, studentSearch]);

  // Handle select all when page changes
  useEffect(() => {
    if (selectAll) {
      setSelectedSlips(slips.map(slip => slip.id));
    } else {
      setSelectedSlips([]);
    }
  }, [selectAll, slips]);

  const fetchPendingSlips = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      
      if (selectedYear && selectedYear.id) {
        params.append('academic_year_id', selectedYear.id);
        params.append('academic_year', selectedYear.year_ec);
        params.append('year_id', selectedYear.id);
      }
      
      // ✅ NEW: Add filter parameters
      if (filterGrade && filterGrade !== 'all') {
        params.append('grade', filterGrade);
      }
      
      if (filterMonth && filterMonth !== 'all') {
        params.append('month', filterMonth);
      }
      
      if (studentSearch && studentSearch.trim()) {
        params.append('student_search', studentSearch);
      }
      
      const queryString = params.toString();
      const url = queryString ? `/slips/pending/?${queryString}` : '/slips/pending/';
      
      console.log('📄 Fetching slips with filters:', { filterGrade, filterMonth, studentSearch });
      const response = await api.get(url);
      setSlips(response.data);
      setSelectedSlips([]);
      setSelectAll(false);
    } catch (err) {
      console.error('Error fetching slips:', err);
      setError('Failed to load pending slips');
    } finally {
      setLoading(false);
    }
  };
  
  const handleVerify = async (slipId, action) => {
    setProcessing(slipId);
    try {
      await api.post(`/slips/${slipId}/verify/`, { action });
      await fetchPendingSlips();
    } catch (err) {
      console.error('Error verifying slip:', err);
      alert('Failed to verify slip');
    } finally {
      setProcessing(null);
    }
  };

  const deleteSlip = async (slipId) => {
    if (window.confirm('Are you sure you want to delete this slip? This action cannot be undone.')) {
      setProcessing(slipId);
      try {
        await api.delete(`/slips/${slipId}/delete/`);
        await fetchPendingSlips();
      } catch (err) {
        console.error('Error deleting slip:', err);
        alert('Failed to delete slip');
      } finally {
        setProcessing(null);
      }
    }
  };

  const bulkDeleteSlips = async () => {
    if (selectedSlips.length === 0) {
      alert('Please select at least one slip to delete.');
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete ${selectedSlips.length} slip(s)? This action cannot be undone.`)) {
      try {
        await api.post('/slips/bulk-delete/', { slip_ids: selectedSlips });
        await fetchPendingSlips();
      } catch (err) {
        console.error('Error bulk deleting slips:', err);
        alert('Failed to delete slips');
      }
    }
  };

  const toggleSelectSlip = (slipId) => {
    setSelectedSlips(prev => 
      prev.includes(slipId) 
        ? prev.filter(id => id !== slipId)
        : [...prev, slipId]
    );
    setSelectAll(false);
  };

  const getFullImageUrl = (imagePath) => {
    if (!imagePath) return null;
    if (imagePath.startsWith('http')) return imagePath;
    const backendRoot = (process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000')
        .replace(/\/api\/?$/, '');
    if (imagePath.startsWith('/media')) return `${backendRoot}${imagePath}`;
    return `${backendRoot}/media/${imagePath}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-lg">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-red-700">{error}</p>
        </div>
        <button onClick={fetchPendingSlips} className="mt-4 btn-primary">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Bank Slip Verification</h1>
          {selectedYear && (
            <p className="text-sm text-primary-600 mt-1 font-medium">
              📅 Academic Year: {selectedYear.name || selectedYear.year_ec + ' E.C.'}
            </p>
          )}
          <p className="text-sm text-gray-500">
            {slips.length} pending {slips.length === 1 ? 'slip' : 'slips'} waiting for verification
          </p>
        </div>
        <div className="flex gap-2">
          {selectedSlips.length > 0 && (
            <button onClick={bulkDeleteSlips} className="btn-danger flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              Delete Selected ({selectedSlips.length})
            </button>
          )}
          <button onClick={fetchPendingSlips} className="btn-outline flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* ✅ NEW: Filters Section */}
      <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Grade Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <GraduationCap className="h-4 w-4 inline mr-1" />
              Filter by Grade
            </label>
            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">All Months</option>
              {months.map((month, index) => (
                <option key={index} value={index + 1}>{month}</option>
              ))}
            </select>
          </div>

          {/* Student Search */}
          <div>
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
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        </div>
      </div>

      {slips.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700">No Pending Slips</h2>
          <p className="text-gray-500 mt-2">
            All bank slips for {selectedYear?.name || 'selected academic year'} have been verified.
          </p>
          {(filterGrade !== 'all' || filterMonth !== 'all' || studentSearch) && (
            <button
              onClick={() => {
                setFilterGrade('all');
                setFilterMonth('all');
                setStudentSearch('');
              }}
              className="mt-4 text-primary-600 hover:text-primary-700"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {/* Select All Header */}
          <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
            <button
              onClick={() => setSelectAll(!selectAll)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700"
            >
              {selectAll ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {selectAll ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-sm text-gray-500">
              {selectedSlips.length} of {slips.length} selected
            </span>
          </div>

          {slips.map((slip) => (
            <div
              key={slip.id}
              className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 hover:shadow-xl transition-shadow"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <input
                      type="checkbox"
                      checked={selectedSlips.includes(slip.id)}
                      onChange={() => toggleSelectSlip(slip.id)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <h3 className="font-semibold text-lg">{slip.student_name}</h3>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                      Grade {slip.grade}
                    </span>
                    {slip.ai_confidence > 0 && (
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        slip.ai_confidence >= 85 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        AI: {slip.ai_confidence}%
                      </span>
                    )}
                    {slip.auto_verified && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                        Auto-verified by AI
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">ID: {slip.student_id}</p>
                  <p className="text-sm text-gray-600">Month: {slip.month}</p>
                  <p className="text-sm text-gray-600">Bank: {slip.bank_name || 'Not specified'}</p>
                  <p className="text-lg font-bold text-primary-600 mt-2">{parseFloat(slip.amount).toLocaleString()} Birr</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Uploaded: {new Date(slip.uploaded_at).toLocaleString()}
                  </p>
                  {slip.ai_message && (
                    <p className="text-xs text-gray-500 mt-1 italic">🤖 {slip.ai_message}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedImage(getFullImageUrl(slip.slip_image))}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="View Slip"
                  >
                    <Eye className="h-5 w-5 text-gray-600" />
                  </button>
                  <a
                    href={getFullImageUrl(slip.slip_image)}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Download Slip"
                  >
                    <Download className="h-5 w-5 text-gray-600" />
                  </a>
                  <button
                    onClick={() => handleVerify(slip.id, 'verify')}
                    disabled={processing === slip.id}
                    className="btn-primary flex items-center gap-2"
                  >
                    {processing === slip.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    Verify
                  </button>
                  <button
                    onClick={() => handleVerify(slip.id, 'reject')}
                    disabled={processing === slip.id}
                    className="btn-secondary flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                  <button
                    onClick={() => deleteSlip(slip.id)}
                    disabled={processing === slip.id}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                    title="Delete Slip"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image Preview Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-3xl w-full">
            <img
              src={selectedImage}
              alt="Bank Slip"
              className="w-full rounded-lg shadow-2xl"
            />
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
            >
              <XCircle className="h-6 w-6 text-gray-600" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminSlips;