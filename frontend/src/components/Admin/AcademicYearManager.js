// frontend/src/components/Admin/AcademicYearManager.js
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar,
  Plus,
  CheckCircle,
  AlertCircle,
  Loader,
  TrendingUp,
  //Users,
  //CreditCard,
  ArrowRight,
  //RefreshCw,
  //X
} from 'lucide-react';
import academicYearService from '../../services/academicYearService';

function AcademicYearManager() {
  const [years, setYears] = useState([]);
  const [currentYear, setCurrentYear] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

useEffect(() => {
  fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [yearsData, currentData] = await Promise.all([
        academicYearService.getAllYears(),
        academicYearService.getCurrentYear().catch(() => null)
      ]);
      setYears(yearsData);
      setCurrentYear(currentData);
    } catch (err) {
      showMessage('error', 'Failed to load academic years');
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
      showMessage('success', 'Current academic year updated');
    } catch (err) {
      showMessage('error', 'Failed to update current year');
    } finally {
      setProcessing(false);
    }
  };

  const handlePromoteStudents = async (yearId) => {
    if (!window.confirm('Are you sure you want to promote all students to the next grade? This action cannot be undone.')) {
      return;
    }

    setProcessing(true);
    try {
      const result = await academicYearService.promoteStudents(yearId);
      showMessage('success', `Successfully promoted ${result.log.students_promoted} students`);
      await fetchData();
    } catch (err) {
      showMessage('error', err.response?.data?.error || 'Failed to promote students');
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateNextYear = async () => {
    setProcessing(true);
    try {
      await academicYearService.createNextYear();
      await fetchData();
      showMessage('success', 'Next academic year created successfully');
    } catch (err) {
      showMessage('error', err.response?.data?.error || 'Failed to create next year');
    } finally {
      setProcessing(false);
    }
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Academic Year Management</h1>
        <button
          onClick={handleCreateNextYear}
          disabled={processing}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Create Next Year
        </button>
      </div>

      {/* Current Year Card */}
      {currentYear && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-xl shadow-lg p-6 text-white"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-full">
                <Calendar className="h-8 w-8" />
              </div>
              <div>
                <p className="text-primary-100 text-sm">Current Academic Year</p>
                <h2 className="text-3xl font-bold">{currentYear.name}</h2>
                <p className="text-primary-100 mt-1">
                  {new Date(currentYear.start_date).toLocaleDateString()} - {new Date(currentYear.end_date).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handlePromoteStudents(currentYear.id)}
                disabled={processing}
                className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
              >
                <TrendingUp className="h-4 w-4" />
                Promote Students
              </button>
            </div>
          </div>
        </motion.div>
      )}

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

      {/* Years Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {years.map((year) => (
          <motion.div
            key={year.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`bg-white rounded-xl shadow-lg overflow-hidden border-2 transition-all ${
              year.is_current ? 'border-primary-500' : 'border-transparent'
            }`}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">{year.name}</h3>
                {year.is_current && (
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
                      <span className="font-medium">{year.statistics.total_payments} Birr</span>
                    </div>
                  </>
                )}
              </div>

              {!year.is_current && (
                <button
                  onClick={() => handleSetCurrent(year.id)}
                  disabled={processing}
                  className="w-full btn-outline flex items-center justify-center gap-2"
                >
                  Set as Current
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default AcademicYearManager;