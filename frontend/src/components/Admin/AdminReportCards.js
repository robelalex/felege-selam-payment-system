// frontend/src/components/Admin/AdminReportCards.js
//
// Phase 6 (continued) — admin screen to generate, view, and release
// report cards for a class. Generating never auto-releases (same rule
// the backend enforces) — a report card sits as a draft until an admin
// explicitly clicks Release, which is what actually makes it visible
// to parents.
import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, Loader, AlertTriangle, CheckCircle2, Download, Send,
  RefreshCw, XCircle,
} from 'lucide-react';
import api from '../../services/api';
import { useYear } from '../../context/YearContext';
import { useAuth } from '../../context/AuthContext';

const ALL_GRADES = Array.from({ length: 12 }, (_, i) => i + 1);

function AdminReportCards() {
  const { selectedYear } = useYear();
  const { getAuthHeader } = useAuth();

  const [sections, setSections] = useState([]);
  const [terms, setTerms] = useState([]);

  const [grade, setGrade] = useState(1);
  const [section, setSection] = useState('');
  const [reportType, setReportType] = useState('term');
  const [termId, setTermId] = useState('');

  const [results, setResults] = useState([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [releasingId, setReleasingId] = useState(null);
  const [error, setError] = useState('');
  const [genSummary, setGenSummary] = useState(null); // { generatedCount, failed: [] }
  const [statusFilter, setStatusFilter] = useState('all'); // all | draft | released

  // ── Load sections + terms once we know the year ──────────────────
  useEffect(() => {
    const loadStatic = async () => {
      try {
        const [secRes, termRes] = await Promise.all([
          api.get('/sections/', { headers: getAuthHeader() }),
          selectedYear?.id
            ? api.get('/terms/', { params: { academic_year_id: selectedYear.id }, headers: getAuthHeader() })
            : Promise.resolve({ data: [] }),
        ]);
        setSections(secRes.data || []);
        const termList = termRes.data || [];
        setTerms(termList);
        if (termList.length > 0 && !termId) setTermId(termList[0].id);
      } catch {
        setError('Failed to load sections/terms');
      }
    };
    loadStatic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear?.id]);

  const sectionsForGrade = sections.filter((s) => s.grade === Number(grade));

  const loadResults = useCallback(async () => {
    if (!selectedYear?.id) return;
    setLoadingResults(true);
    setError('');
    try {
      const params = { academic_year_id: selectedYear.id, grade, section, report_type: reportType };
      if (reportType === 'term' && termId) params.term_id = termId;
      if (statusFilter !== 'all') params.status = statusFilter;
      const response = await api.get('/report-cards/', { params, headers: getAuthHeader() });
      setResults(response.data?.results || response.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load report cards');
      setResults([]);
    } finally {
      setLoadingResults(false);
    }
  }, [selectedYear?.id, grade, section, reportType, termId, statusFilter, getAuthHeader]);

  useEffect(() => { loadResults(); }, [loadResults]);

  const handleGenerateClass = async () => {
    if (!selectedYear?.id) return;
    if (reportType === 'term' && !termId) {
      setError('Select a term first');
      return;
    }
    setGenerating(true);
    setError('');
    setGenSummary(null);
    try {
      const body = {
        grade, section, academic_year_id: selectedYear.id, report_type: reportType,
      };
      if (reportType === 'term') body.term_id = termId;
      const response = await api.post('/report-cards/generate_class/', body, { headers: getAuthHeader() });
      const generated = response.data?.generated || [];
      const failed = response.data?.failed || [];
      setGenSummary({ generatedCount: generated.length, failed });
      loadResults();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate report cards');
    } finally {
      setGenerating(false);
    }
  };

  const handleRelease = async (id) => {
    setReleasingId(id);
    setError('');
    try {
      await api.post(`/report-cards/${id}/release/`, {}, { headers: getAuthHeader() });
      loadResults();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to release');
    } finally {
      setReleasingId(null);
    }
  };

  const fmtPct = (v) => (v != null ? `${Number(v).toFixed(1)}%` : '—');
  const fmtRank = (rank, total) => (rank == null ? '—' : total ? `${rank} / ${total}` : `${rank}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary-600" />
          Report Cards
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Generate term or year-end report cards for a class, then release them so parents can see them.
          Generating never releases automatically — nothing is visible to parents until you click Release.
        </p>
      </div>

      {!selectedYear?.id ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-2 text-yellow-800">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>Select an academic year first.</span>
        </div>
      ) : (
        <>
          {/* ── Filters / generation controls ────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
              <select className="input-field" value={grade} onChange={(e) => { setGrade(Number(e.target.value)); setSection(''); }}>
                {ALL_GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
              <select className="input-field" value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">(No section)</option>
                {sectionsForGrade.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setReportType('term')}
                  className={`px-4 py-2 text-sm font-medium ${reportType === 'term' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  Term
                </button>
                <button
                  onClick={() => setReportType('cumulative')}
                  className={`px-4 py-2 text-sm font-medium border-l border-gray-300 ${reportType === 'cumulative' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                >
                  Year-End Cumulative
                </button>
              </div>
            </div>

            {reportType === 'term' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                <select className="input-field" value={termId} onChange={(e) => setTermId(Number(e.target.value))}>
                  {terms.length === 0 && <option value="">No terms yet</option>}
                  {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}

            <button
              onClick={handleGenerateClass}
              disabled={generating || (reportType === 'term' && !termId)}
              className="btn-primary flex items-center gap-2"
            >
              {generating ? <Loader className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Generate for Class
            </button>
          </div>

          {genSummary && (
            <div className={`rounded-xl border p-4 text-sm ${genSummary.failed.length > 0 ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : 'bg-green-50 border-green-200 text-green-800'}`}>
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" /> Generated {genSummary.generatedCount} report card{genSummary.generatedCount === 1 ? '' : 's'}.
              </p>
              {genSummary.failed.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium flex items-center gap-2"><XCircle className="h-4 w-4" /> {genSummary.failed.length} skipped:</p>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    {genSummary.failed.map((f) => (
                      <li key={f.student_id}>{f.student_name} — {f.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded text-red-700 text-sm flex items-center justify-between">
              <span>{error}</span>
              <button onClick={loadResults} className="text-red-700 text-sm flex items-center gap-1">
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            </div>
          )}

          {/* ── Status filter tabs ───────────────────────────────── */}
          <div className="flex gap-2">
            {['all', 'draft', 'released'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize ${statusFilter === s ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* ── Results table ─────────────────────────────────────── */}
          {loadingResults ? (
            <div className="flex justify-center py-16"><Loader className="h-8 w-8 animate-spin text-primary-600" /></div>
          ) : results.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
              No report cards yet for this selection — use "Generate for Class" above.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-primary-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-700">Student</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 text-center">Average</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 text-center">Rank</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 text-center">Status</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 text-center">Generated</th>
                    <th className="px-3 py-3 font-semibold text-gray-700 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{r.student_name}</p>
                        <p className="text-xs text-gray-500">{r.student_id_display}</p>
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-primary-700">{fmtPct(r.overall_average)}</td>
                      <td className="px-3 py-3 text-center">{fmtRank(r.homeroom_rank, r.homeroom_rank_total)}</td>
                      <td className="px-3 py-3 text-center">
                        {r.status === 'released' ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Released</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">Draft</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-gray-500">
                        {r.generated_at ? new Date(r.generated_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {r.pdf_url && (
                            <a
                              href={r.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                              title="View / download PDF"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          )}
                          {r.status !== 'released' && (
                            <button
                              onClick={() => handleRelease(r.id)}
                              disabled={releasingId === r.id}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 disabled:opacity-50"
                              title="Release to parents"
                            >
                              {releasingId === r.id ? <Loader className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                              Release
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AdminReportCards;
