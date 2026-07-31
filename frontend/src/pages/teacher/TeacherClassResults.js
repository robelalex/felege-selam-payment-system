// src/pages/teacher/TeacherClassResults.js
//
// Homeroom "Check Result and Award" screen.
//
// Previously this only showed ONE selected term at a time. It was also
// unreachable — no route existed for it in App.js, so clicking the
// button on the dashboard navigated to a URL that matched nothing and
// showed a blank page. Both are fixed now:
//   1. App.js now has a real route for this page (see App.js).
//   2. This page now shows every term side by side (Term 1, Term 2, ...)
//      plus the average-of-terms figure and the rank based on THAT
//      average — not any single term's percentage — using the same
//      cumulative calculation Phase 6 already built for report cards
//      (report_cards/services/cumulative_service.py), reused here via
//      GET /results/class_results_terms/.
//
// A student with nothing accepted yet for a given term shows "—" for
// that term instead of a misleading 0%, same convention as before.
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, RefreshCw, Trophy } from 'lucide-react';
import { getClassResultsByTerms, extractError } from '../../services/teacherApi';

function TeacherClassResults() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const grade = params.get('grade');
  const section = params.get('section') || '';
  const academicYearId = params.get('academicYearId');

  const [terms, setTerms] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!academicYearId) {
      setError('No academic year set for your school');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await getClassResultsByTerms({ grade, section, academicYearId });
      setTerms(response.data?.terms || []);
      setResults(response.data?.results || []);
    } catch (err) {
      setError(extractError(err, 'Failed to load results'));
    } finally {
      setLoading(false);
    }
  }, [grade, section, academicYearId]);

  useEffect(() => { load(); }, [load]);

  const formatPct = (v) => (v != null ? `${Number(v).toFixed(1)}%` : '—');

  const passFailBadge = (r) => {
    if (r.is_passing == null) {
      return <span className="text-xs text-gray-400">Not yet available</span>;
    }
    return r.is_passing ? (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Pass</span>
    ) : (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Fail</span>
    );
  };

  const rankDisplay = (r) => {
    if (r.homeroom_rank == null) return '—';
    return r.homeroom_rank_total ? `${r.homeroom_rank} / ${r.homeroom_rank_total}` : `${r.homeroom_rank}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-primary-700 text-white px-4 sm:px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></button>
        <Trophy className="h-5 w-5" />
        <span className="font-semibold truncate">
          Check Result and Award — Grade {grade}{section ? ` ${section}` : ''}
        </span>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-4 flex items-center justify-between">
            <p className="text-red-700 text-sm">{error}</p>
            <button onClick={load} className="text-red-700 text-sm flex items-center gap-1">
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><Loader className="h-8 w-8 animate-spin text-primary-600" /></div>
        ) : terms.length === 0 && !error ? (
          <p className="text-center text-gray-500 py-16">
            No terms have been set up yet. Ask your school admin to create one in Academics Setup.
          </p>
        ) : results.length === 0 ? (
          <p className="text-center text-gray-500 py-16">No students in this class.</p>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Ranked by the average of all terms below — not by any single term.
            </p>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-primary-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Rank</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Student</th>
                    {terms.map((t) => (
                      <th key={t.id} className="px-3 py-3 font-semibold text-gray-700 text-center whitespace-nowrap">
                        {t.name}
                      </th>
                    ))}
                    <th className="px-3 py-3 font-semibold text-gray-700 text-center whitespace-nowrap">
                      Average
                    </th>
                    {results.some((r) => r.letter_grade) && (
                      <th className="px-3 py-3 font-semibold text-gray-700 text-center">Grade</th>
                    )}
                    <th className="px-3 py-3 font-semibold text-gray-700 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.student_id} className="border-t border-gray-100">
                      <td className="px-4 py-3 font-semibold text-gray-900">{rankDisplay(r)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{r.student_name}</p>
                        <p className="text-xs text-gray-500">{r.student_id_display}</p>
                      </td>
                      {r.terms.map((t) => (
                        <td key={t.term_id} className="px-3 py-3 text-center text-gray-700">
                          {formatPct(t.average)}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center font-semibold text-primary-700">
                        {formatPct(r.average_of_terms)}
                      </td>
                      {results.some((res) => res.letter_grade) && (
                        <td className="px-3 py-3 text-center">{r.letter_grade || '—'}</td>
                      )}
                      <td className="px-3 py-3 text-center">{passFailBadge(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {results.length > 0 && results.every((r) => r.average_of_terms == null) && (
              <p className="text-center text-gray-500 text-sm mt-4">
                No marks have been accepted for any term yet — results will appear here as you accept them in the gradebook.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default TeacherClassResults;
