// src/pages/AdminDeadlines.js
import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Calendar, DollarSign, RefreshCw, Loader, CheckCircle, XCircle, GraduationCap } from 'lucide-react';
import api from '../services/api';
import { useYear } from '../context/YearContext';

function AdminDeadlines() {
  const [deadlines, setDeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState(null);
  const [formData, setFormData] = useState({
    month: '',
    amount: '',
    due_date: '',
    academic_year: '',
    is_active: true,
    grade: ''  // ✅ NEW: Grade field
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const { selectedYear } = useYear();

  const months = [
    'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
    'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'
  ];

  // ✅ Grades array for dropdown
  const grades = [1, 2, 3, 4, 5, 6, 7, 8];

  useEffect(() => {
    fetchDeadlines();
  }, [selectedYear]);

  const fetchDeadlines = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedYear?.id) {
        params.append('academic_year_id', selectedYear.id);
      }
      const response = await api.get(`/deadlines/active_deadlines/?${params}`);
      setDeadlines(response.data);
    } catch (err) {
      console.error('Error fetching deadlines:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      // Get school ID from localStorage
      const savedSchool = localStorage.getItem('selectedSchool');
      let schoolId = null;
      let schoolData = null;
      
      if (savedSchool) {
        schoolData = JSON.parse(savedSchool);
        schoolId = schoolData.id;
      }

      // Prepare data in the format backend expects
      const monthNumber = months.indexOf(formData.month) + 1;
      
      const data = {
        month: monthNumber,
        amount: parseFloat(formData.amount),
        academic_year: selectedYear?.name,
        is_active: formData.is_active,
        due_date: formData.due_date || null,
        school: schoolId,
        grade: formData.grade ? parseInt(formData.grade) : null  // ✅ NEW: Send grade
      };

      console.log('📤 Sending deadline data:', data);

      const config = {
        headers: {}
      };
      
      if (schoolId) {
        config.headers['X-School-ID'] = schoolId;
      }

      if (editingDeadline) {
        await api.put(`/deadlines/${editingDeadline.id}/`, data, config);
        setMessage({ type: 'success', text: 'Deadline updated successfully!' });
      } else {
        await api.post('/deadlines/', data, config);
        setMessage({ type: 'success', text: 'Deadline created successfully!' });
      }

      setShowModal(false);
      resetForm();
      fetchDeadlines();
    } catch (err) {
      console.error('Error saving deadline:', err.response?.data);
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.error || err.response?.data?.message || 'Failed to save deadline' 
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this deadline?')) {
      try {
        await api.delete(`/deadlines/${id}/`);
        fetchDeadlines();
        setMessage({ type: 'success', text: 'Deadline deleted successfully!' });
      } catch (err) {
        setMessage({ type: 'error', text: 'Failed to delete deadline' });
      }
    }
  };

  const resetForm = () => {
    setFormData({ 
      month: '', 
      amount: '', 
      due_date: '', 
      academic_year: '', 
      is_active: true,
      grade: ''  // ✅ Reset grade
    });
    setEditingDeadline(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (deadline) => {
    setEditingDeadline(deadline);
    setFormData({
      month: months[deadline.month - 1],
      amount: deadline.amount,
      due_date: deadline.due_date?.split('T')[0] || '',
      academic_year: deadline.academic_year,
      is_active: deadline.is_active,
      grade: deadline.grade || ''  // ✅ NEW: Load existing grade
    });
    setShowModal(true);
  };

  // ✅ Helper to get grade display text
  const getGradeDisplay = (deadline) => {
    if (deadline.grade) {
      return `Grade ${deadline.grade}`;
    }
    return 'All Grades';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Payment Deadlines</h1>
          <p className="text-gray-600 mt-1">
            Manage monthly payment deadlines for {selectedYear?.name || 'academic year'}
          </p>
        </div>
        <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Deadline
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grade</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Academic Year</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {deadlines.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                    No payment deadlines created yet. Click "Add Deadline" to start.
                  </td>
                </tr>
              ) : (
                deadlines.map((deadline) => (
                  <tr key={deadline.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {months[deadline.month - 1]}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        deadline.grade ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <GraduationCap className="h-3 w-3" />
                        {getGradeDisplay(deadline)}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {parseFloat(deadline.amount).toLocaleString()} Birr
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {deadline.due_date ? new Date(deadline.due_date).toLocaleDateString() : 'Not set'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{deadline.academic_year}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        deadline.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {deadline.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <button onClick={() => openEditModal(deadline)} className="text-blue-600 hover:text-blue-800">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(deadline.id)} className="text-red-600 hover:text-red-800">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Create/Edit */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {editingDeadline ? 'Edit Deadline' : 'Create New Deadline'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Month *</label>
                  <select
                    value={formData.month}
                    onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                    className="input-field"
                    required
                  >
                    <option value="">Select Month</option>
                    {months.map((month) => (
                      <option key={month} value={month}>{month}</option>
                    ))}
                  </select>
                </div>

                {/* ✅ NEW: Grade Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grade (Optional)</label>
                  <select
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    className="input-field"
                  >
                    <option value="">All Grades</option>
                    {grades.map((grade) => (
                      <option key={grade} value={grade}>Grade {grade}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Leave blank to apply this deadline to all grades
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (ETB) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="input-field"
                    placeholder="e.g., 2000"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting} className="btn-primary">
                    {submitting ? <Loader className="h-4 w-4 animate-spin" /> : (editingDeadline ? 'Update' : 'Create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDeadlines;