// frontend/src/components/Admin/FeeExceptionsModal.js
// ✅ NEW (Jimma request #1 — fee exceptions & flexible payment plans).
// Lets a school admin/accountant grant a student a one-time waiver
// amount or a reduced partial-monthly arrangement for a given academic
// year, backed by a required supporting document (kebele/NGO letter).
// Mirrors StudentDocumentsModal.js's structure/conventions.
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Upload,
  Loader,
  AlertCircle,
  CheckCircle,
  XCircle,
  HeartHandshake,
} from 'lucide-react';
import api from '../../services/api';

const OVERRIDE_TYPES = [
  { value: 'waiver', label: 'One-Time Waiver Amount', help: 'A single total amount for the whole year, instead of every monthly fee.' },
  { value: 'partial', label: 'Partial Monthly Payment', help: 'A reduced amount charged every month instead of the normal fee.' },
];

const FeeExceptionsModal = ({ student, academicYear, onClose }) => {
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [overrideType, setOverrideType] = useState('waiver');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);

  const fetchOverrides = useCallback(async () => {
    if (!student?.student_id) return;
    setLoading(true);
    try {
      const response = await api.get('/fee-overrides/', {
        params: { student_id: student.student_id },
      });
      setOverrides(response.data?.results || response.data || []);
    } catch (err) {
      console.error('Error fetching fee overrides:', err);
    } finally {
      setLoading(false);
    }
  }, [student]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  const activeOverride = overrides.find(o => o.is_active && o.academic_year === academicYear?.id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!file) {
      setError('A supporting document (kebele/NGO letter) is required.');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }
    if (!academicYear?.id) {
      setError('No academic year selected.');
      return;
    }

    setSubmitting(true);
    const formData = new FormData();
    formData.append('student', student.id);
    formData.append('academic_year', academicYear.id);
    formData.append('override_type', overrideType);
    formData.append('amount', amount);
    formData.append('reason', reason);
    formData.append('supporting_document', file);

    try {
      await api.post('/fee-overrides/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setAmount('');
      setReason('');
      setFile(null);
      await fetchOverrides();
    } catch (err) {
      console.error('Fee override creation error:', err);
      const apiError = err.response?.data;
      const message =
        apiError?.non_field_errors?.[0] ||
        apiError?.supporting_document?.[0] ||
        apiError?.detail ||
        'Failed to create fee exception.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (overrideId) => {
    if (!window.confirm('Remove this fee exception? The student will go back to the normal fee from now on.')) return;
    try {
      await api.post(`/fee-overrides/${overrideId}/deactivate/`);
      await fetchOverrides();
    } catch (err) {
      console.error('Error deactivating fee override:', err);
      setError('Failed to remove fee exception.');
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
        className="bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <HeartHandshake className="h-5 w-5 text-primary-600" />
              Fee Exception
            </h2>
            <p className="text-sm text-gray-500">
              {student?.first_name} {student?.last_name} — Grade {student?.grade}
              {academicYear?.name ? ` — ${academicYear.name}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-6">
              <Loader className="h-6 w-6 animate-spin text-primary-600 mx-auto" />
            </div>
          ) : activeOverride ? (
            <div className="border border-green-200 bg-green-50 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-green-800 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    {OVERRIDE_TYPES.find(t => t.value === activeOverride.override_type)?.label}
                  </p>
                  <p className="text-sm text-green-700 mt-1">{activeOverride.amount} Birr</p>
                  {activeOverride.reason && (
                    <p className="text-xs text-green-600 mt-1">{activeOverride.reason}</p>
                  )}
                  <a
                    href={activeOverride.supporting_document}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-600 hover:underline mt-2 inline-block"
                  >
                    View supporting document
                  </a>
                </div>
                <button
                  onClick={() => handleDeactivate(activeOverride.id)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded flex-shrink-0"
                  title="Remove exception"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                This student already has an active exception for {academicYear?.name || 'this year'}.
                Remove it first if you need to change the amount or type.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-2">
                {OVERRIDE_TYPES.map(t => (
                  <label
                    key={t.value}
                    className={`border rounded-lg p-3 flex items-start gap-3 cursor-pointer ${
                      overrideType === t.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="override_type"
                      value={t.value}
                      checked={overrideType === t.value}
                      onChange={() => setOverrideType(t.value)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.label}</p>
                      <p className="text-xs text-gray-500">{t.help}</p>
                    </div>
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {overrideType === 'waiver' ? 'One-time amount for the year (Birr)' : 'Amount per month (Birr)'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. Family hardship — kebele letter attached"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supporting document (kebele/NGO letter) — required
                </label>
                <label className="btn-outline text-sm px-3 py-2 cursor-pointer flex items-center gap-2 w-fit">
                  {submitting ? <Loader className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {file ? file.name : 'Choose file'}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full py-2 text-sm flex items-center justify-center gap-2"
              >
                {submitting && <Loader className="h-4 w-4 animate-spin" />}
                Grant Fee Exception
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default FeeExceptionsModal;
