// frontend/src/components/Admin/StudentDocumentsModal.js
// ✅ NEW: Manage enrollment documents (birth certificate, grade 6/8 leaving
// certificates, transfer certificate) for a single student.
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Upload,
  Loader,
  FileText,
  CheckCircle,
  Trash2,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';
import api from '../../services/api';

// ✅ Which document types are suggested for a given grade — mirrors the
// Ethiopian system's transition points. This only affects which items
// are highlighted as "recommended"; any type can still be uploaded.
const getRecommendedTypes = (grade) => {
  const g = parseInt(grade, 10);
  const recommended = [];
  if (g === 1) recommended.push('birth_certificate');
  if (g === 7) recommended.push('leaving_certificate_grade6');
  if (g === 9) recommended.push('leaving_certificate_grade8');
  if (g === 12) recommended.push('grade12_certificate');
  return recommended;
};

const DOCUMENT_TYPES = [
  { value: 'birth_certificate', label: 'Birth Certificate' },
  { value: 'leaving_certificate_grade6', label: 'Grade 6 Leaving Certificate' },
  { value: 'leaving_certificate_grade8', label: 'Grade 8 Leaving Certificate' },
  { value: 'transfer_certificate', label: 'Transfer Certificate' },
  { value: 'grade12_certificate', label: 'Grade 12 Certificate' },
  { value: 'other', label: 'Other' },
];

const StudentDocumentsModal = ({ student, onClose }) => {
  const [documents, setDocuments] = useState(student?.documents || []);
  const [loading, setLoading] = useState(false);
  const [uploadingType, setUploadingType] = useState(null);
  const [error, setError] = useState('');

  const recommended = getRecommendedTypes(student?.grade);

  const fetchDocuments = useCallback(async () => {
    if (!student?.id) return;
    setLoading(true);
    try {
      const response = await api.get(`/students/${student.id}/documents/`);
      setDocuments(response.data);
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setLoading(false);
    }
  }, [student]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleUpload = async (documentType, file) => {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('File must be smaller than 10MB');
      return;
    }

    setUploadingType(documentType);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', documentType);

    try {
      await api.post(
        `/students/${student.id}/upload_document/`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      await fetchDocuments();
    } catch (err) {
      console.error('Document upload error:', err);
      setError(err.response?.data?.error || 'Failed to upload document');
    } finally {
      setUploadingType(null);
    }
  };

  const handleDelete = async (documentId) => {
    if (!window.confirm('Remove this document?')) return;
    try {
      await api.delete(`/students/${student.id}/delete_document/${documentId}/`);
      setDocuments(prev => prev.filter(d => d.id !== documentId));
    } catch (err) {
      console.error('Error deleting document:', err);
      setError('Failed to delete document');
    }
  };

  const docsByType = documents.reduce((acc, doc) => {
    acc[doc.document_type] = doc;
    return acc;
  }, {});

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
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Enrollment Documents</h2>
            <p className="text-sm text-gray-500">{student?.first_name} {student?.last_name} — Grade {student?.grade}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {recommended.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-700">
              For Grade {student?.grade}, this system usually expects: {' '}
              {recommended.map(r => DOCUMENT_TYPES.find(t => t.value === r)?.label).join(', ')}.
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <Loader className="h-6 w-6 animate-spin text-primary-600 mx-auto" />
            </div>
          ) : (
            DOCUMENT_TYPES.map(type => {
              const existing = docsByType[type.value];
              const isRecommended = recommended.includes(type.value);
              return (
                <div
                  key={type.value}
                  className={`border rounded-lg p-3 flex items-center justify-between gap-3 ${
                    isRecommended && !existing ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className={`h-5 w-5 flex-shrink-0 ${existing ? 'text-green-500' : 'text-gray-400'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {type.label}
                        {isRecommended && !existing && (
                          <span className="ml-2 text-xs text-amber-700 font-normal">recommended</span>
                        )}
                      </p>
                      {existing ? (
                        <a
                          href={existing.file}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary-600 hover:underline flex items-center gap-1"
                        >
                          <CheckCircle className="h-3 w-3" /> Uploaded — view file
                          {existing.verified && <ShieldCheck className="h-3 w-3 text-green-600 ml-1" />}
                        </a>
                      ) : (
                        <p className="text-xs text-gray-400">Not uploaded</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {existing && (
                      <button
                        onClick={() => handleDelete(existing.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <label className="btn-outline text-xs px-3 py-1.5 cursor-pointer flex items-center gap-1">
                      {uploadingType === type.value ? (
                        <Loader className="h-3 w-3 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3" />
                      )}
                      {existing ? 'Replace' : 'Upload'}
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(e) => handleUpload(type.value, e.target.files?.[0])}
                        disabled={uploadingType === type.value}
                      />
                    </label>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default StudentDocumentsModal;
