// src/pages/AcademicsSetup.js
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, RefreshCw, BookOpen, Users, Home, ClipboardList, Calendar,
  AlertCircle, CheckCircle, X, Loader
} from 'lucide-react';
import api from '../services/api';

const ALL_GRADES = Array.from({ length: 12 }, (_, i) => i + 1);

const TABS = [
  { id: 'subjects', label: 'Subjects', icon: BookOpen },
  { id: 'teachers', label: 'Subject Teachers', icon: Users },
  { id: 'homeroom', label: 'Homeroom Teachers', icon: Home },
  { id: 'terms', label: 'Terms', icon: Calendar },
  { id: 'assessments', label: 'Assessments', icon: ClipboardList },
];

function AcademicsSetup() {
  const [activeTab, setActiveTab] = useState('subjects');
  const [subjects, setSubjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [homerooms, setHomerooms] = useState([]);
  const [sections, setSections] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [currentYear, setCurrentYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [saving, setSaving] = useState(false);

  const [assignGrade, setAssignGrade] = useState(1);
  const [assignSection, setAssignSection] = useState('');
  const [assignSubject, setAssignSubject] = useState('');
  const [assignTeacher, setAssignTeacher] = useState('');

  const [homeGrade, setHomeGrade] = useState(1);
  const [homeSection, setHomeSection] = useState('');
  const [homeTeacher, setHomeTeacher] = useState('');

  const [assessmentTypes, setAssessmentTypes] = useState([]);
  const [newAssessmentName, setNewAssessmentName] = useState('');
  const [newAssessmentMaxScore, setNewAssessmentMaxScore] = useState(100);
  const [newAssessmentWeight, setNewAssessmentWeight] = useState('');
  const [newAssessmentTerm, setNewAssessmentTerm] = useState('');

  const [terms, setTerms] = useState([]);
  const [newTermName, setNewTermName] = useState('');
  const [newTermOrder, setNewTermOrder] = useState(1);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [subjectsRes, sectionsRes, staffRes, yearRes] = await Promise.all([
        api.get('/subjects/'),
        api.get('/sections/'),
        api.get('/staff-members/'),
        api.get('/academic-years/current/').catch(() => ({ data: null })),
      ]);
      setSubjects(subjectsRes.data);
      setSections(sectionsRes.data);
      setTeachers((staffRes.data || []).filter((s) => s.role === 'teacher'));
      setCurrentYear(yearRes.data);

      if (yearRes.data?.id) {
        const [assignRes, homeRes, termsRes, assessRes] = await Promise.all([
          api.get(`/class-assignments/?academic_year_id=${yearRes.data.id}`).catch(() => ({ data: [] })),
          api.get(`/homeroom-assignments/?academic_year_id=${yearRes.data.id}`),
          api.get(`/terms/?academic_year_id=${yearRes.data.id}`).catch(() => ({ data: [] })),
          api.get(`/assessment-types/?academic_year_id=${yearRes.data.id}`).catch(() => ({ data: [] })),
        ]);
        setAssignments(assignRes.data);
        setHomerooms(homeRes.data);
        setTerms(termsRes.data);
        setAssessmentTypes(assessRes.data);
      }
    } catch (err) {
      console.error('Error loading academics setup:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ===== Subjects =====
  const handleCreateSubject = async (e) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/subjects/', { name: newSubjectName.trim(), code: newSubjectCode.trim() });
      setSuccess(`"${newSubjectName}" added`);
      setNewSubjectName('');
      setNewSubjectCode('');
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.name?.[0] || err.response?.data?.error || 'Failed to add subject');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubject = async (id, name) => {
    if (!window.confirm(`Remove "${name}"? Existing assignments using it will keep working, but it won't be selectable for new ones.`)) return;
    try {
      await api.delete(`/subjects/${id}/`);
      setSuccess(`"${name}" removed`);
      fetchAll();
    } catch (err) {
      setError('Failed to remove subject');
    }
  };

  // ===== Subject Teacher Assignments =====
  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!assignSubject || !assignTeacher) {
      setError('Pick a subject and a teacher');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/class-assignments/', {
        staff: assignTeacher,
        subject: assignSubject,
        grade: parseInt(assignGrade),
        section: assignSection || '',
        academic_year: currentYear?.name || '',
      });
      setSuccess('Teacher assigned');
      setAssignSubject('');
      setAssignTeacher('');
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || Object.values(err.response?.data || {})[0]?.[0] || 'Failed to assign teacher');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssignment = async (id) => {
    if (!window.confirm('Remove this assignment?')) return;
    try {
      await api.delete(`/class-assignments/${id}/`);
      setSuccess('Assignment removed');
      fetchAll();
    } catch (err) {
      setError('Failed to remove assignment');
    }
  };

  // ===== Homeroom Assignments =====
  const handleCreateHomeroom = async (e) => {
    e.preventDefault();
    if (!homeSection || !homeTeacher || !currentYear?.id) {
      setError('Pick a section and a teacher (and make sure an academic year is set)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.post('/homeroom-assignments/', {
        academic_year: currentYear.id,
        grade: parseInt(homeGrade),
        section: homeSection,
        teacher: homeTeacher,
      });
      setSuccess('Homeroom teacher assigned');
      setHomeSection('');
      setHomeTeacher('');
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.error || Object.values(err.response?.data || {})[0]?.[0] || 'Failed to assign homeroom teacher');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHomeroom = async (id) => {
    if (!window.confirm('Remove this homeroom assignment?')) return;
    try {
      await api.delete(`/homeroom-assignments/${id}/`);
      setSuccess('Homeroom assignment removed');
      fetchAll();
    } catch (err) {
      setError('Failed to remove homeroom assignment');
    }
  };

  // ===== Terms =====
  const handleCreateTerm = async (e) => {
    e.preventDefault();
    if (!newTermName.trim() || !currentYear?.id) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/terms/', {
        academic_year: currentYear.id,
        name: newTermName.trim(),
        order: newTermOrder,
      });
      setSuccess(`"${newTermName}" added`);
      setNewTermName('');
      setNewTermOrder((prev) => prev + 1);
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.name?.[0] || err.response?.data?.error || 'Failed to add term');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTerm = async (id, name) => {
    if (!window.confirm(`Remove "${name}"? Assessments already created under it are kept, but it won't be selectable for new ones.`)) return;
    try {
      await api.delete(`/terms/${id}/`);
      setSuccess(`"${name}" removed`);
      fetchAll();
    } catch (err) {
      setError('Failed to remove term');
    }
  };

  // ===== Assessment Types =====
  const handleCreateAssessment = async (e) => {
    e.preventDefault();
    if (!newAssessmentName.trim() || !currentYear?.id) return;
    setSaving(true);
    setError('');
    try {
      await api.post('/assessment-types/', {
        academic_year: currentYear.id,
        term: newAssessmentTerm || null,
        name: newAssessmentName.trim(),
        max_score: newAssessmentMaxScore,
        weight_percent: newAssessmentWeight === '' ? null : newAssessmentWeight,
      });
      setSuccess(`"${newAssessmentName}" added`);
      setNewAssessmentName('');
      setNewAssessmentMaxScore(100);
      setNewAssessmentWeight('');
      fetchAll();
    } catch (err) {
      setError(err.response?.data?.name?.[0] || err.response?.data?.error || 'Failed to add assessment');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssessment = async (id, name) => {
    if (!window.confirm(`Remove "${name}"? Marks already entered for it are kept, but teachers won't be able to grade new ones under it.`)) return;
    try {
      await api.delete(`/assessment-types/${id}/`);
      setSuccess(`"${name}" removed`);
      fetchAll();
    } catch (err) {
      setError('Failed to remove assessment');
    }
  };

  const sectionsForGrade = (grade) => sections.filter((s) => s.grade === parseInt(grade));

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Academics Setup</h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            Register subjects and assign teachers — nothing here is hardcoded, every school sets this up their own way
            {currentYear?.name && <> · Academic year: <strong>{currentYear.name}</strong></>}
          </p>
        </div>
        <button onClick={fetchAll} className="btn-outline flex items-center gap-2 tap-target">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {!currentYear && !loading && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <p className="text-amber-800 text-sm">
            No academic year is set yet. Set one up first (Academic Years) — homeroom assignments need it.
          </p>
        </div>
      )}

      {/* Messages */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-red-50 border-l-4 border-red-500 p-4 rounded flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
            <button onClick={() => setError('')}><X className="h-4 w-4 text-red-500" /></button>
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-green-50 border-l-4 border-green-500 p-4 rounded flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <p className="text-green-700 text-sm">{success}</p>
            </div>
            <button onClick={() => setSuccess('')}><X className="h-4 w-4 text-green-500" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-white text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      ) : (
        <>
          {/* ===== SUBJECTS TAB ===== */}
          {activeTab === 'subjects' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Plus className="h-5 w-5 text-primary-600" />
                  Register a Subject
                </h2>
                <form onSubmit={handleCreateSubject} className="flex flex-col sm:flex-row items-end gap-3">
                  <div className="w-full sm:flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject Name</label>
                    <input
                      type="text" value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)}
                      className="input-field" placeholder="e.g., Mathematics" required
                    />
                  </div>
                  <div className="w-full sm:w-32">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Code (optional)</label>
                    <input
                      type="text" value={newSubjectCode} onChange={(e) => setNewSubjectCode(e.target.value)}
                      className="input-field" placeholder="MATH"
                    />
                  </div>
                  <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 tap-target w-full sm:w-auto">
                    {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add
                  </button>
                </form>
              </div>

              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Subject</th>
                      <th className="text-left px-4 py-3">Code</th>
                      <th className="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {subjects.length === 0 && (
                      <tr><td colSpan={3} className="text-center text-gray-400 py-8">No subjects yet — add your first one above.</td></tr>
                    )}
                    {subjects.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                        <td className="px-4 py-3 text-gray-500">{s.code || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleDeleteSubject(s.id, s.name)} className="text-red-500 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== SUBJECT TEACHERS TAB ===== */}
          {activeTab === 'teachers' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Plus className="h-5 w-5 text-primary-600" />
                  Assign a Subject Teacher
                </h2>
                <form onSubmit={handleCreateAssignment} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
                    <select value={assignGrade} onChange={(e) => { setAssignGrade(e.target.value); setAssignSection(''); }} className="input-field">
                      {ALL_GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                    <select value={assignSection} onChange={(e) => setAssignSection(e.target.value)} className="input-field">
                      <option value="">All sections</option>
                      {sectionsForGrade(assignGrade).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <select value={assignSubject} onChange={(e) => setAssignSubject(e.target.value)} className="input-field" required>
                      <option value="">Select subject</option>
                      {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                    <select value={assignTeacher} onChange={(e) => setAssignTeacher(e.target.value)} className="input-field" required>
                      <option value="">Select teacher</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                    </select>
                  </div>
                  <button type="submit" disabled={saving} className="btn-primary flex items-center justify-center gap-2 tap-target">
                    {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Assign
                  </button>
                </form>
                {teachers.length === 0 && (
                  <p className="text-sm text-amber-600 mt-3">No staff members are marked as "teacher" yet — add one in Staff &amp; Teachers first.</p>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Grade</th>
                      <th className="text-left px-4 py-3">Section</th>
                      <th className="text-left px-4 py-3">Subject</th>
                      <th className="text-left px-4 py-3">Teacher</th>
                      <th className="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {assignments.length === 0 && (
                      <tr><td colSpan={5} className="text-center text-gray-400 py-8">No assignments yet.</td></tr>
                    )}
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-3">Grade {a.grade}</td>
                        <td className="px-4 py-3">{a.section || 'All sections'}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{a.subject_name}</td>
                        <td className="px-4 py-3">{a.staff_name}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleDeleteAssignment(a.id)} className="text-red-500 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== HOMEROOM TAB ===== */}
          {activeTab === 'homeroom' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Plus className="h-5 w-5 text-primary-600" />
                  Assign a Homeroom Teacher
                </h2>
                <form onSubmit={handleCreateHomeroom} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
                    <select value={homeGrade} onChange={(e) => { setHomeGrade(e.target.value); setHomeSection(''); }} className="input-field">
                      {ALL_GRADES.map((g) => <option key={g} value={g}>Grade {g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                    <select value={homeSection} onChange={(e) => setHomeSection(e.target.value)} className="input-field" required>
                      <option value="">Select section</option>
                      {sectionsForGrade(homeGrade).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                    <select value={homeTeacher} onChange={(e) => setHomeTeacher(e.target.value)} className="input-field" required>
                      <option value="">Select teacher</option>
                      {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                    </select>
                  </div>
                  <button type="submit" disabled={saving} className="btn-primary flex items-center justify-center gap-2 tap-target">
                    {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Assign
                  </button>
                </form>
              </div>

              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Grade</th>
                      <th className="text-left px-4 py-3">Section</th>
                      <th className="text-left px-4 py-3">Homeroom Teacher</th>
                      <th className="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {homerooms.length === 0 && (
                      <tr><td colSpan={4} className="text-center text-gray-400 py-8">No homeroom teachers assigned yet.</td></tr>
                    )}
                    {homerooms.map((h) => (
                      <tr key={h.id}>
                        <td className="px-4 py-3">Grade {h.grade}</td>
                        <td className="px-4 py-3">{h.section_name}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{h.teacher_name}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleDeleteHomeroom(h.id)} className="text-red-500 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== ASSESSMENTS TAB ===== */}
          {activeTab === 'assessments' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <Plus className="h-5 w-5 text-primary-600" />
                  Create an Assessment
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  This is what teachers pick from when entering marks — e.g. "Mid Term Exam", "Final Exam", "Quiz 1".
                  Nothing shows up for teachers to grade until at least one exists here.
                </p>
                <form onSubmit={handleCreateAssessment} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text" value={newAssessmentName} onChange={(e) => setNewAssessmentName(e.target.value)}
                      className="input-field" placeholder="e.g., Mid Term Exam" required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                    <select value={newAssessmentTerm} onChange={(e) => setNewAssessmentTerm(e.target.value)} className="input-field">
                      <option value="">No term (ungrouped)</option>
                      {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Out of</label>
                    <input
                      type="number" min="1" value={newAssessmentMaxScore}
                      onChange={(e) => setNewAssessmentMaxScore(e.target.value)}
                      className="input-field" required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Weight % (optional)</label>
                    <input
                      type="number" min="0" max="100" value={newAssessmentWeight}
                      onChange={(e) => setNewAssessmentWeight(e.target.value)}
                      className="input-field" placeholder="e.g., 40"
                    />
                  </div>
                  <button type="submit" disabled={saving || !currentYear} className="btn-primary flex items-center justify-center gap-2 tap-target sm:col-span-5">
                    {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add Assessment
                  </button>
                </form>
                {!currentYear && (
                  <p className="text-sm text-amber-600 mt-3">Set an academic year first (Academic Years) before adding assessments.</p>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">Term</th>
                      <th className="text-left px-4 py-3">Out of</th>
                      <th className="text-left px-4 py-3">Weight</th>
                      <th className="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {assessmentTypes.length === 0 && (
                      <tr><td colSpan={5} className="text-center text-gray-400 py-8">No assessments yet — add your first one above.</td></tr>
                    )}
                    {assessmentTypes.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-3 font-medium text-gray-800">{a.name}</td>
                        <td className="px-4 py-3 text-gray-500">{a.term_name || 'Ungrouped'}</td>
                        <td className="px-4 py-3 text-gray-500">{a.max_score}</td>
                        <td className="px-4 py-3 text-gray-500">{a.weight_percent ? `${a.weight_percent}%` : '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleDeleteAssessment(a.id, a.name)} className="text-red-500 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== TERMS TAB ===== */}
          {activeTab === 'terms' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <Plus className="h-5 w-5 text-primary-600" />
                  Create a Term
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  Grading periods for the current academic year — Semester 1, Semester 2, or however your school splits the year.
                  Assessments (Mid Term, Final...) belong to one of these, so marks can be totaled per term instead of the whole year at once.
                </p>
                <form onSubmit={handleCreateTerm} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text" value={newTermName} onChange={(e) => setNewTermName(e.target.value)}
                      className="input-field" placeholder="e.g., Semester 1" required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
                    <input
                      type="number" min="1" value={newTermOrder}
                      onChange={(e) => setNewTermOrder(e.target.value)}
                      className="input-field" required
                    />
                  </div>
                  <button type="submit" disabled={saving || !currentYear} className="btn-primary flex items-center justify-center gap-2 tap-target">
                    {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add Term
                  </button>
                </form>
                {!currentYear && (
                  <p className="text-sm text-amber-600 mt-3">Set an academic year first (Academic Years) before adding terms.</p>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="text-left px-4 py-3">Order</th>
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-right px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {terms.length === 0 && (
                      <tr><td colSpan={3} className="text-center text-gray-400 py-8">No terms yet — add your first one above.</td></tr>
                    )}
                    {terms.map((t) => (
                      <tr key={t.id}>
                        <td className="px-4 py-3 text-gray-500">{t.order}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{t.name}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => handleDeleteTerm(t.id, t.name)} className="text-red-500 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AcademicsSetup;
