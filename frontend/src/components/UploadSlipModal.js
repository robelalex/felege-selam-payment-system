// frontend/src/components/UploadSlipModal.js
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, CheckCircle, AlertCircle, Loader, Building2, Calendar, User, DollarSign, CreditCard, Camera, Hash, Sparkles, RefreshCw } from 'lucide-react';
import api from '../services/api';

function UploadSlipModal({ student, deadline, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [bankName, setBankName] = useState('');
  const [amount, setAmount] = useState(deadline?.amount || '');
  const [transactionDate, setTransactionDate] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [schoolName, setSchoolName] = useState('School');
  
  // NEW: Auto-extraction states
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [autoFilled, setAutoFilled] = useState(false);

  useEffect(() => {
    const savedSchool = localStorage.getItem('selectedSchool');
    if (savedSchool) {
      try {
        const school = JSON.parse(savedSchool);
        setSchoolName(school.name || 'School');
      } catch (e) {
        console.error('Error parsing school:', e);
      }
    }
  }, []);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
      
      // NEW: Auto-extract data from image
      await autoExtractFromImage(selectedFile);
    }
  };

  // NEW: Auto-extract transaction reference and other data from image
  const autoExtractFromImage = async (imageFile) => {
    setExtracting(true);
    setError('');
    setExtractedData(null);
    
    const formData = new FormData();
    formData.append('slip_image', imageFile);
    formData.append('extract_only', 'true');
    
    try {
      const response = await api.post('slips/extract-data/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (response.data.success) {
        const data = response.data.extracted;
        setExtractedData(data);
        
        // Auto-fill fields if confidence is high
        if (data.confidence >= 70) {
          if (data.transaction_reference) {
            setTransactionReference(data.transaction_reference);
          }
          if (data.amount && !amount) {
            setAmount(data.amount);
          }
          if (data.bank_name && !bankName) {
            setBankName(data.bank_name);
          }
          if (data.transaction_date && !transactionDate) {
            setTransactionDate(data.transaction_date);
          }
          setAutoFilled(true);
          
          // Show success message briefly
          setTimeout(() => setAutoFilled(false), 3000);
        } else {
          setError(`Auto-detection confidence: ${data.confidence}%. Please verify and correct if needed.`);
        }
      }
    } catch (err) {
      console.error('Extraction error:', err);
      // Not a critical error, user can still fill manually
      setError('Could not auto-detect reference number. Please enter it manually.');
    } finally {
      setExtracting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a bank slip image');
      return;
    }

    if (!transactionReference) {
      setError('Transaction reference number is required. Please enter it or ensure the image is clear.');
      return;
    }

    setLoading(true);
    setError('');
    setAiResult(null);

    const formData = new FormData();
    formData.append('student_id', student.student_id);
    formData.append('deadline_id', deadline.id);
    formData.append('amount', amount);
    formData.append('bank_name', bankName);
    formData.append('transaction_date', transactionDate);
    formData.append('transaction_reference', transactionReference);
    formData.append('slip_image', file);
    formData.append('uploaded_by', student.parent_full_name || student.full_name);

    try {
      const response = await api.post('slips/upload/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      console.log('Upload response:', response.data);
      
      if (response.data.success) {
        setAiResult({
          confidence: response.data.ai_confidence,
          autoVerified: response.data.auto_verified,
          message: response.data.ai_message
        });
        setSuccess(true);
        setTimeout(() => {
          if (onSuccess) onSuccess(response.data);
          onClose();
        }, 2000);
      } else {
        setError(response.data.error || 'Upload failed');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-primary-600 px-5 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-white" />
              <h2 className="text-lg font-bold text-white">Upload Bank Slip</h2>
            </div>
            <button 
              onClick={onClose} 
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-lg font-semibold text-green-700">Uploaded Successfully!</p>
              {aiResult && (
                <div className="mt-3 p-2 bg-gray-50 rounded-lg text-sm">
                  {aiResult.autoVerified ? (
                    <p className="text-green-600">✅ AI Verified ({aiResult.confidence}%)</p>
                  ) : (
                    <p className="text-yellow-600">⏳ Pending Admin Verification</p>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2 font-medium">
                Transaction Ref: {transactionReference}
              </p>
              <p className="text-xs text-gray-500 mt-1">Redirecting...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Student Info */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-gray-500">Student</p>
                    <p className="font-medium text-gray-800">{student.full_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">ID</p>
                    <p className="font-mono text-xs text-gray-600">{student.student_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Month</p>
                    <p className="font-medium text-gray-800">{deadline?.month_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Amount</p>
                    <p className="font-bold text-primary-600">{amount} Birr</p>
                  </div>
                </div>
              </div>

              {/* Bank Info - Dynamic School Name */}
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  <h3 className="font-semibold text-blue-800 text-xs">Bank Transfer Details</h3>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Bank:</span>
                    <span className="font-medium">Commercial Bank of Ethiopia</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Account:</span>
                    <span className="font-medium">{schoolName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Reference:</span>
                    <span className="font-mono text-primary-600">{student.student_id}</span>
                  </div>
                </div>
              </div>

              {/* File Upload with Auto-extraction indicator */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bank Slip Image *
                </label>
                <div
                  className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-all
                    ${preview ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-primary-400'}
                    ${extracting ? 'opacity-50 pointer-events-none' : ''}
                  `}
                  onClick={() => document.getElementById('slip-input').click()}
                >
                  <input
                    id="slip-input"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    required
                  />
                  
                  {extracting ? (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Loader className="h-8 w-8 animate-spin text-primary-600" />
                      <p className="text-sm text-gray-500">Analyzing bank slip...</p>
                      <p className="text-xs text-gray-400">Extracting transaction reference</p>
                    </div>
                  ) : preview ? (
                    <div className="space-y-2">
                      <img
                        src={preview}
                        alt="Preview"
                        className="max-h-32 mx-auto rounded-lg"
                      />
                      {autoFilled && (
                        <div className="flex items-center justify-center gap-1 text-green-600 text-xs">
                          <Sparkles className="h-3 w-3" />
                          <span>Auto-filled detected information!</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          setPreview(null);
                          setTransactionReference('');
                          setExtractedData(null);
                        }}
                        className="text-xs text-red-500"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Camera className="h-8 w-8 text-gray-400" />
                      <p className="text-sm text-gray-500">Click to upload</p>
                      <p className="text-xs text-gray-400">PNG, JPG up to 5MB</p>
                      <p className="text-xs text-primary-600">✨ Reference number will be auto-detected</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Transaction Reference - Auto-filled with edit capability */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Transaction Reference Number <span className="text-red-500">*</span>
                  </label>
                  {extractedData && extractedData.confidence >= 70 && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Auto-detected ({extractedData.confidence}%)
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={transactionReference}
                    onChange={(e) => setTransactionReference(e.target.value)}
                    placeholder={extracting ? "Detecting reference number..." : "Enter or confirm transaction reference from bank slip"}
                    className={`w-full pl-10 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500
                      ${autoFilled ? 'border-green-400 bg-green-50' : 'border-gray-300'}
                    `}
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {extractedData?.transaction_reference ? 
                    `✓ Detected: ${extractedData.transaction_reference}. Please verify it's correct.` : 
                    "Take a clear photo of the reference number on your bank slip"}
                </p>
              </div>

              {/* Two Column Form */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Amount (Birr) *
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    required
                    step="0.01"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="e.g., CBE"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Transaction Date
                </label>
                <input
                  type="date"
                  value={transactionDate}
                  onChange={(e) => setTransactionDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {error && (
                <div className="bg-red-50 p-3 rounded-lg flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Auto-extraction info box */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  <p className="text-xs font-semibold text-blue-800">✨ Smart Detection Active</p>
                </div>
                <p className="text-xs text-blue-700">
                  Our system automatically detects the transaction reference number from your bank slip image.
                  Just take a clear photo and we'll fill it for you - just verify it's correct!
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || extracting}
                className="w-full bg-primary-600 text-white py-2.5 rounded-lg font-medium hover:bg-primary-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : extracting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Detecting...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload & Verify
                  </>
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