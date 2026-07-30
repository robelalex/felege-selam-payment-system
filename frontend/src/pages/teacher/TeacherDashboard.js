// src/pages/teacher/TeacherDashboard.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, BookOpen, ClipboardCheck, ListChecks, Trophy, LogOut, ChevronRight, Loader, X } from 'lucide-react';
import { getMyAssignments, getClassAssignments, clearTeacherSession, extractError } from '../../services/teacherApi';

function TeacherDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [subjectPicker, setSubjectPicker] = useState(null); // { subjects, grade, section }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getMyAssignments();
      setData(response.data);
    } catch (err) {
      setError(extractError(err, 'Failed to load your classes'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearTeacherSession();
    navigate('/teacher-login');
  };

  const pickSubjectForReview = async (grade, section) => {
    try {
      const response = await getClassAssignments(grade);
      const all = response.data || [];
      const relevant = all.filter((a) => !a.section || a.section === section);
      const seen = new Set();
      const subjects = [];
      for (const a of relevant) {
        if (!seen.has(a.subject)) {
          seen.add(a.subject);
          subjects.push({ id: a.subject, name: a.subject_name || 'Subject' });
        }
      }
      if (subjects.length === 0) {
        alert('No subjects are assigned to this class yet.');
        return;
      }
      setSubjectPicker({ subjects, grade, section });
    } catch (err) {
      alert(extractError(err, 'Failed to load subjects'));
    }
  };

  const openGradebook = (subjectId, subjectName, grade, section, isHomeroomView) => {
    navigate(
      `/teacher/gradebook/${subjectId}?grade=${grade}&section=${encodeURIComponent(section)}` +
      `&subjectName=${encodeURIComponent(subjectName)}` +
      `&academicYearId=${data?.current_academic_year_id || ''}` +
      `&homeroom=${isHomeroomView ? '1' : '0'}`
    );
  };

  const openResults = (grade, section) => {
    navigate(
      `/teacher/results?grade=${grade}&section=${encodeURIComponent(section)}` +
      `&academicYearId=${data?.current_academic_year_id || ''}`
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const homeroom = data?.homeroom;
  const subjectAssignments = data?.subject_assignments || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-primary-700 text-white px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Home className="h-5 w-5" />
          <span className="font-semibold">Teacher Portal</span>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-white/90 hover:text-white">
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {data?.teacher_name && (
          <h1 className="text-xl font-bold text-gray-900 mb-6">{data.teacher_name}</h1>
        )}

        {homeroom && (
          <>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Homeroom</p>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Home className="h-5 w-5 text-primary-600" />
                <span className="text-lg font-bold text-gray-900">
                  Grade {homeroom.grade} - {homeroom.section}
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate(`/teacher/attendance?grade=${homeroom.grade}&section=${encodeURIComponent(homeroom.section)}`)}
                  className="flex-1 btn-secondary flex items-center justify-center gap-2 py-2.5"
                >
                  <ClipboardCheck className="h-4 w-4" /> Take Attendance
                </button>
                <button
                  onClick={() => pickSubjectForReview(homeroom.grade, homeroom.section)}
                  className="flex-1 btn-secondary flex items-center justify-center gap-2 py-2.5"
                >
                  <ListChecks className="h-4 w-4" /> Review Marks
                </button>
              </div>
              <button
                onClick={() => openResults(homeroom.grade, homeroom.section)}
                className="w-full mt-3 btn-secondary flex items-center justify-center gap-2 py-2.5"
              >
                <Trophy className="h-4 w-4" /> Class Results & Ranking
              </button>
            </div>
          </>
        )}

        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Subjects</p>
        {subjectAssignments.length === 0 && !homeroom && (
          <p className="text-gray-500 text-sm py-6 text-center">No classes have been assigned to you yet.</p>
        )}
        <div className="space-y-2">
          {subjectAssignments.map((a, idx) => (
            <div
              key={idx}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between cursor-pointer hover:border-primary-200"
              onClick={() => openGradebook(a.subject_id, a.subject__name || '', a.grade, a.section || '', false)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-50 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{a.subject__name}</p>
                  <p className="text-sm text-gray-500">
                    Grade {a.grade}{a.section ? ` - ${a.section}` : ' (all sections)'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/teacher/subject-attendance/${a.subject_id}?grade=${a.grade}&section=${encodeURIComponent(a.section || '')}&subjectName=${encodeURIComponent(a.subject__name || '')}`);
                  }}
                  title="Take attendance"
                  className="p-2 text-gray-400 hover:text-primary-600"
                >
                  <ClipboardCheck className="h-5 w-5" />
                </button>
                <ChevronRight className="h-5 w-5 text-gray-300" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {subjectPicker && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50" onClick={() => setSubjectPicker(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-gray-900">Choose a subject to review</p>
              <button onClick={() => setSubjectPicker(null)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="space-y-1">
              {subjectPicker.subjects.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    openGradebook(s.id, s.name, subjectPicker.grade, subjectPicker.section, true);
                    setSubjectPicker(null);
                  }}
                  className="w-full text-left flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50"
                >
                  <BookOpen className="h-5 w-5 text-primary-600" />
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeacherDashboard;