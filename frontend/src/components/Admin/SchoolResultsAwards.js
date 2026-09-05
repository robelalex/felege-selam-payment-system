// frontend/src/components/Admin/SchoolResultsAwards.js
//
// Phase 4 — the last piece originally scoped for Phase 4: school-wide
// ranking, split elementary vs high school, top 3 identified for awards.
// Read-only screen — same GET /api/results/school_top/ endpoint that's
// been sitting unused since we built the backend for it.
import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, Loader, AlertTriangle, Medal, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import { pickCurrentSchool } from '../../utils/currentSchool';
import { useYear } from '../../context/YearContext';
import { useAuth } from '../../context/AuthContext';

function SchoolResultsAwards() {
  const { selectedYear } = useYear();
  const { getAuthHeader } = useAuth();

  const [terms, setTerms] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [termStructure, setTermStructure] = useState('semester');
  // ✅ Item 7 — 'term' or 'semester'. Only relevant/switchable for
  // quarter-structure schools; semester-structure schools never see the
  // toggle and stay on 'term' exactly like before.
  const [periodType, setPeriodType] = useState('term');
  const [selectedTermId, setSelectedTermId] = useState(null);
  const [selectedSemesterId, setSelectedSemesterId] = useState(null);
  const [band, setBand] = useState('elementary');
  const [limit, setLimit] = useState(3);
  const [results, setResults] = useState([]);
  const [loadingTerms, setLoadingTerms] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadTerms = async () => {
      if (!selectedYear?.id) {
        setLoadingTerms(false);
        return;
      }
      setLoadingTerms(true);
      setError('');
      try {
        const [termRes, semRes, schoolRes] = await Promise.all([
          api.get(`/terms/?academic_year_id=${selectedYear.id}`, { headers: getAuthHeader() }),
          api.get(`/semesters/?academic_year_id=${selectedYear.id}`, { headers: getAuthHeader() }).catch(() => ({ data: [] })),
          api.get('/schools/', { headers: getAuthHeader() }).catch(() => ({ data: null })),
        ]);
        const list = termRes.data || [];
        setTerms(list);
        // Default to the school's own "final term" (highest order) — same
        // rule Promote and the results-in-that-modal already use, so the
        // default shown here matches what an admin already saw there.
        if (list.length > 0) {
          const finalTerm = [...list].sort((a, b) => (b.order ?? 0) - (a.order ?? 0))[0];
          setSelectedTermId(finalTerm.id);
        }
        const semList = semRes.data || [];
        setSemesters(semList);
        if (semList.length > 0) {
          const finalSem = [...semList].sort((a, b) => (b.order ?? 0) - (a.order ?? 0))[0];
          setSelectedSemesterId(finalSem.id);
        }
        const school = pickCurrentSchool(schoolRes.data);
        setTermStructure(school?.term_structure || 'semester');
      } catch (err) {
        setError('Failed to load terms');
      } finally {
        setLoadingTerms(false);
      }
    };
    loadTerms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear?.id]);

  const loadResults = useCallback(async () => {
    if (periodType === 'term' && !selectedTermId) return;
    if (periodType === 'semester' && !selectedSemesterId) return;
    setLoadingResults(true);
    setError('');
    try {
      const endpoint = periodType === 'semester' ? '/semester-results/school_top/' : '/results/school_top/';
      const params = periodType === 'semester'
        ? { semester_id: selectedSemesterId, band, limit }
        : { term_id: selectedTermId, band, limit };
      const response = await api.get(endpoint, { params, headers: getAuthHeader() });
      setResults(response.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load results');
      setResults([]);
    } finally {
      setLoadingResults(false);
    }
  }, [periodType, selectedTermId, selectedSemesterId, band, limit, getAuthHeader]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  // ✅ NEW (requested): school-wide recompute — same admin-only endpoint
  // AdminReportCards.js already uses, added here too since this is the
  // page that actually shows the school-wide comparison (elementary vs
  // high school bands) that this recalculation feeds. Unlike the
  // teacher's homeroom button, this recomputes and re-ranks EVERY
  // student in the school for the selected term/semester, not just one
  // class — that's the whole point of this page.
  const handleRecalculate = async () => {
    if (periodType === 'term' && !selectedTermId) return;
    if (periodType === 'semester' && !selectedSemesterId) return;
    setRecalculating(true);
    setError('');
    try {
      if (periodType === 'term') {
        await api.post('/results/recalculate/', { term_id: selectedTermId }, { headers: getAuthHeader() });
      } else {
        await api.post('/semester-results/recalculate/', { semester_id: selectedSemesterId }, { headers: getAuthHeader() });
      }
      await loadResults();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to recalculate ranks');
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Trophy className="h-6 w-6 text-yellow-500" />
          School-Wide Top Results
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Top-ranked students school-wide, split by elementary and high school — for award ceremonies and recognition.
        </p>
      </div>

      {loadingTerms ? (
        <div className="flex justify-center py-16"><Loader className="h-8 w-8 animate-spin text-primary-600" /></div>
      ) : terms.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-2 text-yellow-800">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>No terms have been set up for this academic year yet, so there's nothing to rank.</span>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-end gap-4">
            {termStructure === 'quarter' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
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
              </div>
            )}

            {periodType === 'term' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                <select
                  className="input-field"
                  value={selectedTermId || ''}
                  onChange={(e) => setSelectedTermId(Number(e.target.value))}
                >
                  {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
                <select
                  className="input-field"
                  value={selectedSemesterId || ''}
                  onChange={(e) => setSelectedSemesterId(Number(e.target.value))}
                >
                  {semesters.length === 0 && <option value="">No semesters yet</option>}
                  {semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Band</label>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setBand('elementary')}
                  className={`px-4 py-2 text-sm font-medium ${band === 'elementary' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  Elementary (Grades 1–8)
                </button>
                <button
                  onClick={() => setBand('high_school')}
                  className={`px-4 py-2 text-sm font-medium border-l border-gray-300 ${band === 'high_school' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  High School (Grades 9–12)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Show top</label>
              <select className="input-field" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                {[3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {/* ✅ NEW (requested): school-wide recompute, admin only —
                recomputes and re-ranks EVERY student in the school for
                this term/semester, unlike the teacher's homeroom-only
                button on their own Class Results page. */}
            <button
              onClick={handleRecalculate}
              disabled={recalculating || (periodType === 'term' ? !selectedTermId : !selectedSemesterId)}
              title="Recompute averages and re-rank the whole school for this period"
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {recalculating ? <Loader className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {recalculating ? 'Recalculating…' : 'Recalculate School-Wide'}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded text-red-700 text-sm">{error}</div>
          )}

          {loadingResults ? (
            <div className="flex justify-center py-16"><Loader className="h-8 w-8 animate-spin text-primary-600" /></div>
          ) : results.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
              No results yet for this term/band — this fills in as homeroom teachers accept marks.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              {results.map((r, i) => {
                // ✅ FIXED: this used to key off `i` (row position) —
                // MEDAL_COLORS[i] and `i < 3` — so a tie at rank 1 would
                // show gold/silver/bronze for three DIFFERENT rows even
                // though two of them are the same rank. Now keyed off
                // the actual r.school_rank value, same fix as the medal
                // logic on the teacher's Class Results page.
                const medalColor = r.school_rank === 1 ? 'text-yellow-500' : r.school_rank === 2 ? 'text-gray-400' : r.school_rank === 3 ? 'text-amber-700' : null;
                return (
                <div
                  key={r.id}
                  className={`flex items-center gap-4 px-6 py-4 ${i !== results.length - 1 ? 'border-b border-gray-100' : ''}`}
                >
                  <div className="w-10 flex justify-center">
                    {medalColor ? (
                      <Medal className={`h-7 w-7 ${medalColor}`} />
                    ) : (
                      <span className="text-gray-400 font-semibold">{r.school_rank}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{r.student_name}</p>
                    <p className="text-xs text-gray-500">
                      {r.student_id_display} · Grade {r.grade}{r.section ? ` ${r.section}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary-700">{Number(r.overall_average).toFixed(1)}%</p>
                    {r.letter_grade && <p className="text-xs text-gray-500">{r.letter_grade}</p>}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default SchoolResultsAwards;
