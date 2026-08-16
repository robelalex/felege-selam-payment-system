// src/components/Admin/StaffRegistrationForm.js
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Save } from 'lucide-react';
import api from '../../services/api';
import { getMediaUrl } from '../../utils/imageUrl';

// ✅ Jimma item 5 — HR: matches StaffMember.SALUTATION_CHOICES on the backend.
const SALUTATION_OPTIONS = [
  { value: '', label: '—' },
  { value: 'mr', label: 'Mr.' },
  { value: 'mrs', label: 'Mrs.' },
  { value: 'ms', label: 'Ms.' },
  { value: 'dr', label: 'Dr.' },
];

const ROLE_OPTIONS = [
  { value: 'teacher', label: 'Teacher' },
  { value: 'school_admin', label: 'School Admin' },
  { value: 'registrar', label: 'Registrar' },
  { value: 'accountant', label: 'Accountant / Payment Manager' },
  { value: 'librarian', label: 'Librarian' },
  { value: 'reporting_manager', label: 'Reporting Manager' },
  { value: 'reminder_manager', label: 'Reminder Manager' },
  { value: 'other', label: 'Other Staff' },
];

const StaffRegistrationForm = ({ editStaff, onClose, onSaved }) => {
  const [formData, setFormData] = useState({
    salutation: editStaff?.salutation || '',
    first_name: editStaff?.first_name || '',
    last_name: editStaff?.last_name || '',
    role: editStaff?.role || 'teacher',
    phone: editStaff?.phone || '',
    email: editStaff?.email || '',
    national_id: editStaff?.national_id || '',
    hire_date: editStaff?.hire_date || new Date().toISOString().slice(0, 10),
    base_salary: editStaff?.base_salary || '',
    status: editStaff?.status || 'active',
  });

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(editStaff?.photo ? getMediaUrl(editStaff.photo) : null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      setError('Photo must be a JPG or PNG image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Photo must be smaller than 5MB');
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.first_name || !formData.last_name || !formData.phone || !formData.hire_date) {
      setError('First name, last name, phone, and hire date are required');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        payload.append(key, value ?? '');
      });
      if (photoFile) {
        payload.append('photo', photoFile);
      }

      const config = { headers: { 'Content-Type': 'multipart/form-data' } };
      if (editStaff) {
        await api.patch(`/staff-members/${editStaff.id}/`, payload, config);
      } else {
        await api.post('/staff-members/', payload, config);
      }
      onSaved();
    } catch (err) {
      console.error('Error saving staff member:', err);
      const apiError = err.response?.data;
      setError(
        apiError?.error ||
        (typeof apiError === 'object' ? Object.values(apiError).flat().join(' ') : null) ||
        'Failed to save staff member. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">
              {editStaff ? 'Edit Staff Member' : 'Add Staff Member'}
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
                {error}
              </div>
            )}

            {/* Photo */}
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                {photoPreview ? (
                  <img src={photoPreview} alt="Staff preview" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-8 w-8 text-gray-400" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Photo</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/jpg"
                  onChange={handlePhotoChange}
                  className="text-sm text-gray-600"
                />
                <p className="text-xs text-gray-500 mt-1">JPG or PNG, up to 5MB.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Salutation</label>
                <select
                  name="salutation" value={formData.salutation} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  {SALUTATION_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  type="text" name="first_name" value={formData.first_name} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input
                  type="text" name="last_name" value={formData.last_name} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select
                  name="role" value={formData.role} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  name="status" value={formData.status} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="active">Active</option>
                  <option value="on_leave">On Leave</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <input
                  type="tel" name="phone" value={formData.phone} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  placeholder="09XXXXXXXX" required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email" name="email" value={formData.email} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">National ID</label>
                <input
                  type="text" name="national_id" value={formData.national_id} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hire Date *</label>
                <input
                  type="date" name="hire_date" value={formData.hire_date} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Base Salary (Birr)</label>
                <input
                  type="number" name="base_salary" value={formData.base_salary} onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  min="0" step="0.01"
                />
                <p className="text-xs text-gray-500 mt-1">Optional — used for internal salary records.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : editStaff ? 'Save Changes' : 'Add Staff Member'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default StaffRegistrationForm;
