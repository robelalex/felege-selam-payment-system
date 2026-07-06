// src/pages/AdminSections.js
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Trash2,
  RefreshCw,
  Layers,
  AlertCircle,
  CheckCircle,
  X, 
  Loader
} from 'lucide-react';
import api from '../services/api';

const ALL_GRADES = Array.from({ length: 12 }, (_, i) => i + 1);
const ALL_LETTERS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)); // A-Z

function AdminSections() {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gradeFilter, setGradeFilter] = useState('all');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Add-section form state
  const [newGrade, setNewGrade] = useState(1);
  const [newLetter, setNewLetter] = useState('A');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchSections();
  }, []);

  const fetchSections = async () => {
    setLoading(true);
    try {
      const response = await api.get('/sections/');
      setSections(response.data);
    } catch (err) {
      console.error('Error fetching sections:', err);
      setError('Failed to load sections');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);

    try {
      await api.post('/sections/', {
        grade: parseInt(newGrade),
        name: newLetter
      });
      setSuccess(`Section ${newLetter} created for Grade ${newGrade}`);
      fetchSections();
    } catch (err) {
      console.error('Error creating section:', err);
      const detail = err.response?.data?.name || err.response?.data?.error || err.response?.data?.non_field_errors;
      setError(
        Array.isArray(detail) ? detail.join(', ') :
        detail || `Section ${newLetter} may already exist for Grade ${newGrade}`
      );
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (section) => {
    if (!window.confirm(`Delete Section ${section.name} from Grade ${section.grade}? Existing students keep their section name — this only removes it from the dropdown.`)) {
      return;
    }
    try {
      await api.delete(`/sections/${section.id}/`);
      fetchSections();
    } catch (err) {
      console.error('Error deleting section:', err);
      setError('Failed to delete section');
    }
  };

  const filteredSections = sections.filter(s =>
    gradeFilter === 'all' || s.grade === parseInt(gradeFilter)
  );

  const sectionsByGrade = ALL_GRADES.reduce((acc, grade) => {
    acc[grade] = filteredSections.filter(s => s.grade === grade);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Section Management</h1>
          <p className="text-sm md:text-base text-gray-600 mt-1">
            Create and manage sections (A-Z) for each grade
          </p>
        </div>
        <button
          onClick={fetchSections}
          className="btn-outline flex items-center gap-2 tap-target"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Messages */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-red-50 border-l-4 border-red-500 p-4 rounded flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
            <button onClick={() => setError('')}>
              <X className="h-4 w-4 text-red-500" />
            </button>
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-green-50 border-l-4 border-green-500 p-4 rounded flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <p className="text-green-700 text-sm">{success}</p>
            </div>
            <button onClick={() => setSuccess('')}>
              <X className="h-4 w-4 text-green-500" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Section Form */}
      <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5 text-primary-600" />
          Create New Section
        </h2>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row items-end gap-3">
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
            <select
              value={newGrade}
              onChange={(e) => setNewGrade(e.target.value)}
              className="input-field"
            >
              <optgroup label="🏫 Elementary">
                {[1,2,3,4,5,6,7,8].map(g => (
                  <option key={g} value={g}>Grade {g}</option>
                ))}
              </optgroup>
              <optgroup label="🎓 High School">
                {[9,10,11,12].map(g => (
                  <option key={g} value={g}>Grade {g}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-medium text-gray-700 mb-1">Section Letter</label>
            <select
              value={newLetter}
              onChange={(e) => setNewLetter(e.target.value)}
              className="input-field"
            >
              {ALL_LETTERS.map(letter => (
                <option key={letter} value={letter}>{letter}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="btn-primary flex items-center gap-2 tap-target whitespace-nowrap"
          >
            {creating ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Section
          </button>
        </form>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Grade</label>
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="input-field sm:w-64"
        >
          <option value="all">All Grades</option>
          <optgroup label="🏫 Elementary">
            {[1,2,3,4,5,6,7,8].map(g => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </optgroup>
          <optgroup label="🎓 High School">
            {[9,10,11,12].map(g => (
              <option key={g} value={g}>Grade {g}</option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Sections grouped by grade */}
      <div className="space-y-4">
        {ALL_GRADES.filter(grade => gradeFilter === 'all' || grade === parseInt(gradeFilter)).map(grade => (
          <div key={grade} className="bg-white rounded-xl shadow-lg p-4 md:p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary-600" />
              Grade {grade}
              <span className="text-xs text-gray-400 font-normal">
                {grade <= 8 ? '🏫 Elementary' : '🎓 High School'}
              </span>
            </h3>

            {sectionsByGrade[grade]?.length === 0 ? (
              <p className="text-sm text-gray-400">No sections created yet for this grade.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sectionsByGrade[grade]?.map(section => (
                  <div
                    key={section.id}
                    className="flex items-center gap-2 bg-primary-50 border border-primary-100 rounded-lg px-3 py-1.5"
                  >
                    <span className="text-sm font-medium text-primary-700">Section {section.name}</span>
                    <button
                      onClick={() => handleDelete(section)}
                      className="text-red-500 hover:text-red-700"
                      title="Delete section"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default AdminSections;