// frontend/src/components/Admin/BulkPhotoUpload.js
// ✅ NEW: Bulk photo upload via a single ZIP file, matched by Student ID
// filename. Mirrors the existing BulkImport.js pattern/styling exactly.
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  CheckCircle,
  AlertCircle,
  Loader,
  FileArchive,
  X,
  ChevronRight,
  Image as ImageIcon
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import api from '../../services/api';

function BulkPhotoUpload({ onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);
  const [step, setStep] = useState('upload'); // upload, processing, results

  const onDrop = useCallback((acceptedFiles) => {
    setFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/zip': ['.zip'],
      'application/x-zip-compressed': ['.zip']
    },
    maxFiles: 1
  });

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setStep('processing');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post(
        '/students/bulk_photo_upload/',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      setResults(response.data);
      setStep('results');

      if (response.data.matched_count > 0) {
        onSuccess();
      }
    } catch (err) {
      console.error('Bulk photo upload error:', err);
      setResults({
        error: err.response?.data?.error || 'Failed to process ZIP file',
      });
      setStep('results');
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Bulk Photo Upload</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <ImageIcon className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-blue-900">How it works</h3>
                    <ol className="text-sm text-blue-700 mt-1 space-y-1 list-decimal list-inside">
                      <li>Rename each photo to the student's ID, e.g. <span className="font-mono">FS-2024-1001.jpg</span></li>
                      <li>Put all the renamed photos into one ZIP file</li>
                      <li>Upload the ZIP below — each photo is matched to its student automatically</li>
                    </ol>
                    <p className="text-xs text-blue-600 mt-2">
                      Tip: export the student list first (Export button) to see each student's ID for naming files.
                    </p>
                  </div>
                </div>
              </div>

              {/* File Upload */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Upload className="h-6 w-6 text-gray-600 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">Upload ZIP File</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Photos must be JPG or PNG, up to 5MB each.
                    </p>

                    <div
                      {...getRootProps()}
                      className={`mt-4 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                        isDragActive
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-300 hover:border-primary-400 hover:bg-gray-100'
                      }`}
                    >
                      <input {...getInputProps()} />
                      <FileArchive className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                      {file ? (
                        <p className="text-sm text-gray-600">
                          Selected: <span className="font-semibold">{file.name}</span>
                        </p>
                      ) : isDragActive ? (
                        <p className="text-sm text-gray-600">Drop the ZIP file here...</p>
                      ) : (
                        <div>
                          <p className="text-sm text-gray-600">
                            Drag & drop your ZIP file here, or click to select
                          </p>
                          <p className="text-xs text-gray-500 mt-1">Supports .zip only</p>
                        </div>
                      )}
                    </div>

                    {file && (
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={handleUpload}
                          disabled={uploading}
                          className="btn-primary flex items-center gap-2"
                        >
                          {uploading ? (
                            <>
                              <Loader className="h-4 w-4 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              Upload & Match Photos
                              <ChevronRight className="h-4 w-4" />
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="text-center py-12">
              <Loader className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900">Matching Photos to Students</h3>
              <p className="text-gray-600 mt-2">This may take a moment for large batches...</p>
            </div>
          )}

          {step === 'results' && results && (
            <div className="space-y-6">
              {results.error ? (
                <div className="bg-red-50 rounded-lg p-6 text-center">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-red-900">Upload Failed</h3>
                  <p className="text-red-700 mt-2">{results.error}</p>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-green-700">{results.matched_count}</p>
                      <p className="text-sm text-green-600">Photos Matched</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-4 text-center">
                      <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-amber-700">
                        {(results.unmatched_count || 0) + (results.error_count || 0)}
                      </p>
                      <p className="text-sm text-amber-600">Skipped / Errors</p>
                    </div>
                  </div>

                  {results.matched_count > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-green-700">
                        ✅ {results.matched_count} student photo{results.matched_count === 1 ? '' : 's'} updated successfully!
                      </p>
                    </div>
                  )}

                  {/* Unmatched files */}
                  {results.unmatched && results.unmatched.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <h4 className="font-semibold text-amber-800 mb-3">Not Matched:</h4>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {results.unmatched.map((item, index) => (
                          <p key={index} className="text-sm text-amber-700 py-1 border-b border-amber-100 last:border-0">
                            <span className="font-mono">{item.filename}</span> — {item.reason}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Errors */}
                  {results.errors && results.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <h4 className="font-semibold text-red-800 mb-3">Errors:</h4>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {results.errors.map((item, index) => (
                          <p key={index} className="text-sm text-red-700 py-1 border-b border-red-100 last:border-0">
                            <span className="font-mono">{item.filename}</span> — {item.error}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setStep('upload');
                    setFile(null);
                    setResults(null);
                  }}
                  className="btn-secondary"
                >
                  Upload Another
                </button>
                <button onClick={onClose} className="btn-primary">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export default BulkPhotoUpload;
