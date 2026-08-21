// src/pages/superadmin/SuperAdminActivityLog.js
//
// ✅ NEW — build spec §4.1 ("who approved/rejected/suspended what, and
// when"). Deliberately does NOT add a new backend endpoint — GET
// /api/audit-log/ (backend/common/views.py:AuditLogListView) already
// returns everything platform-wide when a super admin calls it without
// an X-School-ID header, so this page is UI-only, reusing that exact
// endpoint the same way AdminActivityLog.js does for a single school.
//
// Action list is intentionally the full set, not just the "platform"
// actions (SCHOOL_APPROVE etc.) — since the endpoint has no server-side
// concept of "platform-only" actions and returns literally every
// AuditLog row when unscoped, filtering it down here would just hide
// real data. Robel gets the full firehose with a filter to narrow it.
import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, History, User, MapPin } from 'lucide-react';
import api from '../../services/api';
import SuperAdminLayout from '../../components/Layout/SuperAdminLayout';

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'SCHOOL_APPROVE', label: 'School Approved' },
  { value: 'SCHOOL_REJECT', label: 'School Rejected' },
  { value: 'SCHOOL_SUSPEND', label: 'School Suspended' },
  { value: 'SCHOOL_REACTIVATE', label: 'School Reactivated' },
  { value: 'SCHOOL_ADMIN_LOGIN_GRANTED', label: 'School Admin Login Granted' },
  { value: 'SCHOOL_ADMIN_LOGIN_REVOKED', label: 'School Admin Login Revoked' },
  { value: 'PLATFORM_PAYMENT_RECORD', label: 'Platform Payment Recorded' },
  { value: 'SCHOOL_DATA_EXPORT', label: 'School Data Exported' },
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

// ✅ Dark mode: translucent tint on slate rather than a light-mode pastel.
const ACTION_COLORS = {
  SCHOOL_APPROVE: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  SCHOOL_REJECT: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  SCHOOL_SUSPEND: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  SCHOOL_REACTIVATE: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  SCHOOL_ADMIN_LOGIN_GRANTED: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  SCHOOL_ADMIN_LOGIN_REVOKED: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  PLATFORM_PAYMENT_RECORD: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  SCHOOL_DATA_EXPORT: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  STUDENT_CREATE: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  STUDENT_EDIT: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  STUDENT_DELETE: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  STAFF_CREATE: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  STAFF_EDIT: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  STAFF_DELETE: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  STAFF_LOGIN_GRANTED: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  STAFF_LOGIN_REVOKED: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  PAYMENT_VERIFY: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  SLIP_VERIFY: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  SLIP_REJECT: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  LOGIN: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
  LOGOUT: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
};
const DEFAULT_COLOR = 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300';

function formatTimestamp(ts) {
  const date = new Date(ts);
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function SuperAdminActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = actionFilter ? { action: actionFilter } : {};
      const res = await api.get('/audit-log/', { params });
      setLogs(res.data);
    } catch (err) {
      console.error('Error fetching activity log:', err);
      setError(err.response?.data?.error || 'Failed to load activity log.');
    } finally {
      setLoading(false);
    }
  }, [actionFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <SuperAdminLayout>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-gray-400 dark:text-slate-500">Every action, platform-wide</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Activity log</h1>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <select
        value={actionFilter}
        onChange={(e) => setActionFilter(e.target.value)}
        className="mb-4 border border-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/40"
      >
        {ACTION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-sm rounded-lg px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 overflow-hidden transition-colors">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400 dark:text-slate-500" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <History className="h-10 w-10 text-gray-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-slate-400">No activity recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {logs.map((entry) => (
              <div key={entry.id} className="p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="h-4 w-4 text-gray-500 dark:text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 dark:text-white">{entry.actor_name}</span>
                    {entry.actor_role && (
                      <span className="text-xs text-gray-400 dark:text-slate-500 capitalize">({entry.actor_role.replace(/_/g, ' ')})</span>
                    )}
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[entry.action] || DEFAULT_COLOR}`}>
                      {entry.action_display}
                    </span>
                  </div>
                  {entry.details && (
                    <p className="text-sm text-gray-600 dark:text-slate-300 mt-1">{entry.details}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <p className="text-xs text-gray-400 dark:text-slate-500">{formatTimestamp(entry.timestamp)}</p>
                    {entry.ip_address && (
                      <p className="text-xs text-gray-400 dark:text-slate-500 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {entry.ip_address}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SuperAdminLayout>
  );
}

export default SuperAdminActivityLog;
