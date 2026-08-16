// src/pages/AdminStaff.js
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Phone,
  Mail,
  User,
  Briefcase,
  RefreshCw,
  KeyRound,
  ShieldOff,
  Copy,
  Check,
  FolderOpen,
} from 'lucide-react';
import api from '../services/api';
import { getMediaUrl } from '../utils/imageUrl';
import StaffRegistrationForm from '../components/Admin/StaffRegistrationForm';
import StaffDetailModal from '../components/Admin/StaffDetailModal';

const ROLE_LABELS = {
  teacher: 'Teacher',
  school_admin: 'School Admin',
  registrar: 'Registrar',
  accountant: 'Accountant',
  librarian: 'Librarian',
  reporting_manager: 'Reporting Manager',
  reminder_manager: 'Reminder Manager',
  other: 'Other Staff',
};

// ✅ Modal: create a login for a staff member (email optional, password
// auto-generated), then show the credentials ONCE so the admin can share
// them — the password is never retrievable again after this.
const CreateLoginModal = ({ member, onClose, onCreated }) => {
  const [email, setEmail] = useState(member.email || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/staff-members/${member.id}/create_login/`, { email });
      setCredentials(res.data.credentials);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create login.');
    } finally {
      setSaving(false);
    }
  };

  const copyCredentials = () => {
    const text = `Email: ${credentials.email}\nUsername: ${credentials.username}\nPassword: ${credentials.password}\nRole: ${credentials.role_display}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {!credentials ? (
          <>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Create Login for {member.full_name}</h3>
            <p className="text-sm text-gray-500 mb-4">
              They'll be able to log in through the same admin login page (with OTP verification),
              and will only see the parts of the system their role ({ROLE_LABELS[member.role] || member.role}) allows.
            </p>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 mb-4">
                {error}
              </div>
            )}
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4"
              placeholder="staff@example.com"
            />
            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !email}
                className="px-5 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Login'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-gray-900 mb-2">✅ Login Created</h3>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              Save this password now — it will not be shown again. Share it with {member.full_name} securely.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm mb-4 font-mono">
              <p><span className="text-gray-500">Email:</span> {credentials.email}</p>
              <p><span className="text-gray-500">Username:</span> {credentials.username}</p>
              <p><span className="text-gray-500">Password:</span> {credentials.password}</p>
              <p><span className="text-gray-500">Role:</span> {credentials.role_display}</p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={copyCredentials}
                className="flex items-center gap-2 px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button onClick={onClose} className="px-5 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700">
                Done
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

function AdminStaff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editStaffMember, setEditStaffMember] = useState(null);
  const [loginModalMember, setLoginModalMember] = useState(null);
  const [detailMember, setDetailMember] = useState(null);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const response = await api.get('/staff-members/');
      setStaff(response.data);
    } catch (err) {
      console.error('Error fetching staff:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to remove this staff member?')) {
      try {
        await api.delete(`/staff-members/${id}/`);
        fetchStaff();
      } catch (err) {
        console.error('Error deleting staff member:', err);
        alert('Failed to delete staff member. Please try again.');
      }
    }
  };

  const handleRevokeLogin = async (member) => {
    if (!window.confirm(`Revoke portal access for ${member.full_name}? They will no longer be able to log in.`)) {
      return;
    }
    try {
      await api.post(`/staff-members/${member.id}/revoke_login/`);
      fetchStaff();
    } catch (err) {
      console.error('Error revoking login:', err);
      alert(err.response?.data?.error || 'Failed to revoke login access.');
    }
  };

  const filteredStaff = staff.filter((member) => {
    const matchesSearch =
      (member.full_name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (member.staff_id?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (member.phone || '').includes(searchTerm);
    const matchesRole = roleFilter === 'all' || member.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const StaffAvatar = ({ member, size = 'w-10 h-10' }) => {
    const photoUrl = member.photo ? getMediaUrl(member.photo) : null;
    if (photoUrl) {
      return (
        <img
          src={photoUrl}
          alt={member.full_name}
          className={`${size} rounded-full object-cover border border-gray-200 flex-shrink-0`}
        />
      );
    }
    return (
      <div className={`${size} bg-gradient-to-br from-teal-500 to-teal-700 rounded-full flex items-center justify-center flex-shrink-0`}>
        <Briefcase className="h-1/2 w-1/2 text-white" />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff & Teachers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage teachers, registrars, and other staff for your school.
          </p>
        </div>
        <button
          onClick={() => { setEditStaffMember(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Staff Member
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, staff ID, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="all">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <Briefcase className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No staff members found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="table-header">Staff Member</th>
                  <th className="table-header">ID</th>
                  <th className="table-header">Role</th>
                  <th className="table-header">Phone</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Portal Access</th>
                  <th className="table-header">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredStaff.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <StaffAvatar member={member} size="w-9 h-9" />
                        <div>
                          <p className="font-medium text-gray-900">{member.display_name || member.full_name}</p>
                          {member.email && (
                            <p className="text-xs text-gray-500 flex items-center gap-1">
                              <Mail className="h-3 w-3" /> {member.email}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="table-cell font-mono text-sm">{member.staff_id}</td>
                    <td className="table-cell">
                      <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-700">
                        {ROLE_LABELS[member.role] || member.role}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className="flex items-center gap-1 text-sm text-gray-600">
                        <Phone className="h-3 w-3" /> {member.phone}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={`badge ${member.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                        {member.status === 'active' ? 'Active' : member.status === 'on_leave' ? 'On Leave' : 'Terminated'}
                      </span>
                    </td>
                    <td className="table-cell">
                      {member.user ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                            <KeyRound className="h-3 w-3" /> Has Login
                          </span>
                          <button
                            onClick={() => handleRevokeLogin(member)}
                            title="Revoke portal access"
                            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <ShieldOff className="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setLoginModalMember(member)}
                          className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                        >
                          <KeyRound className="h-3 w-3" /> Grant Login
                        </button>
                      )}
                    </td>
                    <td className="table-cell">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setDetailMember(member)}
                          title="Documents & career history"
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <FolderOpen className="h-4 w-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => { setEditStaffMember(member); setShowForm(true); }}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Edit className="h-4 w-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(member.id)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <StaffRegistrationForm
            editStaff={editStaffMember}
            onClose={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); fetchStaff(); }}
          />
        )}
        {loginModalMember && (
          <CreateLoginModal
            member={loginModalMember}
            onClose={() => setLoginModalMember(null)}
            onCreated={fetchStaff}
          />
        )}
        {detailMember && (
          <StaffDetailModal
            member={detailMember}
            onClose={() => setDetailMember(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default AdminStaff;
