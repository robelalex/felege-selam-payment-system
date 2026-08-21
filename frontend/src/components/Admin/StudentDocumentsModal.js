// frontend/src/components/Admin/StudentDocumentsModal.js
// ✅ Manage enrollment documents (birth certificate, grade 6/8 leaving
// certificates, transfer certificate, yearly educational document) for a
// single student — upload, review (verify/reject with a note), and
// manually request something specific to this student that the parent
// dashboard should ask for.
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Upload,
  Loader,
  FileText,
  CheckCircle,
  XCircle,
  Trash2,
  AlertCircle,
  ShieldCheck,
  Plus,
  Clock
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
  { value: 'educational_document', label: 'Educational Document (Yearly)' },
  { value: 'other', label: 'Other' },
];

const STATUS_STYLES = {
  pending: { label: 'Pending Review', className: 'text-amber-700 bg-amber-100' },
  verified: { label: 'Verified', className: 'text-green-700 bg-green-100' },
  rejected: { label: 'Rejected', className: 'text-red-700 bg-red-100' },
};

const StudentDocumentsModal = ({ student, onClose }) => {
  const [documents, setDocuments] = useState(student?.documents || []);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadingType, setUploadingType] = useState(null);
  const [error, setError] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [rejectNoteFor, setRejectNoteFor] = useState(null);
  const [rejectNoteText, setRejectNoteText] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestType, setRequestType] = useState('other');
  const [requestLabel, setRequestLabel] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const recommended = getRecommendedTypes(student?.grade);

  const fetchAll = useCallback(async () => {
    if (!student?.id) return;
    setLoading(true);
    try {
      const [docsRes, reqRes] = await Promise.all([
        api.get(`/students/${student.id}/documents/`),
        api.get(`/students/${student.id}/document_requests/`),
      ]);
      setDocuments(docsRes.data);
      setRequests(reqRes.data.filter((r) => !r.is_resolved));
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setLoading(false);
    }
  }, [student]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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
      await fetchAll();
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

  const handleReview = async (documentId, newStatus, note = '') => {
    setReviewingId(documentId);
    try {
      await api.post(`/students/${student.id}/review_document/${documentId}/`, {
        status: newStatus,
        note,
      });
      await fetchAll();
      setRejectNoteFor(null);
      setRejectNoteText('');
    } catch (err) {
      console.error('Error reviewing document:', err);
      setError('Failed to update review status');
    } finally {
      setReviewingId(null);
    }
  };

  const submitRequest = async () => {
    if (requestType === 'other' && !requestLabel.trim()) {
      setError('Enter a short label for what this document is');
      return;
    }
    setSubmittingRequest(true);
    setError('');
    try {
      await api.post(`/students/${student.id}/request_document/`, {
        document_type: requestType,
        custom_label: requestLabel,
        note: requestNote,
      });
      setShowRequestForm(false);
      setRequestType('other');
      setRequestLabel('');
      setRequestNote('');
      await fetchAll();
    } catch (err) {
      console.error('Error creating document request:', err);
      setError(err.response?.data?.error || 'Failed to create request');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const cancelRequest = async (requestId) => {
    if (!window.confirm('Cancel this document request?')) return;
    try {
      await api.delete(`/students/${student.id}/delete_document_request/${requestId}/`);
      setRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (err) {
      console.error('Error cancelling request:', err);
      setError('Failed to cancel request');
    }
  };

  const docsByType = documents.reduce((acc, doc) => {
    // keep the most recent per type (list is already ordered -uploaded_at)
    if (!acc[doc.document_type]) acc[doc.document_type] = doc;
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
            <>
              {DOCUMENT_TYPES.map(type => {
                const existing = docsByType[type.value];
                const isRecommended = recommended.includes(type.value);
                const statusInfo = existing ? STATUS_STYLES[existing.status] || STATUS_STYLES.pending : null;
                return (
                  <div
                    key={type.value}
                    className={`border rounded-lg p-3 ${
                      isRecommended && !existing ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className={`h-5 w-5 flex-shrink-0 ${existing ? 'text-green-500' : 'text-gray-400'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-2 flex-wrap">
                            {type.label}
                            {isRecommended && !existing && (
                              <span className="text-xs text-amber-700 font-normal">recommended</span>
                            )}
                            {statusInfo && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.className}`}>
                                {statusInfo.label}
                              </span>
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
                              {existing.status === 'verified' && <ShieldCheck className="h-3 w-3 text-green-600 ml-1" />}
                            </a>
                          ) : (
                            <p className="text-xs text-gray-400">Not uploaded</p>
                          )}
                          {existing?.status === 'rejected' && existing.review_note && (
                            <p className="text-xs text-red-600 mt-1">Reason: {existing.review_note}</p>
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

                    {/* ✅ NEW: review controls — only meaningful once something's uploaded */}
                    {existing && existing.status !== 'verified' && rejectNoteFor !== existing.id && (
                      <div className="flex items-center gap-2 mt-2 pl-8">
                        <button
                          onClick={() => handleReview(existing.id, 'verified')}
                          disabled={reviewingId === existing.id}
                          className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 flex items-center gap-1"
                        >
                          <CheckCircle className="h-3 w-3" /> Verify
                        </button>
                        <button
                          onClick={() => setRejectNoteFor(existing.id)}
                          disabled={reviewingId === existing.id}
                          className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 flex items-center gap-1"
                        >
                          <XCircle className="h-3 w-3" /> Reject
                        </button>
                      </div>
                    )}
                    {existing && existing.status === 'verified' && (
                      <div className="pl-8 mt-1">
                        <button
                          onClick={() => handleReview(existing.id, 'pending')}
                          disabled={reviewingId === existing.id}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Undo verification
                        </button>
                      </div>
                    )}
                    {existing && rejectNoteFor === existing.id && (
                      <div className="pl-8 mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={rejectNoteText}
                          onChange={(e) => setRejectNoteText(e.target.value)}
                          placeholder="Why is it being rejected? (shown to parent)"
                          className="text-xs border border-gray-300 rounded px-2 py-1 flex-1"
                        />
                        <button
                          onClick={() => handleReview(existing.id, 'rejected', rejectNoteText)}
                          disabled={reviewingId === existing.id}
                          className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => { setRejectNoteFor(null); setRejectNoteText(''); }}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* ✅ NEW: admin-manual "we still need this" requests, specific to this student */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">Additional Requests to Parent</h3>
                  {!showRequestForm && (
                    <button
                      onClick={() => setShowRequestForm(true)}
                      className="text-xs text-primary-600 hover:underline flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Request something specific
                    </button>
                  )}
                </div>

                {requests.length === 0 && !showRequestForm && (
                  <p className="text-xs text-gray-400">No extra requests for this student.</p>
                )}

                {requests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between gap-3 bg-purple-50 border border-purple-100 rounded-lg p-3 mb-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-purple-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {req.custom_label || req.document_type_display}
                        </p>
                        {req.note && <p className="text-xs text-gray-500 truncate">{req.note}</p>}
                      </div>
                    </div>
                    <button
                      onClick={() => cancelRequest(req.id)}
                      className="text-xs text-gray-500 hover:text-red-600 flex-shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                ))}

                {showRequestForm && (
                  <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <select
                      value={requestType}
                      onChange={(e) => setRequestType(e.target.value)}
                      className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full"
                    >
                      {DOCUMENT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    {requestType === 'other' && (
                      <input
                        type="text"
                        value={requestLabel}
                        onChange={(e) => setRequestLabel(e.target.value)}
                        placeholder="What is it? e.g. 'Kebele ID letter'"
                        className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full"
                      />
                    )}
                    <input
                      type="text"
                      value={requestNote}
                      onChange={(e) => setRequestNote(e.target.value)}
                      placeholder="Note to parent (optional) — why it's needed"
                      className="text-sm border border-gray-300 rounded px-2 py-1.5 w-full"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={submitRequest}
                        disabled={submittingRequest}
                        className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
                      >
                        {submittingRequest ? <Loader className="h-3 w-3 animate-spin" /> : null}
                        Send Request
                      </button>
                      <button
                        onClick={() => setShowRequestForm(false)}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default StudentDocumentsModal;
