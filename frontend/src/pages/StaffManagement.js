// src/pages/StaffManagement.js
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, User, Mail, Phone, Key, RefreshCw, Loader, CheckCircle, XCircle } from 'lucide-react';
import api from '../services/api';

function StaffManagement() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
    role: 'registrar'
  });

  const roles = [
    { value: 'registrar', label: 'Registrar', description: 'Manage student enrollment, registration, and promotion' },
    { value: 'payment_manager', label: 'Payment Manager', description: 'Verify bank slips, manage payments, financial reports' },
    { value: 'reporting_manager', label: 'Reporting Manager', description: 'Generate and view all reports and analytics' },
    { value: 'reminder_manager', label: 'Reminder Manager', description: 'Send SMS and email reminders to parents' }
  ];

  // First, check authentication and get user role
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await api.get('/me/');
        if (response.data?.user) {
          setIsAuthenticated(true);
          setUserRole(response.data.user.role);
        } else {
          setIsAuthenticated(false);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error checking auth:', err);
        setIsAuthenticated(false);
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  // Only fetch staff after authentication is confirmed and user is school_admin
  useEffect(() => {
    if (isAuthenticated && userRole === 'school_admin') {
      fetchStaff();
    } else if (isAuthenticated && userRole !== 'school_admin') {
      // User is logged in but not school admin - show message
      setLoading(false);
      showMessage('error', 'Only School Admins can access Staff Management');
    }
  }, [isAuthenticated, userRole]);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const response = await api.get('/staff/');
      setStaff(response.data);
    } catch (err) {
      console.error('Error fetching staff:', err);
      if (err.response?.status === 401) {
        showMessage('error', 'Please login again to access staff management');
      } else {
        showMessage('error', 'Failed to load staff members');
      }
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

const handleCreateStaff = async (e) => {
  e.preventDefault();
  setSubmitting(true);
  
  try {
    // ✅ First check if user is authenticated
    console.log('🔍 Checking authentication before creating staff...');
    const meResponse = await api.get('/me/');
    console.log('📡 Auth check response:', meResponse.data);
    
    if (!meResponse.data?.user) {
      showMessage('error', 'Please login again. Your session may have expired.');
      setSubmitting(false);
      return;
    }
    
    console.log('✅ User is authenticated:', meResponse.data.user);
    console.log('📤 Creating staff with data:', formData);
    
    const response = await api.post('/staff/create/', formData);
    console.log('✅ Staff creation response:', response.data);
    
    showMessage('success', 'Staff member created successfully');
    setShowModal(false);
    resetForm();
    fetchStaff();
  } catch (err) {
    console.error('❌ Error creating staff:', err);
    console.error('❌ Error response:', err.response?.data);
    console.error('❌ Error status:', err.response?.status);
    
    if (err.response?.status === 401) {
      showMessage('error', 'Authentication failed. Please logout and login again.');
    } else {
      showMessage('error', err.response?.data?.error || 'Failed to create staff member');
    }
  } finally {
    setSubmitting(false);
  }
};

  const handleDeleteStaff = async (userId, userName) => {
    if (window.confirm(`Are you sure you want to delete ${userName}?`)) {
      try {
        await api.delete(`/staff/delete/${userId}/`);
        showMessage('success', 'Staff member deleted');
        fetchStaff();
      } catch (err) {
        showMessage('error', 'Failed to delete staff member');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      username: '',
      password: '',
      first_name: '',
      last_name: '',
      phone: '',
      role: 'registrar'
    });
  };

  const getRoleBadgeColor = (role) => {
    switch(role) {
      case 'registrar': return 'bg-blue-100 text-blue-700';
      case 'payment_manager': return 'bg-green-100 text-green-700';
      case 'reporting_manager': return 'bg-purple-100 text-purple-700';
      case 'reminder_manager': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getRoleDisplay = (role) => {
    switch(role) {
      case 'registrar': return 'Registrar';
      case 'payment_manager': return 'Payment Manager';
      case 'reporting_manager': return 'Reporting Manager';
      case 'reminder_manager': return 'Reminder Manager';
      default: return role;
    }
  };

  // Show loading while checking authentication
  if (loading && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  // Show unauthorized message if not school admin
  if (isAuthenticated && userRole !== 'school_admin') {
    return (
      <div className="bg-white rounded-xl shadow-lg p-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
            <XCircle className="h-10 w-10 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
          <p className="text-gray-500">Only School Administrators can access Staff Management.</p>
          <button 
            onClick={() => window.location.href = '/admin/dashboard'}
            className="btn-primary mt-4"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-gray-600 mt-1">Create and manage school staff members</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create Staff
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.type === 'success' ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          {message.text}
        </div>
      )}

      {/* Staff Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {staff.length === 0 ? (
          <div className="col-span-full bg-white rounded-xl shadow-lg p-12 text-center">
            <User className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No staff members created yet</p>
            <p className="text-sm text-gray-400 mt-1">Click "Create Staff" to add your first staff member</p>
          </div>
        ) : (
          staff.map((member) => (
            <div key={member.id} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                      <span className="text-indigo-600 font-bold text-lg">
                        {member.first_name?.[0] || member.username[0]}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {member.first_name} {member.last_name}
                      </h3>
                      <p className="text-sm text-gray-500">@{member.username}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteStaff(member.id, member.first_name || member.username)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete Staff"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-gray-600 text-sm">
                    <Mail className="h-4 w-4" />
                    <span>{member.email}</span>
                  </div>
                  {member.phone && (
                    <div className="flex items-center gap-2 text-gray-600 text-sm">
                      <Phone className="h-4 w-4" />
                      <span>{member.phone}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(member.role)}`}>
                    {getRoleDisplay(member.role)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Staff Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
              <h2 className="text-xl font-bold text-gray-900">Create Staff Member</h2>
            </div>

            <form onSubmit={handleCreateStaff} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="input-field"
                  required
                >
                  {roles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label} - {role.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="input-field"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Password must be at least 12 characters with uppercase, lowercase, number, and special character
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="input-field"
                  placeholder="0912345678"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? <Loader className="h-4 w-4 animate-spin" /> : 'Create Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffManagement;