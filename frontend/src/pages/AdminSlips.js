// src/pages/AdminSlips.js
import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle, XCircle, Eye, Download, RefreshCw, AlertCircle,
  Trash2, CheckSquare, Square, Search, GraduationCap, Calendar,
  Copy, ExternalLink, Zap, X, Clock, ShieldCheck, ShieldAlert
} from 'lucide-react';
import api from '../services/api';
import { useYear } from '../context/YearContext';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

const months = [
  'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
  'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'
];
const grades = [1, 2, 3, 4, 5, 6, 7, 8];

// ✅ Status badge component
const StatusBadge = ({ status, error }) => {
  const config = {
    queued: { color: 'bg-blue-100 text-blue-800', icon: Clock, label: 'Verifying...' },
    pending: { color: 'bg-gray-100 text-gray-700', icon: Clock, label: 'Pending' },
    verified: { color: 'bg-green-100 text-green-800', icon: ShieldCheck, label: 'Verified' },
    failed: { color: 'bg-red-100 text-red-800', icon: ShieldAlert, label: 'Failed' },
    timeout: { color: 'bg-orange-100 text-orange-800', icon: Clock, label: 'Timed Out' },
    manual_review: { color: 'bg-yellow-100 text-yellow-800', icon: AlertCircle, label: 'Needs Review' },
  };
  
  const c = config[status] || config.pending;
  const Icon = c.icon;
  
  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${c.color}`}>
      <Icon className="h-3.5 w-3.5" />
      {c.label}
      {error && status !== 'verified' && (
        <span className="ml-1 opacity-75 truncate max-w-[150px]" title={error}>
          ({error})
        </span>
      )}
    </div>
  );
};

function AdminSlips() {
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [error, setError] = useState('');
  const [selectedSlips, setSelectedSlips] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [copySuccess, setCopySuccess] = useState('');
  const [showConfigWarning, setShowConfigWarning] = useState(false);
  const [configError, setConfigError] = useState(null);
  
  // Filter states
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [studentSearch, setStudentSearch] = useState('');
  
  const searchTimeout = useRef(null);
  const autoRefreshRef = useRef(null);
  const { selectedYear } = useYear();

  // ✅ Auto-refresh every 10 seconds to show live verification updates
  useEffect(() => {
    autoRefreshRef.current = setInterval(() => {
      fetchPendingSlips(true); // silent refresh
    }, 10000);
    
    return () => clearInterval(autoRefreshRef.current);
  }, [selectedYear, filterGrade, filterMonth, studentSearch]);

  // Debounced search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchPendingSlips(), 500);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [studentSearch]);

  useEffect(() => { fetchPendingSlips(); }, [selectedYear, filterGrade, filterMonth]);

  useEffect(() => {
    if (selectAll) setSelectedSlips(slips.map(s => s.id));
    else setSelectedSlips([]);
  }, [selectAll, slips]);

  const fetchPendingSlips = async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (selectedYear?.id) {
        params.append('academic_year_id', selectedYear.id);
        params.append('academic_year', selectedYear.year_ec);
        params.append('year_id', selectedYear.id);
      }
      if (filterGrade && filterGrade !== 'all') params.append('grade', filterGrade);
      if (filterMonth && filterMonth !== 'all') params.append('month', filterMonth);
      if (studentSearch?.trim()) params.append('student_search', studentSearch);
      
      const url = params.toString() ? `/slips/pending/?${params}` : '/slips/pending/';
      const response = await api.get(url);
      setSlips(response.data);
      if (!silent) { setSelectedSlips([]); setSelectAll(false); }
    } catch (err) {
      console.error('Error fetching slips:', err);
      if (!silent) setError('Failed to load pending slips');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(field);
    setTimeout(() => setCopySuccess(''), 2000);
  };

  // ✅ Retry failed verification (re-triggers background task)
  const retryVerification = async (slip) => {
    if (!slip.transaction_reference) {
      alert('No transaction reference. Please update it first.');
      return;
    }
    setProcessing(slip.id);
    try {
      const res = await api.post(`/slips/${slip.id}/update-transaction-ref/`, {
        transaction_reference: slip.transaction_reference
      });
      alert(`🔄 Re-verification queued! Task ID: ${res.data.task_id}`);
      await fetchPendingSlips();
    } catch (err) {
      alert('Failed to retry: ' + (err.response?.data?.error || 'Unknown error'));
    } finally {
      setProcessing(null);
    }
  };

  // Manual sync check (fallback when async fails)
  const checkReceiptWithVerifyET = async (slip) => {
    if (!slip.transaction_reference) {
      alert('No transaction reference found.');
      return;
    }
    setProcessing(slip.id);
    setConfigError(null);
    setShowConfigWarning(false);
    
    try {
      const response = await api.post(`/slips/${slip.id}/check-receipt/`);
      
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
        const d = response.data.details;
        const match = d.amount_matches ? '✅ Amount matches' : '⚠️ Amount mismatch!';
        if (window.confirm(
          `✅ VERIFIED BY CBE!\n\nPayer: ${d.payer_name}\nAmount: ${d.amount} Birr\nDate: ${d.date}\n${match}\n\nVerify this payment?`
        )) {
          const vr = await api.post(`/slips/${slip.id}/verify-from-api/`);
          if (vr.data.success) {
            alert('✅ Payment verified and recorded!');
            await fetchPendingSlips();
          } else {
            alert('❌ ' + (vr.data.error || 'Failed'));
          }
        }
      } else if (response.data.queued) {
        alert('⏳ Still processing. Try again in a moment.');
      } else {
        alert('❌ ' + (response.data.message || 'Could not verify.'));
      }
    } catch (err) {
      alert('❌ API Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setProcessing(null);
    }
  };

  const handleVerify = async (slipId, action) => {
    setProcessing(slipId);
    try {
      await api.post(`/slips/${slipId}/verify/`, { action });
      alert(action === 'verify' ? '✅ Verified!' : '❌ Rejected');
      await fetchPendingSlips();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setProcessing(null);
    }
  };

  const deleteSlip = async (slipId) => {
    if (!window.confirm('Delete this slip permanently?')) return;
    setProcessing(slipId);
    try {
      await api.delete(`/slips/${slipId}/delete/`);
      await fetchPendingSlips();
    } catch (err) { alert('Delete failed'); }
    finally { setProcessing(null); }
  };

  const bulkDeleteSlips = async () => {
    if (!selectedSlips.length) return alert('Select slips first.');
    if (!window.confirm(`Delete ${selectedSlips.length} slip(s)?`)) return;
    try {
      await api.post('/slips/bulk-delete/', { slip_ids: selectedSlips });
      await fetchPendingSlips();
    } catch (err) { alert('Bulk delete failed'); }
  };

  const toggleSelectSlip = (id) => {
    setSelectedSlips(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setSelectAll(false);
  };

  const getFullImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const root = (API_BASE_URL).replace(/\/api\/?$/, '');
    return path.startsWith('/media') ? `${root}${path}` : `${root}/media/${path}`;
  };

  // Count stats
  const verifiedCount = slips.filter(s => s.verification_status === 'verified').length;
  const needsAttentionCount = slips.filter(s => ['failed', 'timeout', 'manual_review'].includes(s.verification_status)).length;

  if (loading) {
    return <div className="flex justify-center items-center h-64"><RefreshCw className="h-8 w-8 animate-spin text-primary-600" /></div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-lg">
        <div className="flex items-center gap-2"><AlertCircle className="h-5 w-5 text-red-500" /><p className="text-red-700">{error}</p></div>
        <button onClick={() => fetchPendingSlips()} className="mt-4 btn-primary">Try Again</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with live stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Bank Slip Verification</h1>
          {selectedYear && <p className="text-sm text-primary-600 mt-1 font-medium">📅 {selectedYear.name || selectedYear.year_ec + ' E.C.'}</p>}
          <div className="flex gap-4 mt-2 text-sm">
            <span className="text-gray-500">{slips.length} total</span>
            <span className="text-green-600 font-medium">✅ {verifiedCount} verified</span>
            <span className="text-orange-600 font-medium">⚠️ {needsAttentionCount} need attention</span>
            <span className="text-blue-600 text-xs self-center">🔄 Auto-refreshing every 10s</span>
          </div>
        </div>
        <div className="flex gap-2">
          {selectedSlips.length > 0 && (
            <button onClick={bulkDeleteSlips} className="btn-danger flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Delete ({selectedSlips.length})
            </button>
          )}
          <button onClick={() => fetchPendingSlips()} className="btn-outline flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2"><GraduationCap className="h-4 w-4 inline mr-1" /> Grade</label>
            <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500">
              <option value="all">All Grades</option>
              {grades.map(g => <option key={g} value={g}>Grade {g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2"><Calendar className="h-4 w-4 inline mr-1" /> Month</label>
            <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500">
              <option value="all">All Months</option>
              {months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2"><Search className="h-4 w-4 inline mr-1" /> Search Student</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="ID or name..." className="w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Config Warning */}
      {showConfigWarning && configError && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-yellow-800 font-medium">{configError.message}</p>
              <p className="text-yellow-700 text-sm mt-1">{configError.instruction}</p>
              <div className="mt-3 flex gap-3">
                <button onClick={() => window.location.href = configError.settings_url || '/school/verify-et-settings'} className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm">Go to Settings</button>
                <button onClick={() => setShowConfigWarning(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">Dismiss</button>
              </div>
            </div>
            <button onClick={() => setShowConfigWarning(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {slips.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700">No Slips Needing Attention</h2>
          <p className="text-gray-500 mt-2">All bank slips have been processed.</p>
          {(filterGrade !== 'all' || filterMonth !== 'all' || studentSearch) && (
            <button onClick={() => { setFilterGrade('all'); setFilterMonth('all'); setStudentSearch(''); }} className="mt-4 text-primary-600 hover:text-primary-700">Clear filters</button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {/* Select All Bar */}
          <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
            <button onClick={() => setSelectAll(!selectAll)} className="flex items-center gap-2 text-sm font-medium text-gray-700">
              {selectAll ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {selectAll ? 'Deselect All' : 'Select All'}
            </button>
            <span className="text-sm text-gray-500">{selectedSlips.length} of {slips.length} selected</span>
          </div>

          {/* Slip Cards */}
          {slips.map((slip) => (
            <div key={slip.id} className={`bg-white rounded-xl shadow-lg p-6 border transition-shadow hover:shadow-xl ${
              slip.verification_status === 'verified' ? 'border-green-200' :
              ['failed', 'timeout', 'manual_review'].includes(slip.verification_status) ? 'border-orange-200' :
              'border-gray-100'
            }`}>
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <input type="checkbox" checked={selectedSlips.includes(slip.id)} onChange={() => toggleSelectSlip(slip.id)} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                    <h3 className="font-semibold text-lg">{slip.student_name}</h3>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">Grade {slip.grade}</span>
                    
                    {/* ✅ NEW: Async Status Badge */}
                    <StatusBadge status={slip.verification_status} error={slip.verification_error} />
                    
                    {slip.ai_confidence > 0 && (
                      <span className={`px-2 py-1 rounded-full text-xs ${slip.ai_confidence >= 85 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        OCR: {slip.ai_confidence}%
                      </span>
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-600">ID: {slip.student_id} • {slip.month} • {slip.bank_name || 'N/A'}</p>
                  <p className="text-lg font-bold text-primary-600 mt-1">{parseFloat(slip.amount).toLocaleString()} Birr</p>
                  
                  {/* Verified Details (shown inline when verified) */}
                  {slip.verification_status === 'verified' && slip.verify_et_payer_name && (
                    <div className="mt-2 p-2 bg-green-50 rounded-lg text-sm text-green-800">
                      ✅ Payer: <strong>{slip.verify_et_payer_name}</strong> • Bank Amount: <strong>{slip.verify_et_amount} Birr</strong>
                      {slip.verified_at_system && <span> • {new Date(slip.verified_at_system).toLocaleTimeString()}</span>}
                    </div>
                  )}
                  
                  {/* Transaction Reference */}
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <label className="text-xs font-medium text-gray-500 block mb-1">Transaction Reference</label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-1 bg-white border rounded-lg text-sm font-mono truncate">
                        {slip.transaction_reference || 'Not detected'}
                      </code>
                      {slip.transaction_reference && (
                        <button onClick={() => copyToClipboard(slip.transaction_reference, 'ref')} className="p-1 hover:bg-gray-200 rounded" title="Copy">
                          <Copy className="h-4 w-4 text-gray-600" />
                        </button>
                      )}
                    </div>
                    {copySuccess === 'ref' && <p className="text-xs text-green-600 mt-1">Copied!</p>}
                  </div>

                  <p className="text-xs text-gray-400 mt-2">Uploaded: {new Date(slip.uploaded_at).toLocaleString()}</p>
                </div>

                {/* Action Buttons - Context-aware based on status */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setSelectedImage(getFullImageUrl(slip.slip_image))} className="p-2 hover:bg-gray-100 rounded-lg" title="View Slip"><Eye className="h-5 w-5 text-gray-600" /></button>
                  <a href={getFullImageUrl(slip.slip_image)} download target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-gray-100 rounded-lg" title="Download"><Download className="h-5 w-5 text-gray-600" /></a>
                  
                  {/* ✅ Retry button ONLY for failed/timeout/manual_review */}
                  {['failed', 'timeout', 'manual_review'].includes(slip.verification_status) && slip.transaction_reference && (
                    <button
                      onClick={() => retryVerification(slip)}
                      disabled={processing === slip.id}
                      className="btn-primary flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 rounded-lg"
                      title="Re-trigger background verification"
                    >
                      {processing === slip.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      Retry
                    </button>
                  )}
                  
                  {/* Manual sync check (fallback) */}
                  {slip.verification_status !== 'verified' && (
                    <button
                      onClick={() => checkReceiptWithVerifyET(slip)}
                      disabled={processing === slip.id || !slip.transaction_reference}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-3 py-2 rounded-lg disabled:bg-gray-400"
                      title="Manual sync check (blocks until result)"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Manual Check
                    </button>
                  )}
                  
                  {/* Manual Verify/Reject always available */}
                  {slip.verification_status !== 'verified' && (
                    <>
                      <button onClick={() => handleVerify(slip.id, 'verify')} disabled={processing === slip.id} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-2 rounded-lg">
                        {processing === slip.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Verify
                      </button>
                      <button onClick={() => handleVerify(slip.id, 'reject')} disabled={processing === slip.id} className="flex items-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm px-3 py-2 rounded-lg">
                        <XCircle className="h-4 w-4" /> Reject
                      </button>
                    </>
                  )}
                  
                  <button onClick={() => deleteSlip(slip.id)} disabled={processing === slip.id} className="p-2 hover:bg-red-50 rounded-lg text-red-600" title="Delete"><Trash2 className="h-5 w-5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-3xl w-full">
            <img src={selectedImage} alt="Bank Slip" className="w-full rounded-lg shadow-2xl" />
            <button onClick={() => setSelectedImage(null)} className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100"><XCircle className="h-6 w-6 text-gray-600" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminSlips;