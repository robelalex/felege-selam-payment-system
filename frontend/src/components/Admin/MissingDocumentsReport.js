// frontend/src/components/Admin/MissingDocumentsReport.js
// ✅ NEW: "who still hasn't submitted their documents" report — filterable
// by grade and section, so the admin can see gaps at a glance and act
// (open a student's Documents panel directly, or select several and send
// a bulk document request). Talks to the read-only
// GET /students/missing_documents/ report endpoint; never modifies data
// itself except through the existing bulk-request flow it reuses.
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Loader, AlertTriangle, CheckCircle, Camera, FileText, Users, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import BulkDocumentRequestModal from './BulkDocumentRequestModal';

const MissingDocumentsReport = ({ academicYear, onClose, onOpenStudentDocuments }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [grade, setGrade] = useState('all');
  const [section, setSection] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkRequest, setShowBulkRequest] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (academicYear?.id) params.append('academic_year_id', academicYear.id);
      const url = `/students/missing_documents/?${params.toString()}`;
      const res = await api.get(url);
      setData(res.data);
    } catch (err) {
      console.error('Error fetching missing documents report:', err);
      setError('Failed to load the report. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [academicYear]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    setSection('all');
  }, [grade]);

  const allStudents = data?.students || [];

  const availableSections = Array.from(new Set(
    allStudents
      .filter((s) => grade === 'all' || s.grade === parseInt(grade))
      .map((s) => s.section)
      .filter((sec) => !!sec)
  )).sort();

  const filtered = allStudents.filter((s) => {
    const matchesGrade = grade === 'all' || s.grade === parseInt(grade);
    const matchesSection = section === 'all' || (s.section || '') === section;
    return matchesGrade && matchesSection;
  });

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) return new Set();
      const next = new Set(prev);
      filtered.forEach((s) => next.add(s.id));
      return next;
    });
  };
  const selectedStudents = filtered.filter((s) => selectedIds.has(s.id));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Students Missing Documents
            </h2>
            <p className="text-sm text-gray-500">
              {academicYear?.name ? `${academicYear.name} — ` : ''}
              {data ? `${data.total_incomplete} of ${data.total_checked} student(s) have something outstanding` : 'Loading...'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchReport} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
              <RefreshCw className="h-4 w-4 text-gray-500" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm text-red-700">{error}</div>
          )}

          {/* Filters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="input-field text-sm"
            >
              <option value="all">All Grades</option>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map((g) => (
                <option key={g} value={g}>Grade {g}</option>
              ))}
            </select>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="input-field text-sm"
              disabled={availableSections.length === 0}
            >
              <option value="all">All Sections</option>
              {availableSections.map((sec) => (
                <option key={sec} value={sec}>Section {sec}</option>
              ))}
            </select>
            <button
              onClick={() => setShowBulkRequest(true)}
              disabled={selectedIds.size === 0}
              className="btn-outline flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileText className="h-4 w-4" />
              Request Document{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <Loader className="h-6 w-6 animate-spin text-primary-600 mx-auto" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-green-700 flex flex-col items-center gap-2">
              <CheckCircle className="h-8 w-8" />
              <p className="text-sm">Nothing outstanding for this filter — everyone's complete.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-2 pl-1 pr-2 w-8">
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} />
                    </th>
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 pr-3">Grade / Section</th>
                    <th className="py-2 pr-3">Missing</th>
                    <th className="py-2 pr-3">Parent Contact</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100 align-top">
                      <td className="py-2 pl-1 pr-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.id)}
                          onChange={() => toggleSelected(s.id)}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-gray-900">{s.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{s.student_id}</p>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        Grade {s.grade}{s.section ? ` - ${s.section}` : ''}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {s.missing_photo && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              <Camera className="h-3 w-3" /> Photo
                            </span>
                          )}
                          {s.missing_documents.map((label, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              <FileText className="h-3 w-3" /> {label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{s.parent_phone}</td>
                      <td className="py-2 pr-3">
                        <button
                          onClick={() => onOpenStudentDocuments && onOpenStudentDocuments(s)}
                          className="text-xs text-primary-600 hover:underline whitespace-nowrap"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>

      {showBulkRequest && (
        <BulkDocumentRequestModal
          students={selectedStudents}
          onClose={() => setShowBulkRequest(false)}
          onDone={() => {
            setSelectedIds(new Set());
            fetchReport();
          }}
        />
      )}
    </motion.div>
  );
};

export default MissingDocumentsReport;
