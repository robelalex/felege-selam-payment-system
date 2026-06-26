// frontend/src/components/Admin/AcademicYearManager.js - SELECTIVE PROMOTION
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, Plus, CheckCircle, AlertCircle, Loader, TrendingUp, 
  ArrowRight, Trash2, Archive, RefreshCw, Eye, History, 
  AlertTriangle, XCircle, Database, X
} from 'lucide-react';
import academicYearService from '../../services/academicYearService';
import { useYear } from '../../context/YearContext';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

function AcademicYearManager() {
  const [years, setYears] = useState([]);
  const [archivedYears, setArchivedYears] = useState([]);
  const [currentYear, setCurrentYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showArchived, setShowArchived] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(null);
  
  // ✅ NEW: Selective Promotion State
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteYearId, setPromoteYearId] = useState(null);
  const [studentsForPromotion, setStudentsForPromotion] = useState([]);
  const [selectedForPromotion, setSelectedForPromotion] = useState([]);
  const [nextYearOptions, setNextYearOptions] = useState([]);
  const [selectedNextYear, setSelectedNextYear] = useState(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  
  const { refreshYears, switchYear } = useYear();
  const { getAuthHeader } = useAuth();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [yearsData, archivedData, currentData] = await Promise.all([
        academicYearService.getAllYears(),
        academicYearService.getArchivedYears().catch(() => []),
        academicYearService.getCurrentYear().catch(() => null)
      ]);
      setYears(yearsData);
      setArchivedYears(archivedData);
      setCurrentYear(currentData);
    } catch (err) {
      showMessage('error', 'Failed to load academic years');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const handleSetCurrent = async (yearId) => {
    setProcessing(true);
    try {
      await academicYearService.setCurrentYear(yearId);
      await fetchData();
      await refreshYears();
      
      const newCurrentYear = years.find(y => y.id === yearId);
      if (newCurrentYear) {
        switchYear(newCurrentYear);
      }
      
      showMessage('success', 'Current academic year updated');
    } catch (err) {
      showMessage('error', 'Failed to update current year');
    } finally {
      setProcessing(false);
    }
  };

  // ✅ REPLACED: Blind promote → Open selective modal
  const handleOpenPromoteModal = async (yearId) => {
    setPromoteYearId(yearId);
    setShowPromoteModal(true);
    setLoadingStudents(true);
    setSelectedForPromotion([]);
    
    try {
      // Fetch all active students for this year
      const response = await api.get(`/students/?academic_year_id=${yearId}`, {
        headers: getAuthHeader()
      });
      setStudentsForPromotion(response.data);
      
      // Default: select ALL students for promotion
      setSelectedForPromotion(response.data.map(s => s.id));
      
      // Fetch available next years
      const yearsResponse = await api.get('/academic-years/', {
        headers: getAuthHeader()
      });
      const allYears = yearsResponse.data.results || yearsResponse.data;
      const currentYearObj = allYears.find(y => y.id === yearId);
      
      // Filter to only years AFTER the current year
      const nextYears = allYears
        .filter(y => y.year_ec > currentYearObj?.year_ec && !y.is_archived)
        .sort((a, b) => a.year_ec - b.year_ec);
      
      setNextYearOptions(nextYears);
      if (nextYears.length > 0) {
        setSelectedNextYear(nextYears[0].id);
      }
    } catch (err) {
      console.error('Error loading students for promotion:', err);
      showMessage('error', 'Failed to load students');
    } finally {
      setLoadingStudents(false);
    }
  };

  // ✅ NEW: Execute selective promotion
  const handleExecuteSelectivePromote = async () => {
    if (!selectedNextYear) {
      showMessage('error', 'Please select the next academic year');
      return;
    }
    
    const repeaterCount = studentsForPromotion.length - selectedForPromotion.length;
    if (!window.confirm(
      `⚠️ CONFIRM SELECTIVE PROMOTION:\n\n` +
      `✅ ${selectedForPromotion.length} student(s) will be PROMOTED (grade +1)\n` +
      `🔄 ${repeaterCount} student(s) will REPEAT (same grade)\n` +
      `📅 All students move to next academic year\n` +
      `🔒 Student IDs remain unchanged\n\n` +
      `This action cannot be undone. Continue?`
    )) {
      return;
    }

    setProcessing(true);
    try {
      const response = await api.post('/students/selective_promote/', {
        promote_ids: selectedForPromotion,
        current_year_id: promoteYearId,
        next_year_id: selectedNextYear
      }, { headers: getAuthHeader() });
      
      const result = response.data;
      showMessage('success', 
        `✅ Promoted: ${result.promoted} | 🔄 Repeated: ${result.repeated} | 🎓 Graduated: ${result.graduated}`
      );
      
      setShowPromoteModal(false);
      await fetchData();
    } catch (err) {
      showMessage('error', err.response?.data?.error || 'Failed to promote students');
    } finally {
      setProcessing(false);
    }
  };

  const togglePromoteStudent = (studentId) => {
    setSelectedForPromotion(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const selectAllForPromotion = () => {
    if (selectedForPromotion.length === studentsForPromotion.length) {
      setSelectedForPromotion([]);
    } else {
      setSelectedForPromotion(studentsForPromotion.map(s => s.id));
    }
  };

  // ✅ NEW: Handle Create Custom Year (user inputs the year)
  const handleCreateCustomYear = async () => {
    const yearEc = prompt('Enter Ethiopian Calendar year (e.g., 2018):');
    if (!yearEc) return;
    
    const yearNum = parseInt(yearEc);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      showMessage('error', 'Invalid year. Please enter a year between 2000 and 2100');
      return;
    }
    
    // Check if year already exists
    if (years.some(y => y.year_ec === yearNum)) {
      showMessage('error', `Year ${yearNum} E.C. already exists!`);
      return;
    }
    
    setProcessing(true);
    try {
      const yearData = {
        year_ec: yearNum,
        name: `${yearNum} E.C.`,
        start_date: `${yearNum + 7}-09-11`,
        end_date: `${yearNum + 8}-07-10`,
        is_current: false,
        is_active: true
      };
      
      console.log('Creating custom year:', yearData);
      
      await academicYearService.createYear(yearData);
      await fetchData();
      await refreshYears();
      showMessage('success', `Academic year ${yearNum} E.C. created successfully`);
    } catch (err) {
      console.error('Error creating year:', err);
      showMessage('error', err.response?.data?.error || 'Failed to create year');
    } finally {
      setProcessing(false);
    }
  };

  // ✅ Handle Archive (Soft Delete)
  const handleArchive = async (yearId, yearName) => {
    if (!window.confirm(`🗄️ Are you sure you want to archive "${yearName}"?\n\nThe year will be hidden but can be restored later.`)) {
      setShowArchiveConfirm(null);
      return;
    }

    setProcessing(true);
    try {
      await academicYearService.archiveYear(yearId);
      await fetchData();
      showMessage('success', `📦 Academic year "${yearName}" has been archived`);
    } catch (err) {
      showMessage('error', err.response?.data?.error || 'Failed to archive year');
    } finally {
      setProcessing(false);
      setShowArchiveConfirm(null);
    }
  };

  // ✅ Handle Restore
  const handleRestore = async (yearId, yearName) => {
    setProcessing(true);
    try {
      await academicYearService.restoreYear(yearId);
      await fetchData();
      showMessage('success', `🔄 Academic year "${yearName}" has been restored`);
    } catch (err) {
      showMessage('error', err.response?.data?.error || 'Failed to restore year');
    } finally {
      setProcessing(false);
    }
  };

  // ✅ Handle Permanent Delete
  const handlePermanentDelete = async (yearId, yearName) => {
    if (!window.confirm(`⚠️⚠️⚠️ DANGER: You are about to PERMANENTLY DELETE "${yearName}"!\n\nThis will also delete ALL data associated with this year including:\n- Student enrollments\n- Payment records\n- Attendance records\n- All related reports\n\n⚠️ THIS ACTION CANNOT BE UNDONE! ⚠️\n\nType "DELETE" to confirm:`)) {
      setShowDeleteConfirm(null);
      return;
    }
    
    const confirmText = prompt(`Type "DELETE" to permanently delete "${yearName}":`);
    if (confirmText !== 'DELETE') {
      showMessage('error', 'Deletion cancelled - confirmation text did not match');
      setShowDeleteConfirm(null);
      return;
    }

    setProcessing(true);
    try {
      await academicYearService.deleteYear(yearId);
      await fetchData();
      showMessage('success', `🗑️ Academic year "${yearName}" has been permanently deleted`);
    } catch (err) {
      showMessage('error', err.response?.data?.error || 'Failed to delete year');
    } finally {
      setProcessing(false);
      setShowDeleteConfirm(null);
    }
  };

  const handleCreateNextYear = async () => {
    setProcessing(true);
    try {
      await academicYearService.createNextYear();
      await fetchData();
      await refreshYears();
      showMessage('success', 'Next academic year created successfully');
    } catch (err) {
      showMessage('error', err.response?.data?.error || 'Failed to create next year');
    } finally {
      setProcessing(false);
    }
  };

  // Year Card Component
  const YearCard = ({ year, isArchived = false }) => {
    const isCurrent = year.is_current && !isArchived;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`bg-white rounded-xl shadow-lg overflow-hidden border-2 transition-all ${
          isCurrent ? 'border-primary-500' : isArchived ? 'border-gray-300 opacity-75' : 'border-transparent'
        }`}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900">{year.name}</h3>
              {isArchived && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full">
                  <Archive className="h-3 w-3" />
                  Archived
                </span>
              )}
            </div>
            {isCurrent && (
              <span className="px-2 py-1 bg-primary-100 text-primary-600 text-xs rounded-full">
                Current
              </span>
            )}
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Start Date:</span>
              <span className="font-medium">{new Date(year.start_date).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">End Date:</span>
              <span className="font-medium">{new Date(year.end_date).toLocaleDateString()}</span>
            </div>
            {year.statistics && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Students:</span>
                  <span className="font-medium">{year.statistics.total_students}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Payments:</span>
                  <span className="font-medium">{year.statistics.total_payments.toLocaleString()} Birr</span>
                </div>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            {!isArchived && !isCurrent && (
              <button
                onClick={() => handleSetCurrent(year.id)}
                disabled={processing}
                className="w-full btn-outline flex items-center justify-center gap-2"
              >
                Set as Current
                <ArrowRight className="h-4 w-4" />
              </button>
            )}

            {/* ✅ UPDATED: Opens selective modal instead of blind promote */}
            {!isArchived && isCurrent && (
              <button
                onClick={() => handleOpenPromoteModal(year.id)}
                disabled={processing}
                className="w-full bg-purple-600 text-white py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
              >
                <TrendingUp className="h-4 w-4" />
                Promote Students
              </button>
            )}

            <div className="flex gap-2">
              {!isArchived ? (
                <>
                  <button
                    onClick={() => setShowArchiveConfirm(year)}
                    disabled={processing}
                    className="flex-1 btn-secondary flex items-center justify-center gap-1 text-sm py-2"
                    title="Archive (Soft Delete)"
                  >
                    <Archive className="h-4 w-4" />
                    Archive
                  </button>
                  {!isCurrent && (
                    <button
                      onClick={() => setShowDeleteConfirm(year)}
                      disabled={processing}
                      className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-1 text-sm"
                      title="Permanently Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => handleRestore(year.id, year.name)}
                  disabled={processing}
                  className="w-full btn-primary flex items-center justify-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Restore Year
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Archive Confirmation Modal */}
        {showArchiveConfirm && showArchiveConfirm.id === year.id && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-yellow-100 rounded-full">
                  <Archive className="h-6 w-6 text-yellow-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Archive Academic Year</h3>
              </div>
              <p className="text-gray-600 mb-4">
                Are you sure you want to archive "{year.name}"? It will be hidden but can be restored later.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowArchiveConfirm(null)} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button onClick={() => handleArchive(year.id, year.name)} className="flex-1 bg-yellow-600 text-white py-2 rounded-lg hover:bg-yellow-700">
                  Archive
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && showDeleteConfirm.id === year.id && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-full">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-red-600">⚠️ DANGER ZONE ⚠️</h3>
              </div>
              <p className="text-gray-700 mb-3">
                You are about to <span className="font-bold text-red-600">PERMANENTLY DELETE</span> "{year.name}".
              </p>
              <div className="bg-red-50 p-3 rounded-lg mb-4">
                <p className="text-sm text-red-700">This will also delete:</p>
                <ul className="text-xs text-red-600 mt-1 space-y-1">
                  <li>• All student enrollments for this year</li>
                  <li>• All payment records</li>
                  <li>• All attendance records</li>
                  <li>• All reports and statistics</li>
                </ul>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Type <span className="font-bold">DELETE</span> to confirm:
              </p>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 btn-secondary">
                  Cancel
                </button>
                <button onClick={() => handlePermanentDelete(year.id, year.name)} className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700">
                  Delete Permanently
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Academic Year Management</h1>
          <p className="text-gray-500 text-sm mt-1">Manage school years, promotions, and archives</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="btn-outline flex items-center gap-2"
          >
            <History className="h-4 w-4" />
            {showArchived ? 'Hide Archived' : `Show Archived (${archivedYears.length})`}
          </button>
          <button
            onClick={handleCreateCustomYear}
            disabled={processing}
            className="btn-outline flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Year
          </button>
          <button
            onClick={handleCreateNextYear}
            disabled={processing}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Next Year
          </button>
        </div>
      </div>

      {/* Message */}
      <AnimatePresence>
        {message.text && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
          >
            <div className="flex items-center gap-2">
              {message.type === 'success' ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
              <p>{message.text}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current Year Banner */}
      {currentYear && (
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-xl shadow-lg p-4 md:p-6 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-2 md:p-3 bg-white/20 rounded-full">
                <Calendar className="h-6 w-6 md:h-8 md:w-8" />
              </div>
              <div>
                <p className="text-primary-100 text-xs md:text-sm">Current Academic Year</p>
                <h2 className="text-xl md:text-3xl font-bold">{currentYear.name}</h2>
                <p className="text-primary-100 text-xs md:text-sm mt-1">
                  {new Date(currentYear.start_date).toLocaleDateString()} - {new Date(currentYear.end_date).toLocaleDateString()}
                </p>
              </div>
            </div>
            {/* ✅ UPDATED: Opens selective modal */}
            <button
              onClick={() => handleOpenPromoteModal(currentYear.id)}
              disabled={processing}
              className="bg-white/20 hover:bg-white/30 px-3 md:px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm md:text-base"
            >
              <TrendingUp className="h-4 w-4" />
              Promote Students
            </button>
          </div>
        </div>
      )}

      {/* Active Years Grid */}
      {years.filter(y => !y.is_archived).length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Database className="h-5 w-5 text-green-600" />
            Active Years
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {years.filter(y => !y.is_archived).map((year) => (
              <YearCard key={year.id} year={year} isArchived={false} />
            ))}
          </div>
        </div>
      )}

      {/* Archived Years Section */}
      {showArchived && archivedYears.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Archive className="h-5 w-5 text-gray-500" />
            Archived Years
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {archivedYears.map((year) => (
              <YearCard key={year.id} year={year} isArchived={true} />
            ))}
          </div>
        </div>
      )}

      {/* ✅ NEW: Selective Promotion Modal */}
      {showPromoteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">🎓 Selective Student Promotion</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Choose which students advance and which repeat. Student IDs stay constant.
                </p>
              </div>
              <button onClick={() => setShowPromoteModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="h-6 w-6 text-gray-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Next Year Selector */}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                <label className="block text-sm font-semibold text-blue-800 mb-2">
                  📅 Promote to Academic Year:
                </label>
                <select
                  value={selectedNextYear || ''}
                  onChange={(e) => setSelectedNextYear(parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select next academic year...</option>
                  {nextYearOptions.map(y => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </select>
                {nextYearOptions.length === 0 && (
                  <p className="text-xs text-red-600 mt-2">
                    ⚠️ No future academic years found. Please create the next year first.
                  </p>
                )}
              </div>

              {/* Student Selection */}
              {loadingStudents ? (
                <div className="flex items-center justify-center py-12">
                  <Loader className="h-8 w-8 animate-spin text-primary-600" />
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <button
                      onClick={selectAllForPromotion}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {selectedForPromotion.length === studentsForPromotion.length
                        ? 'Deselect All' : 'Select All for Promotion'}
                    </button>
                    <span className="text-sm text-gray-600">
                      ✅ {selectedForPromotion.length} promoted | 🔄 {studentsForPromotion.length - selectedForPromotion.length} repeating
                    </span>
                  </div>

                  <div className="border rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left">
                            <input
                              type="checkbox"
                              checked={selectedForPromotion.length === studentsForPromotion.length && studentsForPromotion.length > 0}
                              onChange={selectAllForPromotion}
                              className="rounded text-primary-600"
                            />
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Student</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">ID</th>
                          <th className="px-4 py-3 text-center font-medium text-gray-600">Grade</th>
                          <th className="px-4 py-3 text-center font-medium text-gray-600">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {studentsForPromotion.map((student) => {
                          const isPromoted = selectedForPromotion.includes(student.id);
                          return (
                            <tr
                              key={student.id}
                              className={`hover:bg-gray-50 cursor-pointer ${!isPromoted ? 'bg-yellow-50/50' : ''}`}
                              onClick={() => togglePromoteStudent(student.id)}
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={isPromoted}
                                  onChange={() => togglePromoteStudent(student.id)}
                                  className="rounded text-primary-600"
                                />
                              </td>
                              <td className="px-4 py-3 font-medium text-gray-900">
                                {student.first_name} {student.last_name}
                              </td>
                              <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                                {student.student_id}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                                  Grade {student.grade}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isPromoted ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                    <TrendingUp className="h-3 w-3" /> Promote
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                                    <RefreshCw className="h-3 w-3" /> Repeat
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {studentsForPromotion.length === 0 && (
                      <div className="p-8 text-center text-gray-500">
                        No active students found for this academic year.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => setShowPromoteModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteSelectivePromote}
                disabled={processing || !selectedNextYear || studentsForPromotion.length === 0}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {processing ? <Loader className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
                Confirm Promotion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {years.filter(y => !y.is_archived).length === 0 && archivedYears.length === 0 && (
        <div className="bg-white rounded-xl shadow-lg p-12 text-center">
          <Calendar className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Academic Years</h3>
          <p className="text-gray-500 mb-4">Create your first academic year to get started.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={handleCreateCustomYear} className="btn-outline">
              Create Year
            </button>
            <button onClick={handleCreateNextYear} className="btn-primary">
              Create Next Year
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AcademicYearManager;