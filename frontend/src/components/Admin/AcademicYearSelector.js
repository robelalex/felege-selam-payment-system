// src/components/Admin/AcademicYearSelector.js
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, CheckCircle, Star, X, Plus, ArrowRight } from 'lucide-react';
import { useYear } from '../../context/YearContext';
import api from '../../services/api';

function AcademicYearSelector({ isOpen, onClose }) {
  const { allYears, selectedYear, switchYear, setAsCurrentYear, refreshYears } = useYear();
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newYear, setNewYear] = useState({
    year_ec: '',
    start_date: '',
    end_date: ''
  });

  const handleSetCurrent = async (yearId) => {
    setLoading(true);
    const success = await setAsCurrentYear(yearId);
    if (success) {
      await refreshYears();
    }
    setLoading(false);
  };

  const handleSelectYear = (year) => {
    switchYear(year);
    onClose();
  };

  const handleCreateYear = async () => {
    if (!newYear.year_ec || !newYear.start_date || !newYear.end_date) {
      alert('Please fill all fields');
      return;
    }
    
    setLoading(true);
    try {
      await api.post('/academic-years/', {
        year_ec: parseInt(newYear.year_ec),
        name: `${newYear.year_ec} E.C.`,
        start_date: newYear.start_date,
        end_date: newYear.end_date,
        is_current: false,
        is_active: true
      });
      await refreshYears();
      setShowCreateForm(false);
      setNewYear({ year_ec: '', start_date: '', end_date: '' });
    } catch (err) {
      console.error('Error creating year:', err);
      alert('Failed to create academic year');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-primary-600" />
            <h2 className="text-2xl font-bold text-gray-900">Academic Years</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Current Year Indicator */}
          <div className="mb-6 p-4 bg-primary-50 rounded-xl border border-primary-100">
            <div className="flex items-center gap-2 text-primary-700 mb-2">
              <Star className="h-5 w-5 fill-primary-500" />
              <span className="font-semibold">Current Academic Year</span>
            </div>
            <p className="text-2xl font-bold text-primary-800">
              {selectedYear?.name || selectedYear?.year_ec + ' E.C.' || 'Not set'}
            </p>
          </div>

          {/* Create New Year Button */}
          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full mb-6 p-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-all group"
            >
              <div className="flex items-center justify-center gap-2 text-gray-500 group-hover:text-primary-600">
                <Plus className="h-5 w-5" />
                <span>Create New Academic Year</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          ) : (
            <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Create New Academic Year</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ethiopian Year (e.g., 2020)
                  </label>
                  <input
                    type="number"
                    value={newYear.year_ec}
                    onChange={(e) => setNewYear({ ...newYear, year_ec: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="2020"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={newYear.start_date}
                    onChange={(e) => setNewYear({ ...newYear, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={newYear.end_date}
                    onChange={(e) => setNewYear({ ...newYear, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleCreateYear}
                    disabled={loading}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create Year'}
                  </button>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Academic Years Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {allYears.map((year) => (
              <motion.div
                key={year.id}
                whileHover={{ scale: 1.02 }}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedYear?.id === year.id
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-primary-300 bg-white'
                }`}
                onClick={() => handleSelectYear(year)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-lg text-gray-900">
                    {year.name || `${year.year_ec} E.C.`}
                  </h3>
                  {selectedYear?.id === year.id && (
                    <CheckCircle className="h-5 w-5 text-primary-600" />
                  )}
                </div>
                <div className="space-y-1 text-sm text-gray-500">
                  <p>Start: {new Date(year.start_date).toLocaleDateString()}</p>
                  <p>End: {new Date(year.end_date).toLocaleDateString()}</p>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetCurrent(year.id);
                    }}
                    disabled={year.is_current}
                    className={`text-xs px-3 py-1 rounded-full ${
                      year.is_current
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-primary-100 hover:text-primary-700'
                    }`}
                  >
                    {year.is_current ? 'Current Year' : 'Set as Current'}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>

          {allYears.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No academic years created yet. Click "Create New Academic Year" to start.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default AcademicYearSelector;