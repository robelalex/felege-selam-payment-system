// src/pages/AdminActivityLog.js
import React, { useState, useEffect } from 'react';
import { RefreshCw, History, User } from 'lucide-react';
import api from '../services/api';

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'LOGIN', label: 'Login' },
  { value: 'LOGOUT', label: 'Logout' },
  { value: 'PAYMENT_VERIFY', label: 'Payment Verification' },
  { value: 'STUDENT_CREATE', label: 'Student Created' },
  { value: 'STUDENT_EDIT', label: 'Student Edited' },
  { value: 'STUDENT_DELETE', label: 'Student Deleted' },
  { value: 'DEADLINE_CREATE', label: 'Deadline Created' },
  { value: 'DEADLINE_EDIT', label: 'Deadline Edited' },
  { value: 'DEADLINE_DELETE', label: 'Deadline Deleted' },
  { value: 'SLIP_VERIFY', label: 'Slip Verified' },
  { value: 'SLIP_REJECT', label: 'Slip Rejected' },
  { value: 'SETTINGS_CHANGE', label: 'Settings Changed' },
  { value: 'STAFF_CREATE', label: 'Staff Member Added' },
  { value: 'STAFF_EDIT', label: 'Staff Member Edited' },
  { value: 'STAFF_DELETE', label: 'Staff Member Removed' },
  { value: 'STAFF_LOGIN_GRANTED', label: 'Staff Login Granted' },
  { value: 'STAFF_LOGIN_REVOKED', label: 'Staff Login Revoked' },
];

const ACTION_COLORS = {
  STUDENT_CREATE: 'bg-green-50 text-green-700',
  STUDENT_EDIT: 'bg-blue-50 text-blue-700',
  STUDENT_DELETE: 'bg-red-50 text-red-700',
  STAFF_CREATE: 'bg-green-50 text-green-700',
  STAFF_EDIT: 'bg-blue-50 text-blue-700',
  STAFF_DELETE: 'bg-red-50 text-red-700',
  STAFF_LOGIN_GRANTED: 'bg-purple-50 text-purple-700',
  STAFF_LOGIN_REVOKED: 'bg-orange-50 text-orange-700',
  PAYMENT_VERIFY: 'bg-teal-50 text-teal-700',
  SLIP_VERIFY: 'bg-teal-50 text-teal-700',
  SLIP_REJECT: 'bg-red-50 text-red-700',
  LOGIN: 'bg-gray-100 text-gray-600',
  LOGOUT: 'bg-gray-100 text-gray-600',
};

function AdminActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const params = actionFilter ? `?action=${actionFilter}` : '';
      const response = await api.get(`/audit-log/${params}`);
      setLogs(response.data);
    } catch (err) {
      console.error('Error fetching activity log:', err);
      setError(err.response?.data?.error || 'Failed to load activity log.');
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (ts) => {
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <History className="h-6 w-6 text-primary-600" />
            Activity Log
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            See exactly which staff member did what, and when — every action below is tied to a real user.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <select
        value={actionFilter}
        onChange={(e) => setActionFilter(e.target.value)}
        className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500"
      >
        {ACTION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <History className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No activity recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {logs.map((entry) => (
            <div key={entry.id} className="p-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="h-4 w-4 text-gray-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900">{entry.actor_name}</span>
                  {entry.actor_role && (
                    <span className="text-xs text-gray-400 capitalize">({entry.actor_role.replace(/_/g, ' ')})</span>
                  )}
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[entry.action] || 'bg-gray-100 text-gray-600'}`}>
                    {entry.action_display}
                  </span>
                </div>
                {entry.details && (
                  <p className="text-sm text-gray-600 mt-1">{entry.details}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">{formatTimestamp(entry.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminActivityLog;
