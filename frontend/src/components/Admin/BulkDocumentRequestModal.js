// frontend/src/components/Admin/BulkDocumentRequestModal.js
// ✅ NEW: request a document from MANY students at once — same underlying
// action as StudentDocumentsModal's single-student "Request something
// specific" panel, just applied to a selection made on the AdminStudents
// list (checkboxes + Grade/Section filters), the same way Bulk Import
// and Bulk Photos already work. Does not touch or replace the single-
// student flow.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Loader, Users, CheckCircle } from 'lucide-react';
import api from '../../services/api';

const DOCUMENT_TYPES = [
  { value: 'birth_certificate', label: 'Birth Certificate' },
  { value: 'leaving_certificate_grade6', label: 'Grade 6 Leaving Certificate' },
  { value: 'leaving_certificate_grade8', label: 'Grade 8 Leaving Certificate' },
  { value: 'transfer_certificate', label: 'Transfer Certificate' },
  { value: 'grade12_certificate', label: 'Grade 12 Certificate' },
  { value: 'educational_document', label: 'Educational Document (Yearly)' },
  { value: 'other', label: 'Other' },
];

const BulkDocumentRequestModal = ({ students, onClose, onDone }) => {
  const [documentType, setDocumentType] = useState('educational_document');
  const [customLabel, setCustomLabel] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const submit = async () => {
    if (documentType === 'other' && !customLabel.trim()) {
      setError("Enter a short label for what this document is");
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await api.post('/students/request_document_bulk/', {
        student_ids: students.map((s) => s.id),
        document_type: documentType,
        custom_label: customLabel,
        note,
      });
      setResult(response.data);
      if (onDone) onDone();
    } catch (err) {
      console.error('Bulk document request error:', err);
      setError(err.response?.data?.error || 'Failed to send requests');
    } finally {
      setSubmitting(false);
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
        className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Request Document — Bulk</h2>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {students.length} student{students.length !== 1 ? 's' : ''} selected
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm text-red-700">{error}</div>
          )}

          {result ? (
            <div className="text-center py-4 space-y-2">
              <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
              <p className="text-sm text-gray-800">
                Requested from <strong>{result.created_count}</strong> student(s).
              </p>
              {result.skipped_existing_count > 0 && (
                <p className="text-xs text-gray-500">
                  {result.skipped_existing_count} already had this exact request open, so they were skipped.
                </p>
              )}
              <button onClick={onClose} className="btn-primary text-sm mt-3">Done</button>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 bg-purple-50 border border-purple-100 rounded-lg p-3">
                This sends the SAME document request to every selected student's parent dashboard —
                e.g. "every Grade 9 student needs this year's educational document".
              </p>

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Document</label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-2 w-full"
                >
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {documentType === 'other' && (
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">What is it?</label>
                  <input
                    type="text"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="e.g. 'Kebele ID letter'"
                    className="text-sm border border-gray-300 rounded px-2 py-2 w-full"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Note to parents (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Why it's needed"
                  className="text-sm border border-gray-300 rounded px-2 py-2 w-full"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={submit}
                  disabled={submitting || students.length === 0}
                  className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? <Loader className="h-4 w-4 animate-spin" /> : null}
                  Send to {students.length} Student{students.length !== 1 ? 's' : ''}
                </button>
                <button onClick={onClose} className="text-sm text-gray-500 hover:underline">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default BulkDocumentRequestModal;
