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
//
// ✅ Item 7 — for quarter-structure schools, a Quarter/Semester toggle
// now sits above the table. 'term' mode is unchanged (still every
// quarter side by side). 'semester' mode shows Semester 1 | Semester 2 |
// year-average instead, via GET /semester-results/class_results_semesters/.
// Semester-structure schools never see the toggle at all — this page
// looks and behaves exactly as it did before Item 7 for them.
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, RefreshCw, Trophy, Download } from 'lucide-react';
import { getClassResultsByTerms, getClassResultsBySemesters, getClassResultsBySemester, getClassResults, getSchoolInfo, downloadClassResultsExport, extractError } from '../../services/teacherApi';

function TeacherClassResults() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const grade = params.get('grade');
  const section = params.get('section') || '';
  const academicYearId = params.get('academicYearId');

  // ✅ 'term' or 'semester'. Only switchable for quarter-structure
  // schools; semester-structure schools stay on 'term' and never see
  // the toggle, exactly like before this feature existed.
  const [termStructure, setTermStructure] = useState('semester');
  const [periodType, setPeriodType] = useState('term');
  const [terms, setTerms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ✅ Single-quarter (or single-term) drill-down. '' = the overview
  // table across every term/quarter; a specific term id = a clean
  // ranked list for just that one period, using the existing single-
  // term class_results ranking (same data the "Term" school_top/award
  // screens already use — nothing new computed, just a focused view).
  const [selectedTermId, setSelectedTermId] = useState('');

  // ✅ Same drill-down, one level up: a specific Semester 1 / Semester 2
  // id = a clean ranked list for just that semester, via the
  // StudentSemesterResultViewSet.class_results endpoint (already existed
  // on the backend, ranked server-side — this was just never wired up on
  // this screen before, so "Semester" mode only ever showed the combined
  // average-of-both-semesters overview table with no way to drill into
  // one semester on its own, unlike "Quarter" mode.
  const [selectedSemesterId, setSelectedSemesterId] = useState('');

  // ✅ Downloading the overview table (Term/Semester columns + Year
  // Average + Rank) as .xlsx — same data as the on-screen overview
  // table, server-generated so it can never disagree with what's shown.
  const [downloading, setDownloading] = useState(false);

  // Fetch the school's term_structure once, so we know whether to show
  // the Quarter/Semester toggle at all.
  useEffect(() => {
    getSchoolInfo()
      .then((res) => {
        const school = Array.isArray(res.data) ? res.data[0] : res.data;
        setTermStructure(school?.term_structure || 'semester');
      })
      .catch(() => {
        // Best-effort — if this fails, we just stay on the term-only view.
      });
  }, []);

  const load = useCallback(async () => {
    if (!academicYearId) {
      setError('No academic year set for your school');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (periodType === 'semester' && selectedSemesterId) {
        // Single-semester drill-down — mirrors the single-quarter branch
        // below exactly, one level up.
        const response = await getClassResultsBySemester({ semesterId: selectedSemesterId, grade, section });
        const list = (response.data || []).slice().sort((a, b) => (a.homeroom_rank ?? 999999) - (b.homeroom_rank ?? 999999));
        setResults(list);
      } else if (periodType === 'semester') {
        const response = await getClassResultsBySemesters({ grade, section, academicYearId });
        setSemesters(response.data?.semesters || []);
        setResults(response.data?.results || []);
      } else if (selectedTermId) {
        // Single quarter/term drill-down — a plain ranked list for just
        // this one period, sorted by homeroom_rank (already sorted
        // server-side, but sort again defensively in case of ties).
        const response = await getClassResults({ termId: selectedTermId, grade, section });
        const list = (response.data || []).slice().sort((a, b) => (a.homeroom_rank ?? 999999) - (b.homeroom_rank ?? 999999));
        setResults(list);
      } else {
        const response = await getClassResultsByTerms({ grade, section, academicYearId });
        setTerms(response.data?.terms || []);
        setResults(response.data?.results || []);
      }
    } catch (err) {
      setError(extractError(err, 'Failed to load results'));
    } finally {
      setLoading(false);
    }
  }, [grade, section, academicYearId, periodType, selectedTermId, selectedSemesterId]);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await downloadClassResultsExport({ grade, section, academicYearId, periodType });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      const today = new Date().toISOString().slice(0, 10);
      link.setAttribute('download', `class_results_grade${grade}${section}_${today}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download results. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  // The term dropdown itself needs the term list even in single-term
  // mode (it's populated by the overview fetch, which we skip once a
  // specific term is selected) — so fetch it once, independently.
  useEffect(() => {
    if (!academicYearId || periodType !== 'term') return;
    getClassResultsByTerms({ grade, section, academicYearId })
      .then((response) => setTerms(response.data?.terms || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYearId, periodType]);

  // Same reasoning, one level up: the semester dropdown needs the
  // semester list even once a specific semester is selected (the
  // overview fetch that normally populates it is skipped in that case).
  useEffect(() => {
    if (!academicYearId || periodType !== 'semester') return;
    getClassResultsBySemesters({ grade, section, academicYearId })
      .then((response) => setSemesters(response.data?.semesters || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academicYearId, periodType]);

  // Switching from Semester back to Term (or vice versa) should reset
  // both drill-downs so the user lands back on the overview, not a
  // stale single-period view carried over from the other toggle state.
  useEffect(() => {
    setSelectedTermId('');
    setSelectedSemesterId('');
  }, [periodType]);

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

  // Normalize so the table below can render either view identically —
  // 'columns' is either the term list or the semester list, and each
  // result's 'periods' is that student's per-column figures.
  const columns = periodType === 'semester'
    ? semesters.map((s) => ({ id: s.id, name: s.name }))
    : terms.map((t) => ({ id: t.id, name: t.name }));

  const periodsFor = (r) =>
    periodType === 'semester'
      ? (r.semesters || []).map((s) => ({ id: s.semester_id, average: s.average }))
      : (r.terms || []).map((t) => ({ id: t.term_id, average: t.average }));

  const overallAverage = (r) => (periodType === 'semester' ? r.average_of_semesters : r.average_of_terms);

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
        <div className="flex flex-wrap items-end gap-3 mb-4">
          {termStructure === 'quarter' && (
            <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
              <button
                onClick={() => setPeriodType('term')}
                className={`px-4 py-2 text-sm font-medium ${periodType === 'term' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Quarter
              </button>
              <button
                onClick={() => setPeriodType('semester')}
                className={`px-4 py-2 text-sm font-medium border-l border-gray-300 ${periodType === 'semester' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Semester
              </button>
            </div>
          )}

          {periodType === 'term' && terms.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {termStructure === 'quarter' ? 'View a single quarter' : 'View a single term'}
              </label>
              <select
                value={selectedTermId}
                onChange={(e) => setSelectedTermId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">
                  {termStructure === 'quarter' ? 'All quarters (overview)' : 'All terms (overview)'}
                </option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {periodType === 'semester' && semesters.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">View a single semester</label>
              <select
                value={selectedSemesterId}
                onChange={(e) => setSelectedSemesterId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">All semesters (overview)</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* ✅ Download the overview table (Term/Semester columns + Year
              Average + Rank) as .xlsx — only makes sense on the overview
              view, not a single-period drill-down, since the file always
              contains every period side by side. */}
          {!selectedTermId && !selectedSemesterId && columns.length > 0 && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {downloading ? <Loader className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloading ? 'Preparing…' : 'Download Excel'}
            </button>
          )}
        </div>

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
        ) : (periodType === 'term' && selectedTermId) || (periodType === 'semester' && selectedSemesterId) ? (
          // ── Single-period drill-down: a clean, modern ranked list for
          // just this one quarter/term/semester — one figure per
          // student, not a wall of columns. Same rendering for both
          // periodType values; only the label and source list differ. ──
          results.length === 0 ? (
            <p className="text-center text-gray-500 py-16">No students in this class.</p>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-4">
                Ranked for <span className="font-medium text-gray-700">
                  {periodType === 'semester'
                    ? semesters.find((s) => String(s.id) === String(selectedSemesterId))?.name
                    : terms.find((t) => String(t.id) === String(selectedTermId))?.name}
                </span> only.
              </p>
              <div className="space-y-2">
                {results.map((r) => {
                  const medal = r.homeroom_rank === 1 ? '🥇' : r.homeroom_rank === 2 ? '🥈' : r.homeroom_rank === 3 ? '🥉' : null;
                  return (
                    <div
                      key={r.id}
                      className={`flex items-center gap-4 bg-white rounded-xl border shadow-sm px-4 py-3 transition hover:shadow-md ${
                        medal ? 'border-amber-200 bg-gradient-to-r from-amber-50/60 to-white' : 'border-gray-100'
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          medal ? 'bg-amber-100 text-amber-700' : 'bg-primary-50 text-primary-700'
                        }`}
                      >
                        {medal || rankDisplay(r).split(' ')[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{r.student_name}</p>
                        <p className="text-xs text-gray-500">{r.student_id_display}</p>
                      </div>
                      <div className="hidden sm:block w-32">
                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full bg-primary-500 rounded-full"
                            style={{ width: r.overall_average != null ? `${Math.min(100, Number(r.overall_average))}%` : '0%' }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-primary-700">{formatPct(r.overall_average)}</p>
                        {r.letter_grade && <p className="text-xs text-gray-400">{r.letter_grade}</p>}
                      </div>
                      <div className="flex-shrink-0">{passFailBadge(r)}</div>
                    </div>
                  );
                })}
              </div>

              {results.length > 0 && results.every((r) => r.overall_average == null) && (
                <p className="text-center text-gray-500 text-sm mt-4">
                  No marks have been accepted for this {periodType === 'semester' ? 'semester' : (termStructure === 'quarter' ? 'quarter' : 'term')} yet.
                </p>
              )}
            </>
          )
        ) : columns.length === 0 && !error ? (
          <p className="text-center text-gray-500 py-16">
            {periodType === 'semester'
              ? 'No semesters have been set up yet. Ask your school admin to create them in Academics Setup.'
              : 'No terms have been set up yet. Ask your school admin to create one in Academics Setup.'}
          </p>
        ) : results.length === 0 ? (
          <p className="text-center text-gray-500 py-16">No students in this class.</p>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {periodType === 'semester'
                ? 'Ranked by the average of both semesters below — not by any single semester.'
                : 'Ranked by the average of all terms below — not by any single term.'}
            </p>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-primary-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Rank</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Student</th>
                    {columns.map((c) => (
                      <th key={c.id} className="px-3 py-3 font-semibold text-gray-700 text-center whitespace-nowrap">
                        {c.name}
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
                      {periodsFor(r).map((p) => (
                        <td key={p.id} className="px-3 py-3 text-center text-gray-700">
                          {formatPct(p.average)}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center font-semibold text-primary-700">
                        {formatPct(overallAverage(r))}
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

            {results.length > 0 && results.every((r) => overallAverage(r) == null) && (
              <p className="text-center text-gray-500 text-sm mt-4">
                {periodType === 'semester'
                  ? 'No marks have been accepted for either semester yet — results will appear here once quarters are graded and accepted.'
                  : 'No marks have been accepted for any term yet — results will appear here as you accept them in the gradebook.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default TeacherClassResults;
