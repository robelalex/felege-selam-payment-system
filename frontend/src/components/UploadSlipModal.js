// frontend/src/components/UploadSlipModal.js
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, CheckCircle, AlertCircle, Loader, Hash, Sparkles, Eye, HelpCircle } from 'lucide-react';
import api from '../services/api';

function UploadSlipModal({ student, deadline, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [transactionReference, setTransactionReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState(null);
  
  // Auto-extraction states
  const [extracting, setExtracting] = useState(false);
  const [aiDetected, setAiDetected] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setTransactionReference('');
      setAiDetected(false);
      setShowManualInput(false);
      
      await autoExtractFromImage(selectedFile);
    }
  };

  const autoExtractFromImage = async (imageFile) => {
    setExtracting(true);
    setError('');
    
    const formData = new FormData();
    formData.append('slip_image', imageFile);
    
    try {
      const response = await api.post('/slips/extract-data/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (response.data.success && response.data.extracted?.transaction_reference) {
        const ref = response.data.extracted.transaction_reference;
        setTransactionReference(ref);
        setAiDetected(true);
        
        // Auto-hide manual input if AI succeeded
        if (showManualInput) setShowManualInput(false);
      } else {
        // AI failed → prompt user to enter manually
        setShowManualInput(true);
        setError('Could not detect reference number. Please enter it manually below.');
      }
    } catch (err) {
      console.error('Extraction error:', err);
      setShowManualInput(true);
      setError('Auto-detection failed. Please enter reference number manually.');
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) return setError('Please select a bank slip image');
    if (!transactionReference.trim()) return setError('Transaction reference is required');

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('student_id', student.student_id);
    formData.append('deadline_id', deadline.id);
    formData.append('amount', deadline.amount);
    formData.append('bank_name', 'CBE'); // Always CBE for now
    formData.append('transaction_reference', transactionReference.trim());
    formData.append('slip_image', file);
    formData.append('uploaded_by', student.parent_full_name || student.full_name);

    try {
      const response = await api.post('/slips/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (response.data.success) {
        setSuccess(true);
        setVerificationStatus(response.data.verification_status);
        
        setTimeout(() => {
          if (onSuccess) onSuccess(response.data);
          onClose();
        }, 3000);
      } else {
        setError(response.data.error || 'Upload failed');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-white" />
            <h2 className="text-lg font-bold text-white">Upload Bank Slip</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {success ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-8">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Slip Uploaded!</h3>
              <p className="text-gray-600 mb-4">
                {verificationStatus === 'queued' 
                  ? '🔄 Verifying with CBE bank servers automatically...' 
                  : '✅ Your payment is being processed.'}
              </p>
              <div className="bg-gray-50 rounded-lg p-3 text-sm font-mono text-gray-700">
                Ref: {transactionReference}
              </div>
              <p className="text-xs text-gray-400 mt-4">Closing in 3 seconds...</p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Student Summary Card */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Student</p>
                    <p className="font-semibold text-gray-900">{student.full_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">ID</p>
                    <p className="font-mono text-gray-700">{student.student_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Month</p>
                    <p className="font-semibold text-gray-900">{deadline?.month_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Amount</p>
                    <p className="font-bold text-blue-700">{deadline?.amount} Birr</p>
                  </div>
                </div>
              </div>

              {/* File Upload Area */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Bank Slip Photo *</label>
                <div
                  className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
                    ${preview ? 'border-green-400 bg-green-50/50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'}
                    ${extracting ? 'opacity-60 pointer-events-none' : ''}`}
                  onClick={() => !extracting && document.getElementById('slip-input').click()}
                >
                  <input id="slip-input" type="file" accept="image/*" onChange={handleFileChange} className="hidden" required />
                  
                  {extracting ? (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Loader className="h-8 w-8 animate-spin text-blue-600" />
                      <p className="text-sm font-medium text-gray-600">Reading slip...</p>
                      <p className="text-xs text-gray-400">Detecting transaction reference</p>
                    </div>
                  ) : preview ? (
                    <div className="space-y-3">
                      <img src={preview} alt="Preview" className="max-h-40 mx-auto rounded-lg shadow-md" />
                      <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); setTransactionReference(''); setAiDetected(false); }} className="text-xs text-red-500 hover:text-red-700 font-medium">
                        ✕ Change photo
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                        <Upload className="h-6 w-6 text-blue-600" />
                      </div>
                      <p className="text-sm font-medium text-gray-700">Tap to upload bank slip</p>
                      <p className="text-xs text-gray-400">Clear photo = better detection</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Transaction Reference Field */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-gray-700">
                    Transaction Reference <span className="text-red-500">*</span>
                  </label>
                  {aiDetected && (
                    <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
                      <Sparkles className="h-3 w-3" /> AI Detected
                    </span>
                  )}
                </div>
                
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={transactionReference}
                    onChange={(e) => setTransactionReference(e.target.value)}
                    placeholder={extracting ? "Detecting..." : "e.g., FSPAY-FS-2019-0003-57-xxx"}
                    className={`w-full pl-10 pr-3 py-3 text-sm border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all
                      ${aiDetected ? 'border-green-400 bg-green-50/50' : 'border-gray-300'}
                      ${!transactionReference && showManualInput ? 'border-orange-400 bg-orange-50/30' : ''}`}
                    required
                  />
                </div>
                
                {/* Contextual help based on state */}
                {!aiDetected && !showManualInput && preview && !extracting && (
                  <button type="button" onClick={() => setShowManualInput(true)} className="mt-2 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium">
                    <HelpCircle className="h-3 w-3" /> Can't see reference? Enter manually
                  </button>
                )}
                
                <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                  {aiDetected 
                    ? `✓ Found: "${transactionReference}". Please verify it matches your slip.` 
                    : showManualInput 
                      ? "Enter the reference number exactly as shown on your bank receipt." 
                      : "We'll auto-detect this from your photo. Make sure the reference number is clearly visible."}
                </p>
              </div>

              {/* Error Display */}
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || extracting || !file}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3.5 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
              >
                {loading ? (
                  <><Loader className="h-4 w-4 animate-spin" /> Uploading & Queuing Verification...</>
                ) : (
                  <><Upload className="h-4 w-4" /> Upload Slip</>
                )}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default UploadSlipModal;