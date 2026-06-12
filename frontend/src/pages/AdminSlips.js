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
  Calendar,
  Copy,
  ExternalLink,
  Zap,
  X
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
  const [copySuccess, setCopySuccess] = useState('');
  
  // NEW: Configuration warning states
  const [showConfigWarning, setShowConfigWarning] = useState(false);
  const [configError, setConfigError] = useState(null);
  
  // Filter states
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  
  // Debounce timeout
  const searchTimeout = useRef(null);
  
  const { selectedYear } = useYear();

  // Debounced search
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
  
  // Copy to clipboard
  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(field);
    setTimeout(() => setCopySuccess(''), 2000);
  };

  // Check receipt using Verify.ET API (REAL WORKING SOLUTION)
  const checkReceiptWithVerifyET = async (slip) => {
    if (!slip.transaction_reference) {
      alert('No transaction reference found. Please ensure the slip was uploaded clearly.');
      return;
    }
    
    setProcessing(slip.id);
    setConfigError(null);
    setShowConfigWarning(false);
    
    try {
      const response = await api.post(`/slips/${slip.id}/check-receipt/`);
      
      // Handle configuration required message with UI warning (not alert)
      if (response.data.needs_configuration) {
        setConfigError({
          message: response.data.message,
          instruction: response.data.instruction,
          action_required: response.data.action_required,
          settings_url: response.data.settings_url
        });
        setShowConfigWarning(true);
        setProcessing(null);
        return;
      }
      
      if (response.data.success && response.data.verified) {
        const details = response.data.details;
        const amountMatch = details.amount_matches ? '✅ Amount matches' : '⚠️ Amount mismatch!';
        
        const userConfirmed = window.confirm(
          `✅ TRANSACTION VERIFIED BY CBE!\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📌 Payer Name: ${details.payer_name || 'N/A'}\n` +
          `💰 Amount: ${details.amount || 'N/A'} Birr\n` +
          `📅 Date: ${details.date || 'N/A'}\n` +
          `🏦 Receiver: ${details.receiver || 'N/A'}\n` +
          `🔢 Reference: ${details.reference || slip.transaction_reference}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${amountMatch}\n\n` +
          `Declared Amount: ${details.declared_amount || slip.amount} Birr\n\n` +
          `Do you want to VERIFY this payment?`
        );
        
        if (userConfirmed) {
          const verifyResponse = await api.post(`/slips/${slip.id}/verify-from-api/`);
          if (verifyResponse.data.success) {
            alert('✅ Payment has been VERIFIED and recorded successfully!');
            await fetchPendingSlips();
          } else {
            alert('❌ Failed to verify payment: ' + (verifyResponse.data.error || 'Unknown error'));
          }
        }
      } else if (response.data.queued) {
        alert(
          `⏳ VERIFICATION QUEUED\n\n` +
          `The request is being processed by CBE.\n` +
          `Please wait a few moments and try again.\n\n` +
          `Reference: ${response.data.details?.reference || slip.transaction_reference}`
        );
      } else {
        alert(
          `❌ VERIFICATION FAILED\n\n` +
          `${response.data.message || 'Could not verify this transaction.'}\n\n` +
          `Reference: ${slip.transaction_reference}\n\n` +
          `Possible reasons:\n` +
          `• Invalid reference number\n` +
          `• Transaction not found in CBE system\n` +
          `• Wrong account suffix configured\n\n` +
          `Please verify manually using the Verify button.`
        );
      }
    } catch (err) {
      console.error('Verify.ET error:', err);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Unknown error';
      alert(
        `❌ API ERROR\n\n` +
        `Could not connect to Verify.ET API.\n\n` +
        `Error: ${errorMsg}\n\n` +
        `Please check:\n` +
        `• Internet connection\n` +
        `• Verify.ET API key configuration for this school\n` +
        `• CBE account suffix is correct`
      );
    } finally {
      setProcessing(null);
    }
  };

  const handleVerify = async (slipId, action) => {
    setProcessing(slipId);
    try {
      await api.post(`/slips/${slipId}/verify/`, { action });
      if (action === 'verify') {
        alert('✅ Payment verified successfully!');
      } else {
        alert('❌ Payment rejected');
      }
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

      {/* Filters Section */}
      <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

      {/* ========== CONFIGURATION WARNING (like SMS warning) ========== */}
      {showConfigWarning && configError && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-yellow-800 font-medium">{configError.message}</p>
              <p className="text-yellow-700 text-sm mt-1">{configError.instruction}</p>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={() => {
                    window.location.href = configError.settings_url || '/school/verify-et-settings';
                  }}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm"
                >
                  Go to Verify.ET Settings
                </button>
                <button
                  onClick={() => setShowConfigWarning(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowConfigWarning(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

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
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
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
                  
                  {/* Transaction Reference Field */}
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      Transaction Reference (Auto-Detected)
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-1 bg-white border border-gray-300 rounded-lg text-sm font-mono">
                        {slip.transaction_reference || 'Not detected'}
                      </code>
                      {slip.transaction_reference && (
                        <button
                          onClick={() => copyToClipboard(slip.transaction_reference, 'ref')}
                          className="p-1 hover:bg-gray-200 rounded"
                          title="Copy transaction reference"
                        >
                          <Copy className="h-4 w-4 text-gray-600" />
                        </button>
                      )}
                    </div>
                    {copySuccess === 'ref' && (
                      <p className="text-xs text-green-600 mt-1">Copied!</p>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 mt-2">
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
                  
                  {/* ONLY BUTTONS: Verify.ET API and Manual Verify/Reject */}
                  <button
                    onClick={() => checkReceiptWithVerifyET(slip)}
                    disabled={processing === slip.id || !slip.transaction_reference}
                    className="btn-primary flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
                    title="Verify online using Verify.ET API - Instant results from CBE"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Check Receipt (Online)
                  </button>
                  
                  <button
                    onClick={() => handleVerify(slip.id, 'verify')}
                    disabled={processing === slip.id}
                    className="btn-primary flex items-center gap-2 bg-green-600 hover:bg-green-700"
                  >
                    {processing === slip.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
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