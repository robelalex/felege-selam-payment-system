// frontend/src/components/Admin/BulkImport.js
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload,
  Download,
  CheckCircle,
  AlertCircle,
  Loader,
  FileSpreadsheet,
  X,
  ChevronRight
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import axios from 'axios';

function BulkImport({ onClose, onSuccess }) {
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
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1
  });

  const downloadTemplate = async () => {
    try {
      const response = await axios.get('http://127.0.0.1:8000/api/students/download_template/', {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'student_import_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Error downloading template:', err);
      alert('Failed to download template');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setStep('processing');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(
        'http://127.0.0.1:8000/api/students/bulk_import/',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      setResults(response.data);
      setStep('results');
      
      if (response.data.success > 0) {
        onSuccess();
      }
    } catch (err) {
      console.error('Upload error:', err);
      setResults({
        error: err.response?.data?.error || 'Failed to process file',
        total: 0,
        success: 0,
        errors: [err.response?.data?.error || 'Unknown error']
      });
      setStep('results');
    } finally {
      setUploading(false);
    }
  };

  const downloadErrorReport = () => {
    if (!results || !results.errors) return;

    const errorText = results.errors.join('\n');
    const blob = new Blob([errorText], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'import_errors.txt');
    document.body.appendChild(link);
    link.click();
    link.remove();
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
          <h2 className="text-xl font-bold text-gray-900">Bulk Import Students</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Template Download */}
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <FileSpreadsheet className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-blue-900">Step 1: Download Template</h3>
                    <p className="text-sm text-blue-700 mt-1">
                      Start by downloading our Excel template. It contains the correct format and instructions.
                    </p>
                    <button
                      onClick={downloadTemplate}
                      className="mt-3 btn-outline flex items-center gap-2 text-sm"
                    >
                      <Download className="h-4 w-4" />
                      Download Template
                    </button>
                  </div>
                </div>
              </div>

              {/* File Upload */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Upload className="h-6 w-6 text-gray-600 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">Step 2: Upload Completed File</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Fill the template with your student data and upload it here.
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
                      <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                      {file ? (
                        <p className="text-sm text-gray-600">
                          Selected: <span className="font-semibold">{file.name}</span>
                        </p>
                      ) : isDragActive ? (
                        <p className="text-sm text-gray-600">Drop the file here...</p>
                      ) : (
                        <div>
                          <p className="text-sm text-gray-600">
                            Drag & drop your Excel file here, or click to select
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Supports .xlsx, .xls files
                          </p>
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
                              Upload & Import
                              <ChevronRight className="h-4 w-4" />
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-yellow-50 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-800 mb-2">Important Notes:</h4>
                <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                  <li>Do NOT modify the column headers</li>
                  <li>Required fields: First Name, Last Name, Grade, Parent Phone</li>
                  <li>Grade must be between 1 and 8</li>
                  <li>Phone format: 0912345678</li>
                  <li>Maximum 1000 students per file</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="text-center py-12">
              <Loader className="h-12 w-12 animate-spin text-primary-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900">Processing Your File</h3>
              <p className="text-gray-600 mt-2">Please wait while we import your students...</p>
            </div>
          )}

          {step === 'results' && results && (
            <div className="space-y-6">
              {results.error ? (
                <div className="bg-red-50 rounded-lg p-6 text-center">
                  <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-red-900">Import Failed</h3>
                  <p className="text-red-700 mt-2">{results.error}</p>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-green-700">{results.success}</p>
                      <p className="text-sm text-green-600">Successfully Imported</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 text-center">
                      <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                      <p className="text-2xl font-bold text-red-700">{results.errors?.length || 0}</p>
                      <p className="text-sm text-red-600">Errors</p>
                    </div>
                  </div>

                  {/* Success Message */}
                  {results.success > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-green-700">
                        ✅ Successfully imported {results.success} students with auto-generated IDs!
                      </p>
                    </div>
                  )}

                  {/* Errors */}
                  {results.errors && results.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-red-800">Errors Found:</h4>
                        <button
                          onClick={downloadErrorReport}
                          className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
                        >
                          <Download className="h-4 w-4" />
                          Download Error Report
                        </button>
                      </div>
                      <div className="max-h-40 overflow-y-auto">
                        {results.errors.map((error, index) => (
                          <p key={index} className="text-sm text-red-700 py-1 border-b border-red-100 last:border-0">
                            {error}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Imported Students Preview */}
                  {results.students && results.students.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-800 mb-3">Imported Students (First 10):</h4>
                      <div className="space-y-2">
                        {results.students.slice(0, 10).map((student) => (
                          <div key={student.id} className="text-sm bg-white p-2 rounded border">
                            <span className="font-mono text-primary-600">{student.student_id}</span>
                            <span className="mx-2">-</span>
                            <span>{student.name}</span>
                          </div>
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
                  Import More
                </button>
                <button
                  onClick={onClose}
                  className="btn-primary"
                >
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

export default BulkImport;