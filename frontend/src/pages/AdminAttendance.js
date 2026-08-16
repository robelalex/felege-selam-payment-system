// src/pages/AdminAttendance.js
//
// ✅ NEW — Jimma item 4 (admin attendance lookup piece). The original
// bug report was "clicking 'view attendance' (single student or bulk)
// doesn't show anything." After reading every frontend file, the actual
// finding was: no such screen existed at all in the admin app — only
// teacher entry screens (roster + bulk_save) were ever built. This page
// is the real fix: a bulk class-wide summary (grade/section + date
// range), with a per-student drill-down for the single-student case,
// both on one screen.
//
// Bulk data: uses the existing GET /attendance/ list endpoint
// (DailyAttendanceViewSet) with its existing grade/section/date_from/
// date_to filters — no new backend endpoint needed, aggregated
// client-side into a per-student summary.
//
// Single-student drill-down: reuses GET /students/{id}/child_record/,
// the same endpoint the parent portal uses — staff at the student's
// school already have read access to it (IsSameSchoolOrOwnParent), so
// no new backend permission work was needed there either.
import React, { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Loader, RefreshCw, X, Star } from 'lucide-react';
import api from '../services/api';
import { useYear } from '../context/YearContext';

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function AdminAttendance() {
  const { selectedYear } = useYear();

  const [allSections, setAllSections] = useState([]);
  const [grade, setGrade] = useState('');
  const [section, setSection] = useState('all');
  const [dateFrom, setDateFrom] = useState(daysAgoIso(30));
  const [dateTo, setDateTo] = useState(todayIso());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState([]);

  const [modalStudentId, setModalStudentId] = useState(null);
  const [modalStudentName, setModalStudentName] = useState('');

  useEffect(() => {
    api.get('/sections/').then((res) => setAllSections(res.data || [])).catch(() => {});
  }, []);

  const sectionOptionsForGrade = grade
    ? allSections.filter((s) => String(s.grade) === String(grade))
    : [];

  const fetchSummary = useCallback(async () => {
    if (!grade) return;
    setLoading(true);
    setError('');
    try {
      const params = { grade, date_from: dateFrom, date_to: dateTo };
      if (section !== 'all') params.section = section;
      if (selectedYear?.id) params.academic_year_id = selectedYear.id;

      const response = await api.get('/attendance/', { params });
      const records = response.data?.results || response.data || [];

      // Aggregate the flat day-by-day list into one row per student.
      const byStudent = {};
      for (const r of records) {
        if (!byStudent[r.student]) {
          byStudent[r.student] = {
            studentId: r.student,
            name: r.student_name,
            studentIdDisplay: r.student_id_display,
            present: 0, absent: 0, late: 0, excused: 0,
          };
        }
        if (byStudent[r.student][r.status] != null) byStudent[r.student][r.status] += 1;
      }

      const rows = Object.values(byStudent).map((s) => {
        const total = s.present + s.absent + s.late + s.excused;
        return {
          ...s,
          total,
          rate: total > 0 ? Math.round(((s.present + s.late) / total) * 100) : null,
        };
      }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      setSummary(rows);
    } catch (err) {
      console.error('Error fetching attendance summary:', err);
      setError('Failed to load attendance. Please try again.');
      setSummary([]);
    } finally {
      setLoading(false);
    }
  }, [grade, section, dateFrom, dateTo, selectedYear]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const openStudent = (row) => {
    setModalStudentId(row.studentId);
    setModalStudentName(row.name);
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-6 w-6 text-primary-600" />
        <h1 className="text-xl font-bold text-gray-900">Attendance</h1>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex flex-wrap gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Grade</label>
            <select
              value={grade}
              onChange={(e) => { setGrade(e.target.value); setSection('all'); }}
              className="input-field w-auto"
            >
              <option value="">Select a grade...</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>Grade {g}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Section</label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="input-field w-auto"
              disabled={!grade}
            >
              <option value="all">All Sections</option>
              {sectionOptionsForGrade.map((s) => (
                <option key={s.id} value={s.name}>Section {s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field w-auto" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field w-auto" />
          </div>
        </div>

        {!grade ? (
          <p className="text-sm text-gray-500 py-8 text-center">Select a grade to see attendance for that class.</p>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm text-red-600 mb-2">{error}</p>
            <button onClick={fetchSummary} className="text-primary-600 text-sm flex items-center gap-1 mx-auto">
              <RefreshCw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="h-6 w-6 animate-spin text-primary-600" />
          </div>
        ) : summary.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">No attendance recorded for this filter yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3">Student</th>
                  <th className="py-2 pr-3 text-center">Present</th>
                  <th className="py-2 pr-3 text-center">Absent</th>
                  <th className="py-2 pr-3 text-center">Late</th>
                  <th className="py-2 pr-3 text-center">Excused</th>
                  <th className="py-2 pr-3 text-center">Rate</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.studentId} className="border-b border-gray-100">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-gray-900">{row.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{row.studentIdDisplay}</p>
                    </td>
                    <td className="py-2 pr-3 text-center text-green-700">{row.present}</td>
                    <td className="py-2 pr-3 text-center text-red-700">{row.absent}</td>
                    <td className="py-2 pr-3 text-center text-amber-700">{row.late}</td>
                    <td className="py-2 pr-3 text-center text-slate-600">{row.excused}</td>
                    <td className="py-2 pr-3 text-center font-semibold">
                      {row.rate != null ? `${row.rate}%` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <button
                        onClick={() => openStudent(row)}
                        className="text-primary-600 text-xs font-medium hover:underline"
                      >
                        View Full Record
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500 mt-3">{summary.length} student(s) with recorded attendance in this range.</p>
          </div>
        )}
      </div>

      {modalStudentId && (
        <AdminStudentRecordModal
          studentId={modalStudentId}
          studentName={modalStudentName}
          onClose={() => setModalStudentId(null)}
        />
      )}
    </div>
  );
}

// ✅ Single-student drill-down modal — handles both the "single student"
// half of the original bug report and doubles as the target of "View
// Full Record" from the bulk table above. Deliberately compact (not a
// full copy of ParentDashboard's Attendance & Marks card) since an admin
// glancing at one student mid-review needs less than a parent does.
function AdminStudentRecordModal({ studentId, studentName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('attendance');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get(`/students/${studentId}/child_record/`)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setError('Failed to load this student\'s record.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [studentId]);

  const daily = data?.attendance?.daily || { summary: {}, records: [] };
  const terms = data?.marks?.terms || [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white">
          <p className="font-semibold text-gray-900">{studentName}</p>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="h-6 w-6 animate-spin text-primary-600" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 text-center py-12">{error}</p>
        ) : (
          <div className="p-4">
            <div className="flex bg-gray-100 rounded-lg p-1 mb-4 w-fit">
              <button
                onClick={() => setTab('attendance')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md ${tab === 'attendance' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}
              >
                Attendance
              </button>
              <button
                onClick={() => setTab('marks')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md ${tab === 'marks' ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500'}`}
              >
                Marks
              </button>
            </div>

            {tab === 'attendance' ? (
              (daily.records || []).length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">No attendance recorded yet.</p>
              ) : (
                <div>
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    <div className="bg-primary-50 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-primary-700">
                        {daily.summary?.attendance_rate != null ? `${daily.summary.attendance_rate}%` : '—'}
                      </p>
                      <p className="text-[10px] text-gray-500">Rate</p>
                    </div>
                    {['present', 'absent', 'late', 'excused'].map((s) => (
                      <div key={s} className="bg-gray-50 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-gray-700">{daily.summary?.[s] ?? 0}</p>
                        <p className="text-[10px] text-gray-500 capitalize">{s}</p>
                      </div>
                    ))}
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                    {daily.records.slice(0, 30).map((r, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="text-gray-600">{r.date}</span>
                        <span className="text-gray-500">{r.status_display}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : terms.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">No marks finalized yet.</p>
            ) : (
              <div className="space-y-4">
                {terms.map((t, i) => (
                  <div key={i}>
                    <p className="text-sm font-semibold text-gray-700 flex items-center gap-1 mb-1">
                      <Star className="h-3.5 w-3.5 text-primary-500" /> {t.term}
                    </p>
                    {(t.marks || []).map((m, j) => (
                      <div key={j} className="flex items-center justify-between py-1 text-sm">
                        <span className="text-gray-600">{m.subject} — {m.assessment_type}</span>
                        <span className="font-medium text-gray-800">
                          {m.score != null ? `${m.score} / ${m.max_score}` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminAttendance;