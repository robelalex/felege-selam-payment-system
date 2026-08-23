// src/pages/teacher/TeacherAttendance.js
// Homeroom daily attendance — "was this student in school today at all".
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, ListChecks, BarChart3 } from 'lucide-react';
import { getAttendanceRoster, saveAttendance, getAttendanceSummaryRecords, extractError } from '../../services/teacherApi';

const STATUS_OPTIONS = ['present', 'absent', 'late', 'excused'];
const STATUS_STYLE = {
  present: { bg: '#dcfce7', border: '#86efac', text: '#15803d' },
  absent: { bg: '#fee2e2', border: '#fca5a5', text: '#b91c1c' },
  late: { bg: '#ffedd5', border: '#fdba74', text: '#c2410c' },
  excused: { bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' },
};
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function TeacherAttendance() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const grade = params.get('grade');
  const section = params.get('section') || '';

  // ✅ NEW — "Take Attendance" (existing, day-by-day entry) vs "Summary"
  // (new: how many days present/absent/late/excused over a range). This
  // was the actual gap reported: attendance could only ever be entered,
  // never counted — a homeroom teacher had no way to answer "how many
  // days has this student actually been present this month" without
  // manually re-opening every single day.
  const [view, setView] = useState('entry');

  const [date, setDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [students, setStudents] = useState([]);
  const [statuses, setStatuses] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getAttendanceRoster({ grade, section, date });
      const studs = response.data.students || [];
      const next = {};
      for (const s of studs) next[s.student_id] = s.status;
      setStudents(studs);
      setStatuses(next);
    } catch (err) {
      setError(extractError(err, 'Failed to load attendance'));
    } finally {
      setLoading(false);
    }
  }, [grade, section, date]);

  useEffect(() => { if (view === 'entry') load(); }, [load, view]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const entries = students.map((s) => ({ student_id: s.student_id, status: statuses[s.student_id] || 'present' }));
      await saveAttendance({ grade, section, date, entries });
    } catch (err) {
      setError(extractError(err, 'Failed to save attendance'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-primary-700 text-white px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></button>
          <span className="font-semibold">Grade {grade} - {section}</span>
        </div>
        {view === 'entry' && (
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm rounded-md px-2 py-1 text-gray-900"
          />
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex bg-white rounded-lg border border-gray-200 p-1 mb-4 w-fit">
          <button
            onClick={() => setView('entry')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md ${view === 'entry' ? 'bg-primary-600 text-white' : 'text-gray-500'}`}
          >
            <ListChecks className="h-3.5 w-3.5" /> Take Attendance
          </button>
          <button
            onClick={() => setView('summary')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md ${view === 'summary' ? 'bg-primary-600 text-white' : 'text-gray-500'}`}
          >
            <BarChart3 className="h-3.5 w-3.5" /> Summary
          </button>
        </div>

        {view === 'summary' ? (
          <AttendanceSummaryPanel grade={grade} section={section} />
        ) : (
          <>
            <div className="bg-primary-50 text-primary-900 font-medium rounded-lg px-4 py-2 mb-4">
              {new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-4">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-16"><Loader className="h-8 w-8 animate-spin text-primary-600" /></div>
            ) : (
              <div className="space-y-2 mb-6">
                {students.map((s) => {
                  const current = statuses[s.student_id] || 'present';
                  return (
                    <div key={s.student_id} className="bg-white rounded-lg border border-gray-100 shadow-sm p-3">
                      <p className="font-medium text-gray-900 mb-2">{s.student_name}</p>
                      <div className="flex flex-wrap gap-2">
                        {STATUS_OPTIONS.map((status) => {
                          const selected = current === status;
                          const c = STATUS_STYLE[status];
                          return (
                            <button
                              key={status}
                              onClick={() => setStatuses((prev) => ({ ...prev, [s.student_id]: status }))}
                              className="text-xs px-3 py-1.5 rounded-full border capitalize"
                              style={selected
                                ? { backgroundColor: c.bg, borderColor: c.border, color: c.text }
                                : { backgroundColor: '#f9fafb', borderColor: '#e5e7eb', color: '#4b5563' }}
                            >
                              {status}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {students.length > 0 && (
              <button disabled={saving} onClick={handleSave} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
                {saving && <Loader className="h-4 w-4 animate-spin" />} Save
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ✅ NEW — per-student present/absent/late/excused counts + attendance
// rate over a date range, for this one homeroom class. Same aggregation
// approach as AdminAttendance.js (fetch the flat day-by-day list, group
// client-side) rather than a new backend endpoint, since the existing
// list endpoint already supports every filter needed.
function AttendanceSummaryPanel({ grade, section }) {
  const [dateFrom, setDateFrom] = useState(daysAgoStr(30));
  const [dateTo, setDateTo] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState([]);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getAttendanceSummaryRecords({ grade, section, dateFrom, dateTo });
      const records = response.data?.results || response.data || [];

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
        return { ...s, total, rate: total > 0 ? Math.round(((s.present + s.late) / total) * 100) : null };
      }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      setSummary(rows);
    } catch (err) {
      setError(extractError(err, 'Failed to load attendance summary'));
      setSummary([]);
    } finally {
      setLoading(false);
    }
  }, [grade, section, dateFrom, dateTo]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} className="input-field w-auto text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={dateTo} max={todayStr()} onChange={(e) => setDateTo(e.target.value)} className="input-field w-auto text-sm" />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600 text-center py-8">{error}</p>
      ) : loading ? (
        <div className="flex justify-center py-12"><Loader className="h-6 w-6 animate-spin text-primary-600" /></div>
      ) : summary.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">No attendance recorded for this range yet.</p>
      ) : (
        <div className="space-y-2">
          {summary.map((row) => (
            <div key={row.studentId} className="bg-white rounded-lg border border-gray-100 shadow-sm p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-gray-900">{row.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{row.studentIdDisplay}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary-700">{row.rate != null ? `${row.rate}%` : '—'}</p>
                  <p className="text-[10px] text-gray-400">attendance rate</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-green-50 rounded-md py-1.5"><p className="font-semibold text-green-700">{row.present}</p><p className="text-gray-500">Present</p></div>
                <div className="bg-red-50 rounded-md py-1.5"><p className="font-semibold text-red-700">{row.absent}</p><p className="text-gray-500">Absent</p></div>
                <div className="bg-amber-50 rounded-md py-1.5"><p className="font-semibold text-amber-700">{row.late}</p><p className="text-gray-500">Late</p></div>
                <div className="bg-blue-50 rounded-md py-1.5"><p className="font-semibold text-blue-700">{row.excused}</p><p className="text-gray-500">Excused</p></div>
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-500 pt-1">{summary.length} student(s) with recorded attendance in this range.</p>
        </div>
      )}
    </div>
  );
}

export default TeacherAttendance;