// src/pages/teacher/TeacherAttendance.js
// Homeroom daily attendance — "was this student in school today at all".
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader } from 'lucide-react';
import { getAttendanceRoster, saveAttendance, extractError } from '../../services/teacherApi';

const STATUS_OPTIONS = ['present', 'absent', 'late', 'excused'];
const STATUS_STYLE = {
  present: { bg: '#dcfce7', border: '#86efac', text: '#15803d' },
  absent: { bg: '#fee2e2', border: '#fca5a5', text: '#b91c1c' },
  late: { bg: '#ffedd5', border: '#fdba74', text: '#c2410c' },
  excused: { bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' },
};
const todayStr = () => new Date().toISOString().slice(0, 10);

function TeacherAttendance() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const grade = params.get('grade');
  const section = params.get('section') || '';

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
      if (response.data.success) {
        const studs = response.data.students || [];
        const next = {};
        for (const s of studs) next[s.student_id] = s.status;
        setStudents(studs);
        setStatuses(next);
      } else {
        setError(response.data.error || 'Failed to load attendance');
      }
    } catch (err) {
      setError(extractError(err, 'Failed to load attendance'));
    } finally {
      setLoading(false);
    }
  }, [grade, section, date]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const entries = students.map((s) => ({ student_id: s.student_id, status: statuses[s.student_id] || 'present' }));
      const response = await saveAttendance({ grade, section, date, entries });
      if (!response.data.success) setError(response.data.error || 'Failed to save attendance');
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
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className="text-sm rounded-md px-2 py-1 text-gray-900"
        />
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
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
      </div>
    </div>
  );
}

export default TeacherAttendance;
