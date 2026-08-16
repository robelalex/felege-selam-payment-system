// src/components/Admin/StaffDetailModal.js
//
// ✅ Jimma item 5 — HR. Two tabs on one staff member:
//   - Documents: upload official documents (admin-defined type per
//     upload — National ID, Teaching Credential, Employment Contract,
//     whatever the school wants to call it), mark verified/unverified,
//     delete.
//   - Career History: automatic entries (role/title/status/salary
//     changes, logged server-side by staff/signals.py whenever the
//     staff record is edited) shown on the same timeline as manual
//     notes an admin adds by hand (e.g. "Promoted to Head Teacher").
//
// Both tabs load lazily from dedicated endpoints rather than trusting
// whatever the list view's StaffMemberSerializer happened to embed, so
// this stays correct even after other tabs on this same modal mutate
// the data (e.g. verifying a document, adding a note).
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, FileText, Upload, CheckCircle2, XCircle, Trash2, Loader,
  Clock, StickyNote, ShieldCheck,
} from 'lucide-react';
import api from '../../services/api';
import { getMediaUrl } from '../../utils/imageUrl';

const EVENT_LABELS = {
  role_change: 'Role changed',
  title_change: 'Title changed',
  status_change: 'Status changed',
  salary_change: 'Salary changed',
  note: 'Note',
};

function DocumentsTab({ staffId }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState('');
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/staff-documents/', { params: { staff_id: staffId } });
      setDocuments(res.data);
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!docType.trim() || !file) {
      setError('A document type and a file are both required.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const payload = new FormData();
      payload.append('staff', staffId);
      payload.append('document_type', docType.trim());
      payload.append('file', file);
      payload.append('notes', notes);
      await api.post('/staff-documents/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setDocType('');
      setFile(null);
      setNotes('');
      e.target.reset?.();
      fetchDocuments();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  const toggleVerify = async (doc) => {
    try {
      await api.post(`/staff-documents/${doc.id}/${doc.verified ? 'unverify' : 'verify'}/`);
      fetchDocuments();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update verification status.');
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.document_type}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/staff-documents/${doc.id}/`);
      fetchDocuments();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete document.');
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={handleUpload} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Document Type *</label>
            <input
              type="text" value={docType} onChange={(e) => setDocType(e.target.value)}
              placeholder="e.g. National ID, Teaching Credential, Contract 2026"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">File *</label>
            <input
              type="file" onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-600"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
          <input
            type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. issuing authority, expiry date"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <button
          type="submit" disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {uploading ? 'Uploading...' : 'Upload Document'}
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-8"><Loader className="h-6 w-6 animate-spin text-primary-600" /></div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">No documents on file yet.</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-start justify-between gap-3 border border-gray-200 rounded-lg p-3">
              <div className="flex items-start gap-3 min-w-0">
                <FileText className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <a
                      href={getMediaUrl(doc.file)} target="_blank" rel="noreferrer"
                      className="font-medium text-gray-900 hover:underline text-sm truncate"
                    >
                      {doc.document_type}
                    </a>
                    {doc.verified ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        <ShieldCheck className="h-3 w-3" /> Verified
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                        Unverified
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
                    {doc.uploaded_by_name ? ` by ${doc.uploaded_by_name}` : ''}
                  </p>
                  {doc.notes && <p className="text-xs text-gray-500 mt-0.5">{doc.notes}</p>}
                  {doc.verified && doc.verified_by_name && (
                    <p className="text-xs text-green-700 mt-0.5">Verified by {doc.verified_by_name}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => toggleVerify(doc)}
                  title={doc.verified ? 'Mark unverified' : 'Mark verified'}
                  className="p-1.5 hover:bg-gray-100 rounded-lg"
                >
                  {doc.verified ? (
                    <XCircle className="h-4 w-4 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  )}
                </button>
                <button onClick={() => handleDelete(doc)} className="p-1.5 hover:bg-red-50 rounded-lg">
                  <Trash2 className="h-4 w-4 text-red-600" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CareerHistoryTab({ staffId, staffName }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      // The staff detail already embeds career_events, but fetching the
      // member directly here keeps this tab correct even if it's opened
      // without going through the list first.
      const res = await api.get(`/staff-members/${staffId}/`);
      setEvents(res.data.career_events || []);
    } catch (err) {
      console.error('Error fetching career history:', err);
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) {
      setError('A note is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post(`/staff-members/${staffId}/career-notes/`, {
        note: note.trim(),
        effective_date: effectiveDate,
      });
      setNote('');
      fetchEvents();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={handleAddNote} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Add a career note for {staffName}</label>
          <textarea
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Promoted to Head Teacher — performance review"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div className="flex items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Effective date</label>
            <input
              type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          <button
            type="submit" disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700 disabled:opacity-50"
          >
            <StickyNote className="h-4 w-4" />
            {saving ? 'Saving...' : 'Add Note'}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="flex justify-center py-8"><Loader className="h-6 w-6 animate-spin text-primary-600" /></div>
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">No career history yet.</p>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <div key={ev.id} className="flex gap-3 border-l-2 border-primary-200 pl-4 py-1">
              <Clock className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-gray-900">
                  <span className="font-medium">{EVENT_LABELS[ev.event_type] || ev.event_type}</span>
                  {ev.event_type !== 'note' && (
                    <span className="text-gray-600"> — {ev.old_value || '(none)'} → {ev.new_value}</span>
                  )}
                </p>
                {ev.note && <p className="text-sm text-gray-600 mt-0.5">{ev.note}</p>}
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(ev.effective_date).toLocaleDateString()}
                  {ev.is_manual && ev.recorded_by_name ? ` · added by ${ev.recorded_by_name}` : ' · automatic'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const StaffDetailModal = ({ member, onClose }) => {
  const [tab, setTab] = useState('documents');

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{member.display_name || member.full_name}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex border-b border-gray-100 px-6">
          <button
            onClick={() => setTab('documents')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
              tab === 'documents' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500'
            }`}
          >
            Documents
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
              tab === 'history' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500'
            }`}
          >
            Career History
          </button>
        </div>

        <div className="p-6">
          {tab === 'documents' ? (
            <DocumentsTab staffId={member.id} />
          ) : (
            <CareerHistoryTab staffId={member.id} staffName={member.full_name} />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default StaffDetailModal;
