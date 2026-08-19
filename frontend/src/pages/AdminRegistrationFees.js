// src/pages/AdminRegistrationFees.js
//
// ✅ Jimma request #2 — registration fees.
//
// Two sections on one page, matching how AdminDeadlines.js is laid out:
//   1. This year's registration fee amounts (new vs. continuing) — one
//      row per school per academic year, "settable fresh every year" so
//      there's no carry-over default shown; if this year has no config
//      yet, the form starts blank rather than pre-filled from last year.
//   2. Search a student, see whether they're currently billed as New or
//      Continuing (auto-detected from payment history unless an admin
//      already overrode it), and override it by hand — for cases like a
//      transfer student who's new to THIS school but has payment history
//      elsewhere that auto-detection can't see.
import React, { useState, useEffect } from 'react';
import {
  DollarSign, Save, Loader, CheckCircle, XCircle, Search,
  UserCheck, UserPlus, RefreshCw, ShieldCheck, AlertTriangle, Phone, Repeat
} from 'lucide-react';
import api from '../services/api';
import { useYear } from '../context/YearContext';

function AdminRegistrationFees() {
  const { selectedYear } = useYear();

  // --- Section 1: this year's config -----------------------------------
  const [config, setConfig] = useState(null); // existing RegistrationFeeConfig row, or null
  const [configLoading, setConfigLoading] = useState(true);
  const [configForm, setConfigForm] = useState({ new_student_amount: '', continuing_student_amount: '', transferred_student_amount: '' });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState(null);

  // --- Section 2: bulk student classification (grade/section) -----------
  // ✅ Replaces the old one-at-a-time search+override flow. Root problem:
  // auto-detection only sees payment history recorded IN THIS SYSTEM, so
  // any grade/section with un-digitized prior-year records shows up as
  // "all New" even though most are really Continuing. This lets an admin
  // review and bulk-correct a whole grade/section in one pass instead of
  // hunting student by student.
  const [classifyGrade, setClassifyGrade] = useState('all');
  const [classifySection, setClassifySection] = useState('all');
  const [classifyStudents, setClassifyStudents] = useState([]);
  const [classifyLoading, setClassifyLoading] = useState(false);
  const [classifyNameFilter, setClassifyNameFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [classifyMessage, setClassifyMessage] = useState(null);

  // --- Section 3: unpaid registration fees (grade/section filterable) ----
  const [allSections, setAllSections] = useState([]);
  const [unpaidGrade, setUnpaidGrade] = useState('all');
  const [unpaidSection, setUnpaidSection] = useState('all');
  const [unpaidData, setUnpaidData] = useState(null);
  const [unpaidLoading, setUnpaidLoading] = useState(false);
  // ✅ NEW: send the one-time registration fee reminder (SMS + Email),
  // kept fully separate from the monthly reminder flow — see
  // ReminderViewSet.send_registration on the backend.
  const [selectedUnpaidIds, setSelectedUnpaidIds] = useState(new Set());
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderMessage, setReminderMessage] = useState(null);

  useEffect(() => {
    api.get('/sections/').then((res) => setAllSections(res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedYear?.id) {
      fetchUnpaid();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, unpaidGrade, unpaidSection]);

  const fetchUnpaid = async () => {
    setUnpaidLoading(true);
    setSelectedUnpaidIds(new Set());
    setReminderMessage(null);
    try {
      const response = await api.get('/registration-fee-configs/unpaid-students/', {
        params: {
          academic_year_id: selectedYear.id,
          grade: unpaidGrade,
          section: unpaidSection,
        }
      });
      setUnpaidData(response.data);
    } catch (err) {
      console.error('Error fetching unpaid registration students:', err);
      setUnpaidData(null);
    } finally {
      setUnpaidLoading(false);
    }
  };

  const sectionOptionsForGrade = unpaidGrade === 'all'
    ? allSections
    : allSections.filter((s) => String(s.grade) === String(unpaidGrade));

  const toggleUnpaidSelected = (studentId) => {
    setSelectedUnpaidIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  };

  const toggleSelectAllUnpaid = () => {
    if (!unpaidData?.students) return;
    setSelectedUnpaidIds((prev) => {
      const allIds = unpaidData.students.map((s) => s.student_id);
      const allSelected = allIds.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(allIds);
    });
  };

  const sendRegistrationReminders = async () => {
    if (selectedUnpaidIds.size === 0 || !selectedYear?.id) return;
    setSendingReminders(true);
    setReminderMessage(null);
    try {
      const response = await api.post('/reminders/send_registration/', {
        student_ids: Array.from(selectedUnpaidIds),
        academic_year: selectedYear.id,
      });
      setReminderMessage({
        type: 'success',
        text: `Sent to ${response.data.sent} parent(s). ${response.data.failed} failed.`,
      });
    } catch (err) {
      console.error('Error sending registration reminders:', err.response?.data);
      setReminderMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to send reminders.',
      });
    } finally {
      setSendingReminders(false);
    }
  };

  useEffect(() => {
    if (selectedYear?.id) {
      fetchConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  const fetchConfig = async () => {
    setConfigLoading(true);
    setConfig(null);
    setConfigForm({ new_student_amount: '', continuing_student_amount: '', transferred_student_amount: '' });
    try {
      const response = await api.get('/registration-fee-configs/', {
        params: { academic_year_id: selectedYear.id }
      });
      const existing = (response.data.results || response.data)[0] || null;
      if (existing) {
        setConfig(existing);
        setConfigForm({
          new_student_amount: existing.new_student_amount,
          continuing_student_amount: existing.continuing_student_amount,
          transferred_student_amount: existing.transferred_student_amount ?? ''
        });
      }
    } catch (err) {
      console.error('Error fetching registration fee config:', err);
    } finally {
      setConfigLoading(false);
    }
  };

  const fetchClassifyStudents = async () => {
    if (!selectedYear?.id) return;
    setClassifyLoading(true);
    setSelectedIds(new Set());
    try {
      const response = await api.get('/student-registration-types/for-grade/', {
        params: {
          academic_year_id: selectedYear.id,
          grade: classifyGrade,
          section: classifySection,
        }
      });
      setClassifyStudents(response.data.students || []);
    } catch (err) {
      console.error('Error fetching students for classification:', err);
      setClassifyStudents([]);
    } finally {
      setClassifyLoading(false);
    }
  };

  useEffect(() => {
    if (selectedYear?.id) {
      fetchClassifyStudents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, classifyGrade, classifySection]);

  const classifySectionOptionsForGrade = classifyGrade === 'all'
    ? allSections
    : allSections.filter((s) => String(s.grade) === String(classifyGrade));

  const visibleClassifyStudents = classifyNameFilter.trim().length === 0
    ? classifyStudents
    : classifyStudents.filter((s) =>
        s.name?.toLowerCase().includes(classifyNameFilter.toLowerCase()) ||
        s.student_id?.toLowerCase().includes(classifyNameFilter.toLowerCase())
      );

  const toggleSelected = (studentId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const allVisible = visibleClassifyStudents.map((s) => s.student_id);
      const allSelected = allVisible.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allVisible);
    });
  };

  const applyBulkClassification = async (registrationType) => {
    if (selectedIds.size === 0 || !selectedYear?.id) return;
    setBulkSaving(true);
    setClassifyMessage(null);
    try {
      const response = await api.post('/student-registration-types/bulk-set-type/', {
        student_ids: Array.from(selectedIds),
        academic_year_id: selectedYear.id,
        registration_type: registrationType,
      });
      const label = registrationType === 'new' ? 'New'
        : registrationType === 'continuing' ? 'Continuing/Senior'
        : 'Transferred';
      setClassifyMessage({
        type: 'success',
        text: `${response.data.updated_count} student(s) marked as ${label}.` +
          (response.data.not_found_student_ids?.length
            ? ` ${response.data.not_found_student_ids.length} could not be found.`
            : '')
      });
      await fetchClassifyStudents();
    } catch (err) {
      console.error('Error applying bulk classification:', err.response?.data);
      setClassifyMessage({ type: 'error', text: err.response?.data?.error || 'Failed to update classification.' });
    } finally {
      setBulkSaving(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!selectedYear?.id) return;
    setSavingConfig(true);
    setConfigMessage(null);

    const data = {
      academic_year: selectedYear.id,
      new_student_amount: parseFloat(configForm.new_student_amount),
      continuing_student_amount: parseFloat(configForm.continuing_student_amount),
      // Optional — a transferred student is charged 0 until this is set,
      // so it's fine to leave blank rather than force a value now.
      transferred_student_amount: configForm.transferred_student_amount === ''
        ? null
        : parseFloat(configForm.transferred_student_amount)
    };

    try {
      if (config) {
        const response = await api.patch(`/registration-fee-configs/${config.id}/`, data);
        setConfig(response.data);
      } else {
        const response = await api.post('/registration-fee-configs/', data);
        setConfig(response.data);
      }
      setConfigMessage({ type: 'success', text: 'Registration fees saved for this academic year.' });
    } catch (err) {
      console.error('Error saving registration fee config:', err.response?.data);
      const errData = err.response?.data;
      const text = (errData && typeof errData === 'object')
        ? Object.values(errData).flat().join(' ')
        : 'Failed to save registration fees.';
      setConfigMessage({ type: 'error', text });
    } finally {
      setSavingConfig(false);
    }
  };


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Registration Fees</h1>
        <p className="text-gray-600 mt-1">
          One-time registration charge for {selectedYear?.name || 'the selected academic year'} — set separately for new vs. continuing/senior students
        </p>
      </div>

      {/* ===== Section 1: Fee amounts for this year ===== */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900">Amounts for {selectedYear?.name || 'this year'}</h2>
        </div>

        {!selectedYear?.id ? (
          <p className="text-gray-500 text-sm">Select an academic year to configure registration fees.</p>
        ) : configLoading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : (
          <>
            {!config && (
              <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-4">
                No registration fees have been set for {selectedYear?.name} yet — amounts are not carried over automatically each year. Set them below.
              </p>
            )}

            {configMessage && (
              <div className={`p-3 rounded-lg flex items-center gap-2 mb-4 text-sm ${
                configMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {configMessage.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {configMessage.text}
              </div>
            )}

            <form onSubmit={handleSaveConfig} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <UserPlus className="h-4 w-4 inline mr-1 text-blue-600" />
                  New Student Amount (ETB) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={configForm.new_student_amount}
                  onChange={(e) => setConfigForm({ ...configForm, new_student_amount: e.target.value })}
                  className="input-field"
                  placeholder="e.g., 1500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <UserCheck className="h-4 w-4 inline mr-1 text-green-600" />
                  Continuing/Senior Student Amount (ETB) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={configForm.continuing_student_amount}
                  onChange={(e) => setConfigForm({ ...configForm, continuing_student_amount: e.target.value })}
                  className="input-field"
                  placeholder="e.g., 800"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Repeat className="h-4 w-4 inline mr-1 text-purple-600" />
                  Transferred-In Student Amount (ETB)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={configForm.transferred_student_amount}
                  onChange={(e) => setConfigForm({ ...configForm, transferred_student_amount: e.target.value })}
                  className="input-field"
                  placeholder="Optional — leave blank if not decided yet"
                />
                <p className="text-xs text-gray-500 mt-1">
                  For students transferring in from another school. Left blank, transferred students won't be charged until you set this.
                </p>
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <button type="submit" disabled={savingConfig} className="btn-primary flex items-center gap-2">
                  {savingConfig ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {config ? 'Update Amounts' : 'Save Amounts'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* ===== Section 2: Bulk student classification ===== */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900">Student Classification</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          New / Continuing is auto-detected from payment history recorded in this system — so a grade/section with
          un-digitized prior-year records can show up as "all New" even though most students are really Continuing.
          Filter by grade/section below, review, and bulk-correct.
        </p>

        <div className="flex flex-wrap gap-3 mb-3">
          <select
            value={classifyGrade}
            onChange={(e) => { setClassifyGrade(e.target.value); setClassifySection('all'); }}
            className="input-field w-auto"
          >
            <option value="all">All Grades</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </select>

          <select
            value={classifySection}
            onChange={(e) => setClassifySection(e.target.value)}
            className="input-field w-auto"
            disabled={classifyGrade === 'all'}
          >
            <option value="all">All Sections</option>
            {classifySectionOptionsForGrade.map((s) => (
              <option key={s.id} value={s.name}>Section {s.name}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={classifyNameFilter}
              onChange={(e) => setClassifyNameFilter(e.target.value)}
              placeholder="Filter by name or ID within results..."
              className="input-field pl-9"
            />
          </div>
        </div>

        {classifyMessage && (
          <div className={`p-2 rounded-lg flex items-center gap-2 mb-3 text-sm ${
            classifyMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {classifyMessage.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {classifyMessage.text}
          </div>
        )}

        {!selectedYear?.id ? (
          <p className="text-gray-500 text-sm">Select an academic year first.</p>
        ) : classifyLoading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : visibleClassifyStudents.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">No students match this filter.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2 px-1">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleClassifyStudents.length > 0 && visibleClassifyStudents.every((s) => selectedIds.has(s.student_id))}
                  onChange={toggleSelectAllVisible}
                />
                Select all ({visibleClassifyStudents.length})
              </label>
              <span className="text-xs text-gray-500">{selectedIds.size} selected</span>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-2 pl-3 pr-2 w-8"></th>
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 pr-3">Grade / Section</th>
                    <th className="py-2 pr-3">Current Classification</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleClassifyStudents.map((s) => (
                    <tr key={s.student_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pl-3 pr-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.student_id)}
                          onChange={() => toggleSelected(s.student_id)}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <p className="font-medium text-gray-900">{s.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{s.student_id}</p>
                      </td>
                      <td className="py-2 pr-3">Grade {s.grade}{s.section ? ` - ${s.section}` : ''}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.registration_type === 'new' ? 'bg-blue-100 text-blue-700'
                            : s.registration_type === 'continuing' ? 'bg-green-100 text-green-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}>
                          {s.registration_type === 'new' ? 'New'
                            : s.registration_type === 'continuing' ? 'Continuing'
                            : 'Transferred'}
                          {s.is_manual_override && ' (manual)'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                type="button"
                onClick={() => applyBulkClassification('new')}
                disabled={bulkSaving || selectedIds.size === 0}
                className="btn-secondary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {bulkSaving ? <Loader className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Mark as New ({selectedIds.size})
              </button>
              <button
                type="button"
                onClick={() => applyBulkClassification('continuing')}
                disabled={bulkSaving || selectedIds.size === 0}
                className="btn-secondary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {bulkSaving ? <Loader className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                Mark as Continuing ({selectedIds.size})
              </button>
              <button
                type="button"
                onClick={() => applyBulkClassification('transferred')}
                disabled={bulkSaving || selectedIds.size === 0}
                className="btn-secondary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {bulkSaving ? <Loader className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
                Mark as Transferred ({selectedIds.size})
              </button>
            </div>
          </>
        )}
      </div>

      {/* ===== Section 3: Unpaid registration fees ===== */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-gray-900">Unpaid Registration Fees</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Students who still owe {selectedYear?.name || 'this year'}'s registration fee — filter by grade and section.
        </p>

        <div className="flex flex-wrap gap-3 mb-4">
          <select
            value={unpaidGrade}
            onChange={(e) => { setUnpaidGrade(e.target.value); setUnpaidSection('all'); }}
            className="input-field w-auto"
          >
            <option value="all">All Grades</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </select>

          <select
            value={unpaidSection}
            onChange={(e) => setUnpaidSection(e.target.value)}
            className="input-field w-auto"
            disabled={unpaidGrade === 'all'}
          >
            <option value="all">All Sections</option>
            {sectionOptionsForGrade.map((s) => (
              <option key={s.id} value={s.name}>Section {s.name}</option>
            ))}
          </select>
        </div>

        {!selectedYear?.id ? (
          <p className="text-gray-500 text-sm">Select an academic year first.</p>
        ) : unpaidLoading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : !unpaidData ? (
          <p className="text-sm text-red-600">Failed to load. Try again.</p>
        ) : unpaidData.deadline === null ? (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            {unpaidData.message}
          </p>
        ) : unpaidData.students.length === 0 ? (
          <div className="text-center py-6 text-green-700 flex flex-col items-center gap-2">
            <CheckCircle className="h-6 w-6" />
            <p className="text-sm">Every student in this filter has paid registration.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {reminderMessage && (
              <div className={`p-2 rounded-lg flex items-center gap-2 mb-3 text-sm ${
                reminderMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {reminderMessage.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {reminderMessage.text}
              </div>
            )}
            <div className="flex items-center justify-between mb-2 px-1">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={unpaidData.students.length > 0 && unpaidData.students.every((s) => selectedUnpaidIds.has(s.student_id))}
                  onChange={toggleSelectAllUnpaid}
                />
                Select all ({unpaidData.students.length})
              </label>
              <span className="text-xs text-gray-500">{selectedUnpaidIds.size} selected</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pl-1 pr-2 w-8"></th>
                  <th className="py-2 pr-3">Student</th>
                  <th className="py-2 pr-3">Grade / Section</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Amount Owed</th>
                  <th className="py-2 pr-3">Parent Contact</th>
                </tr>
              </thead>
              <tbody>
                {unpaidData.students.map((s) => (
                  <tr key={s.student_id} className="border-b border-gray-100">
                    <td className="py-2 pl-1 pr-2">
                      <input
                        type="checkbox"
                        checked={selectedUnpaidIds.has(s.student_id)}
                        onChange={() => toggleUnpaidSelected(s.student_id)}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <p className="font-medium text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{s.student_id}</p>
                    </td>
                    <td className="py-2 pr-3">Grade {s.grade}{s.section ? ` - ${s.section}` : ''}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.registration_type === 'new' ? 'bg-blue-100 text-blue-700'
                          : s.registration_type === 'continuing' ? 'bg-green-100 text-green-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {s.registration_type === 'new' ? 'New'
                          : s.registration_type === 'continuing' ? 'Continuing'
                          : 'Transferred'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-semibold text-red-600">{s.amount} Birr</td>
                    <td className="py-2 pr-3 text-gray-600">
                      {s.parent_phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {s.parent_phone}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-gray-500">{unpaidData.total_unpaid} student(s) unpaid.</p>
              <button
                type="button"
                onClick={sendRegistrationReminders}
                disabled={sendingReminders || selectedUnpaidIds.size === 0}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
                title="Sends a SEPARATE registration-fee-only SMS + Email — never combined with the monthly reminder."
              >
                {sendingReminders ? <Loader className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                Send Registration Reminders ({selectedUnpaidIds.size})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminRegistrationFees;