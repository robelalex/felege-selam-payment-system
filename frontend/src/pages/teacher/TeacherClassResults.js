// src/pages/teacher/TeacherClassResults.js
//
// Phase 4 — read-only ranked results for a homeroom class. Same page
// shape as TeacherGradebook.js (header, term selector, table) so it
// feels like part of the same portal rather than a bolted-on screen.
//
// Only shows results for students the calculation service has already
// computed (i.e. at least one subject has had marks accepted by this
// homeroom for the selected term) — students with nothing accepted yet
// show as "Not yet available" instead of a blank/misleading 0%.
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, RefreshCw, Trophy } from 'lucide-react';
import { getTerms, getClassResults, extractError } from '../../services/teacherApi';

function TeacherClassResults() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const grade = params.get('grade');
  const section = params.get('section') || '';
  const academicYearId = params.get('academicYearId');

  const [terms, setTerms] = useState([]);
  const [selectedTermId, setSelectedTermId] = useState(null);
  const [loadingTerms, setLoadingTerms] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);

  const loadResults = useCallback(async (termId) => {
    if (!termId) return;
    setLoadingResults(true);
    setError('');
    try {
      const response = await getClassResults({ termId, grade, section });
      setResults(response.data || []);
    } catch (err) {
      setError(extractError(err, 'Failed to load results'));
    } finally {
      setLoadingResults(false);
    }
  }, [grade, section]);

  useEffect(() => {
    const loadTerms = async () => {
      if (!academicYearId) {
        setError('No academic year set for your school');
        setLoadingTerms(false);
        return;
      }
      setLoadingTerms(true);
      setError('');
      try {
        const response = await getTerms(academicYearId);
        const list = response.data || [];
        setTerms(list);
        if (list.length > 0) {
          setSelectedTermId(list[0].id);
          await loadResults(list[0].id);
        }
      } catch (err) {
        setError(extractError(err, 'Failed to load terms'));
      } finally {
        setLoadingTerms(false);
      }
    };
    loadTerms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYearId]);

  const formatAverage = (r) => (r.overall_average != null ? `${Number(r.overall_average).toFixed(1)}%` : '—');

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
          Class Results — Grade {grade}{section ? ` ${section}` : ''}
        </span>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {loadingTerms ? (
          <div className="flex justify-center py-16"><Loader className="h-8 w-8 animate-spin text-primary-600" /></div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
              <select
                className="input-field"
                value={selectedTermId || ''}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setSelectedTermId(id);
                  loadResults(id);
                }}
              >
                {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-4 flex items-center justify-between">
                <p className="text-red-700 text-sm">{error}</p>
                <button onClick={() => loadResults(selectedTermId)} className="text-red-700 text-sm flex items-center gap-1">
                  <RefreshCw className="h-4 w-4" /> Retry
                </button>
              </div>
            )}

            {terms.length === 0 ? (
              <p className="text-center text-gray-500 py-16">
                No terms have been set up yet. Ask your school admin to create one in Academics Setup.
              </p>
            ) : loadingResults ? (
              <div className="flex justify-center py-16"><Loader className="h-8 w-8 animate-spin text-primary-600" /></div>
            ) : results.length === 0 ? (
              <p className="text-center text-gray-500 py-16">No students in this class.</p>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-primary-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Rank</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Student</th>
                      <th className="px-3 py-3 font-semibold text-gray-700 text-center">Average</th>
                      {results.some((r) => r.letter_grade) && (
                        <th className="px-3 py-3 font-semibold text-gray-700 text-center">Grade</th>
                      )}
                      <th className="px-3 py-3 font-semibold text-gray-700 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 font-semibold text-gray-900">{rankDisplay(r)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{r.student_name}</p>
                          <p className="text-xs text-gray-500">{r.student_id_display}</p>
                        </td>
                        <td className="px-3 py-3 text-center font-semibold">{formatAverage(r)}</td>
                        {results.some((res) => res.letter_grade) && (
                          <td className="px-3 py-3 text-center">{r.letter_grade || '—'}</td>
                        )}
                        <td className="px-3 py-3 text-center">{passFailBadge(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {results.length > 0 && results.every((r) => r.overall_average == null) && (
              <p className="text-center text-gray-500 text-sm mt-4">
                No marks have been accepted for this term yet — results will appear here as you accept them in the gradebook.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default TeacherClassResults;
