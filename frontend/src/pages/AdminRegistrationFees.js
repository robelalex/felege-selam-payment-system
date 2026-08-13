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
  UserCheck, UserPlus, RefreshCw, ShieldCheck
} from 'lucide-react';
import api from '../services/api';
import { useYear } from '../context/YearContext';

function AdminRegistrationFees() {
  const { selectedYear } = useYear();

  // --- Section 1: this year's config -----------------------------------
  const [config, setConfig] = useState(null); // existing RegistrationFeeConfig row, or null
  const [configLoading, setConfigLoading] = useState(true);
  const [configForm, setConfigForm] = useState({ new_student_amount: '', continuing_student_amount: '' });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMessage, setConfigMessage] = useState(null);

  // --- Section 2: per-student override -----------------------------------
  const [allStudents, setAllStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentType, setStudentType] = useState(null); // StudentRegistrationType for selectedStudent
  const [typeLoading, setTypeLoading] = useState(false);
  const [savingType, setSavingType] = useState(false);
  const [typeMessage, setTypeMessage] = useState(null);

  useEffect(() => {
    if (selectedYear?.id) {
      fetchConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchConfig = async () => {
    setConfigLoading(true);
    setConfig(null);
    setConfigForm({ new_student_amount: '', continuing_student_amount: '' });
    try {
      const response = await api.get('/registration-fee-configs/', {
        params: { academic_year_id: selectedYear.id }
      });
      const existing = (response.data.results || response.data)[0] || null;
      if (existing) {
        setConfig(existing);
        setConfigForm({
          new_student_amount: existing.new_student_amount,
          continuing_student_amount: existing.continuing_student_amount
        });
      }
    } catch (err) {
      console.error('Error fetching registration fee config:', err);
    } finally {
      setConfigLoading(false);
    }
  };

  const fetchStudents = async () => {
    setStudentsLoading(true);
    try {
      const savedSchool = localStorage.getItem('selectedSchool');
      const schoolId = savedSchool ? JSON.parse(savedSchool).id : null;
      const response = await api.get('/students/', {
        headers: schoolId ? { 'X-School-ID': schoolId } : {}
      });
      const students = (response.data.results || response.data || [])
        .filter((s) => s.status === 'active');
      setAllStudents(students);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setStudentsLoading(false);
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
      continuing_student_amount: parseFloat(configForm.continuing_student_amount)
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

  const filteredStudents = searchTerm.trim().length === 0
    ? []
    : allStudents.filter((s) => {
        const term = searchTerm.toLowerCase();
        return (
          s.student_id?.toLowerCase().includes(term) ||
          `${s.first_name} ${s.last_name}`.toLowerCase().includes(term)
        );
      }).slice(0, 10);

  const selectStudent = async (student) => {
    setSelectedStudent(student);
    setSearchTerm('');
    setTypeMessage(null);
    if (!selectedYear?.id) return;
    setTypeLoading(true);
    try {
      const response = await api.get('/student-registration-types/for-student/', {
        params: { student_id: student.student_id, academic_year_id: selectedYear.id }
      });
      setStudentType(response.data);
    } catch (err) {
      console.error('Error fetching registration type:', err);
      setStudentType(null);
    } finally {
      setTypeLoading(false);
    }
  };

  const setType = async (registrationType) => {
    if (!selectedStudent || !selectedYear?.id) return;
    setSavingType(true);
    setTypeMessage(null);
    try {
      const response = await api.post('/student-registration-types/set-type/', {
        student_id: selectedStudent.student_id,
        academic_year_id: selectedYear.id,
        registration_type: registrationType
      });
      setStudentType(response.data);
      setTypeMessage({ type: 'success', text: `${selectedStudent.first_name} is now billed as ${registrationType === 'new' ? 'New Student' : 'Continuing/Senior Student'}.` });
    } catch (err) {
      console.error('Error setting registration type:', err.response?.data);
      setTypeMessage({ type: 'error', text: err.response?.data?.error || 'Failed to update registration type.' });
    } finally {
      setSavingType(false);
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

      {/* ===== Section 2: Per-student new/continuing override ===== */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-5 w-5 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900">Student Classification</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          New vs. continuing is detected automatically from payment history. Override a student here if that's wrong —
          e.g. a transfer student who's new to this school but has payment history elsewhere.
        </p>

        <div className="relative mb-4">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by student name or ID..."
            className="input-field pl-9"
            disabled={studentsLoading}
          />
          {searchTerm.trim().length > 0 && filteredStudents.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {filteredStudents.map((s) => (
                <button
                  key={s.student_id}
                  type="button"
                  onClick={() => selectStudent(s)}
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center justify-between"
                >
                  <span className="font-medium text-gray-900">{s.first_name} {s.last_name}</span>
                  <span className="text-xs text-gray-500 font-mono">{s.student_id} · Grade {s.grade}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedStudent && (
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-gray-900">{selectedStudent.first_name} {selectedStudent.last_name}</p>
                <p className="text-xs text-gray-500 font-mono">{selectedStudent.student_id} · Grade {selectedStudent.grade}</p>
              </div>
              {typeLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin text-gray-400" />
              ) : studentType && (
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                  studentType.registration_type === 'new' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                }`}>
                  {studentType.registration_type_display}
                  {studentType.is_manual_override && ' (manual)'}
                </span>
              )}
            </div>

            {typeMessage && (
              <div className={`p-2 rounded-lg flex items-center gap-2 mb-3 text-sm ${
                typeMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {typeMessage.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {typeMessage.text}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('new')}
                disabled={savingType || studentType?.registration_type === 'new'}
                className="btn-secondary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" /> Mark as New Student
              </button>
              <button
                type="button"
                onClick={() => setType('continuing')}
                disabled={savingType || studentType?.registration_type === 'continuing'}
                className="btn-secondary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <UserCheck className="h-4 w-4" /> Mark as Continuing/Senior
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminRegistrationFees;
