// src/pages/AdminSlips.js
import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Eye,
  Download,
  RefreshCw,
  AlertCircle,
  Trash2,
  CheckSquare,
  Square
} from 'lucide-react';
import api from '../services/api';
import { useYear } from '../context/YearContext';

// Get the base URL from environment or use default
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

function AdminSlips() {
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [error, setError] = useState('');
  const [selectedSlips, setSelectedSlips] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  
  const { selectedYear } = useYear();

  useEffect(() => {
    fetchPendingSlips();
  }, [selectedYear]);

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
      
      const queryString = params.toString();
      const url = queryString ? `/slips/pending/?${queryString}` : '/slips/pending/';
      
      console.log('📄 Fetching slips for year:', selectedYear?.name);
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
        await api.delete(`/slips/${slipId}/`);
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
    // Cloudinary or any full URL — use directly
    if (imagePath.startsWith('http')) return imagePath;
    // Local media file — strip /api from base URL
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

      {slips.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700">No Pending Slips</h2>
          <p className="text-gray-500 mt-2">
            All bank slips for {selectedYear?.name || 'selected academic year'} have been verified.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {/* Select All Header */}
          <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
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
                  <div className="flex items-center gap-3 mb-2">
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

                <div className="flex items-center gap-2">
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