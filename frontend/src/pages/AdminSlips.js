// frontend/src/pages/AdminSlips.js
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Eye,
  Download,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import api from '../services/api';

function AdminSlips() {
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    fetchPendingSlips();
  }, []);

  const fetchPendingSlips = async () => {
    setLoading(true);
    try {
      const response = await api.get('/slips/pending/');
      setSlips(response.data);
    } catch (err) {
      console.error('Error fetching slips:', err);
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
      alert('Failed to verify slip');
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Bank Slip Verification</h1>
        <button
          onClick={fetchPendingSlips}
          className="btn-outline flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {slips.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700">No Pending Slips</h2>
          <p className="text-gray-500 mt-2">All bank slips have been verified.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {slips.map((slip) => (
            <motion.div
              key={slip.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-lg p-6"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg">{slip.student_name}</h3>
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                      Grade {slip.grade}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">ID: {slip.student_id}</p>
                  <p className="text-sm text-gray-600">Month: {slip.month}</p>
                  <p className="text-sm text-gray-600">Bank: {slip.bank_name || 'Not specified'}</p>
                  <p className="text-lg font-bold text-primary-600 mt-2">{slip.amount} Birr</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Uploaded: {new Date(slip.uploaded_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedImage(slip.slip_image)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="View Slip"
                  >
                    <Eye className="h-5 w-5 text-gray-600" />
                  </button>
                  <a
                    href={slip.slip_image}
                    download
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
                    className="btn-secondary flex items-center gap-2 text-red-600"
                  >
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                </div>
              </div>
            </motion.div>
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
              className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg"
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