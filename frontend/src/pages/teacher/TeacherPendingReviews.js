// src/pages/teacher/TeacherPendingReviews.js
//
// ✅ NEW — Jimma item 4 (homeroom rollup piece). "Homeroom teachers need
// a rollup of what subject teachers recorded for their class."
//
// The backend accept/reject workflow (homeroom_pending / homeroom_accept
// / homeroom_reject on MarkViewSet) already existed and was fully
// correct — the only thing missing was a screen that actually shows a
// homeroom teacher WHAT's waiting, across every subject at once, instead
// of them having to blindly pick a subject one at a time via the old
// "Review Marks" subject-picker modal and hope something's there.
//
// This screen calls the existing homeroom_pending endpoint, groups the
// flat list of submitted marks by (subject, assessment type, term), and
// shows each group as a card with a count — tap it to jump straight into
// the gradebook, already on the right term (via the new termId deep-link
// support added to TeacherGradebook.js), ready to accept/reject.
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, RefreshCw, ListChecks, ChevronRight, CheckCircle2 } from 'lucide-react';
import { getHomeroomPending, extractError } from '../../services/teacherApi';

function TeacherPendingReviews() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const grade = params.get('grade');
  const section = params.get('section') || '';
  const academicYearId = params.get('academicYearId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groups, setGroups] = useState([]);

  const load = useCallback(async () => {
    if (!grade) return;
    setLoading(true);
    setError('');
    try {
      const response = await getHomeroomPending({ grade, section });
      const marks = response.data || [];

      // Group the flat list into one row per (subject, assessment type)
      // — that's the same granularity homeroom_accept/homeroom_reject
      // act on, so each card here maps directly onto one gradebook
      // review action.
      const bySubjectAssessment = {};
      for (const m of marks) {
        const key = `${m.subject}:${m.assessment_type}`;
        if (!bySubjectAssessment[key]) {
          bySubjectAssessment[key] = {
            subjectId: m.subject,
            subjectName: m.subject_name,
            assessmentTypeId: m.assessment_type,
            assessmentTypeName: m.assessment_type_name,
            termId: m.term_id,
            termName: m.term_name,
            count: 0,
          };
        }
        bySubjectAssessment[key].count += 1;
      }

      const groupList = Object.values(bySubjectAssessment).sort((a, b) =>
        (a.subjectName || '').localeCompare(b.subjectName || '')
      );
      setGroups(groupList);
    } catch (err) {
      setError(extractError(err, 'Failed to load pending reviews'));
    } finally {
      setLoading(false);
    }
  }, [grade, section]);

  useEffect(() => { load(); }, [load]);

  const openGroup = (group) => {
    navigate(
      `/teacher/gradebook/${group.subjectId}?grade=${grade}&section=${encodeURIComponent(section)}` +
      `&subjectName=${encodeURIComponent(group.subjectName || '')}` +
      `&academicYearId=${academicYearId || ''}` +
      `&homeroom=1` +
      (group.termId ? `&termId=${group.termId}` : '')
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-primary-700 text-white px-4 sm:px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate('/teacher/dashboard')} className="text-white/90 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="font-semibold">Pending Reviews</p>
          <p className="text-xs text-white/80">Grade {grade}{section ? ` - ${section}` : ''}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-6">
            <p className="text-red-700 text-sm">{error}</p>
            <button onClick={load} className="text-red-700 text-sm underline mt-1">Try again</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="h-8 w-8 animate-spin text-primary-600" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-gray-700 font-medium">All caught up</p>
            <p className="text-gray-500 text-sm mt-1">Nothing from any subject is waiting on your review right now.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                {groups.length} submission{groups.length !== 1 ? 's' : ''} waiting on you
              </p>
              <button onClick={load} className="text-primary-600 text-sm flex items-center gap-1">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>

            <div className="space-y-2">
              {groups.map((g, idx) => (
                <div
                  key={idx}
                  onClick={() => openGroup(g)}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between cursor-pointer hover:border-primary-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                      <ListChecks className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{g.subjectName}</p>
                      <p className="text-sm text-gray-500">
                        {g.assessmentTypeName}{g.termName ? ` · ${g.termName}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                      {g.count} student{g.count !== 1 ? 's' : ''}
                    </span>
                    <ChevronRight className="h-5 w-5 text-gray-300" />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default TeacherPendingReviews;