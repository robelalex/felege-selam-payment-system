// src/pages/teacher/TeacherGradebook.js
//
// One table, two modes (mirrors the Flutter GradebookScreen):
//  - Subject teacher (isHomeroomView=false): editable score cells, per-row
//    "Send" and a top "Send All" bulk button.
//  - Homeroom (isHomeroomView=true): read-only scores, per-row Accept/Reject
//    and top bulk Accept All / Reject All buttons.
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader, RefreshCw, Check, X as XIcon, Undo2 } from 'lucide-react';
import {
  getTerms, getGradebook, saveMarks, submitMarks, submitStudent, homeroomDecide, extractError,
} from '../../services/teacherApi';

const statusColor = (status) => ({
  submitted: 'bg-orange-400',
  accepted: 'bg-green-500',
  rejected: 'bg-red-500',
}[status] || 'bg-gray-300');

function TeacherGradebook() {
  const { subjectId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const grade = params.get('grade');
  const section = params.get('section') || '';
  const subjectName = params.get('subjectName') || 'Subject';
  const academicYearId = params.get('academicYearId');
  const isHomeroomView = params.get('homeroom') === '1';

  const [terms, setTerms] = useState([]);
  const [selectedTermId, setSelectedTermId] = useState(null);
  const [loadingTerms, setLoadingTerms] = useState(true);
  const [loadingGradebook, setLoadingGradebook] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState('');
  const [assessmentTypes, setAssessmentTypes] = useState([]);
  const [students, setStudents] = useState([]);
  const [scores, setScores] = useState({}); // key: `${studentId}:${assessmentTypeId}` -> string

  const loadGradebook = useCallback(async (termId) => {
    if (!termId) return;
    setLoadingGradebook(true);
    setError('');
    try {
      const response = await getGradebook({ subjectId, termId, grade, section });
      const types = response.data.assessment_types || [];
      const studs = response.data.students || [];
      const nextScores = {};
      for (const s of studs) {
        for (const a of types) {
          const col = s.columns?.[a.id] ?? s.columns?.[String(a.id)];
          nextScores[`${s.student_id}:${a.id}`] = col?.score != null ? String(col.score) : '';
        }
      }
      setAssessmentTypes(types);
      setStudents(studs);
      setScores(nextScores);
    } catch (err) {
      setError(extractError(err, 'Failed to load gradebook'));
    } finally {
      setLoadingGradebook(false);
    }
  }, [subjectId, grade, section]);

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
          await loadGradebook(list[0].id);
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

  const columnFor = (student, assessmentTypeId) =>
    student.columns?.[assessmentTypeId] ?? student.columns?.[String(assessmentTypeId)];

  const formatTotal = (student) => {
    if (student.weighted_percent != null) {
      const v = Number(student.weighted_percent);
      return Number.isFinite(v) ? `${v.toFixed(1)}%` : '-';
    }
    if (student.raw_total != null && student.raw_max_total != null) {
      return `${student.raw_total} / ${student.raw_max_total}`;
    }
    return '-';
  };

  const saveAllVisible = async () => {
    for (const a of assessmentTypes) {
      const entries = students.map((s) => {
        const text = (scores[`${s.student_id}:${a.id}`] || '').trim();
        return { student_id: s.student_id, score: text === '' ? null : Number(text) };
      });
      await saveMarks({ subjectId, assessmentTypeId: a.id, grade, section, entries });
    }
  };

  const handleSendStudent = async (studentId) => {
    setIsActing(true);
    try {
      for (const a of assessmentTypes) {
        const text = (scores[`${studentId}:${a.id}`] || '').trim();
        await saveMarks({
          subjectId, assessmentTypeId: a.id, grade, section,
          entries: [{ student_id: studentId, score: text === '' ? null : Number(text) }],
        });
      }
      await submitStudent({ subjectId, termId: selectedTermId, grade, section, studentId });
      await loadGradebook(selectedTermId);
    } catch (err) {
      setError(extractError(err, 'Could not send.'));
    } finally {
      setIsActing(false);
    }
  };

  const handleSendAll = async () => {
    setIsActing(true);
    try {
      await saveAllVisible();
      for (const a of assessmentTypes) {
        await submitMarks({ subjectId, assessmentTypeId: a.id, grade, section });
      }
      await loadGradebook(selectedTermId);
    } catch (err) {
      setError(extractError(err, 'Could not send all.'));
    } finally {
      setIsActing(false);
    }
  };

  const handleSaveAll = async () => {
    setIsActing(true);
    try {
      await saveAllVisible();
      await loadGradebook(selectedTermId);
    } catch (err) {
      setError(extractError(err, 'Could not save.'));
    } finally {
      setIsActing(false);
    }
  };

  const handleDecideStudent = async (studentId, accept) => {
    setIsActing(true);
    try {
      const student = students.find((s) => s.student_id === studentId);
      for (const a of assessmentTypes) {
        const col = columnFor(student, a.id);
        if (col && col.status === 'submitted') {
          await homeroomDecide({ accept, subjectId, assessmentTypeId: a.id, grade, section, studentId });
        }
      }
      await loadGradebook(selectedTermId);
    } catch (err) {
      setError(extractError(err, 'Could not update.'));
    } finally {
      setIsActing(false);
    }
  };

  const handleDecideAll = async (accept) => {
    setIsActing(true);
    try {
      for (const a of assessmentTypes) {
        await homeroomDecide({ accept, subjectId, assessmentTypeId: a.id, grade, section });
      }
      await loadGradebook(selectedTermId);
    } catch (err) {
      setError(extractError(err, 'Could not update.'));
    } finally {
      setIsActing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-primary-700 text-white px-4 sm:px-6 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></button>
        <span className="font-semibold truncate">
          {subjectName} — Grade {grade}{section ? ` ${section}` : ''}
        </span>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
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
                  loadGradebook(id);
                }}
              >
                {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-4 flex items-center justify-between">
                <p className="text-red-700 text-sm">{error}</p>
                <button onClick={() => loadGradebook(selectedTermId)} className="text-red-700 text-sm flex items-center gap-1">
                  <RefreshCw className="h-4 w-4" /> Retry
                </button>
              </div>
            )}

            {terms.length === 0 ? (
              <p className="text-center text-gray-500 py-16">
                No terms have been set up yet. Ask your school admin to create one in Academics Setup.
              </p>
            ) : loadingGradebook ? (
              <div className="flex justify-center py-16"><Loader className="h-8 w-8 animate-spin text-primary-600" /></div>
            ) : students.length === 0 ? (
              <p className="text-center text-gray-500 py-16">No students in this class.</p>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-primary-50">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Student</th>
                      {assessmentTypes.map((a) => (
                        <th key={a.id} className="px-3 py-3 font-semibold text-gray-700 text-center whitespace-nowrap">
                          {a.name}<br /><span className="font-normal text-xs">(/ {a.max_score})</span>
                        </th>
                      ))}
                      <th className="px-3 py-3 font-semibold text-gray-700 text-center">Total</th>
                      <th className="px-3 py-3 font-semibold text-gray-700 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.student_id} className="border-t border-gray-100">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{s.student_name}</p>
                          <p className="text-xs text-gray-500">{s.student_id_display}</p>
                        </td>
                        {assessmentTypes.map((a) => {
                          const col = columnFor(s, a.id);
                          const status = col?.status || 'draft';
                          const locked = isHomeroomView || status === 'submitted' || status === 'accepted';
                          const key = `${s.student_id}:${a.id}`;
                          return (
                            <td key={a.id} className="px-3 py-3 text-center">
                              <input
                                type="number"
                                value={scores[key] ?? ''}
                                disabled={locked}
                                onChange={(e) => setScores((prev) => ({ ...prev, [key]: e.target.value }))}
                                className="w-16 text-center border border-gray-200 rounded-md py-1 disabled:bg-gray-100"
                              />
                              {status !== 'draft' && (
                                <div className={`w-2 h-2 rounded-full mx-auto mt-1 ${statusColor(status)}`} />
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-3 text-center font-semibold">{formatTotal(s)}</td>
                        <td className="px-3 py-3 text-center">
                          {isHomeroomView ? (
                            <div className="flex justify-center gap-1">
                              <button
                                disabled={isActing}
                                onClick={() => handleDecideStudent(s.student_id, false)}
                                title="Reject"
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                              >
                                <XIcon className="h-4 w-4" />
                              </button>
                              <button
                                disabled={isActing}
                                onClick={() => handleDecideStudent(s.student_id, true)}
                                title="Accept"
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              disabled={isActing}
                              onClick={() => handleSendStudent(s.student_id)}
                              className="text-primary-600 text-sm font-medium hover:underline"
                            >
                              Send
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {terms.length > 0 && students.length > 0 && (
              <div className="mt-4 flex gap-3">
                {isHomeroomView ? (
                  <>
                    <button
                      disabled={isActing}
                      onClick={() => handleDecideAll(false)}
                      className="flex-1 btn-secondary flex items-center justify-center gap-2 py-2.5 text-red-600 border-red-200"
                    >
                      <Undo2 className="h-4 w-4" /> Reject All
                    </button>
                    <button
                      disabled={isActing}
                      onClick={() => handleDecideAll(true)}
                      className="flex-1 btn-primary flex items-center justify-center gap-2 py-2.5"
                    >
                      {isActing ? <Loader className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Accept All
                    </button>
                  </>
                ) : (
                  <>
                    <button disabled={isActing} onClick={handleSaveAll} className="flex-1 btn-secondary py-2.5">
                      Save
                    </button>
                    <button disabled={isActing} onClick={handleSendAll} className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2">
                      {isActing && <Loader className="h-4 w-4 animate-spin" />} Send All
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default TeacherGradebook;