// src/pages/superadmin/SuperAdminDashboard.js
//
// ✅ REBUILD — full platform-owner dashboard. Previously this page only
// showed a pending-approval queue with a hardcoded "Total Schools: -".
// Now it consumes the endpoints already built in
// backend/schools/platform_admin_views.py: platform-stats, schools-list,
// update-school-subscription, school-admins, toggle-active,
// resend-verification, plus the existing pending/approve/reject trio.
import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, XCircle, Building2, Loader, Clock, Search,
  PauseCircle, PlayCircle, Mail, AlertTriangle, LayoutGrid, ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import ProfileMenu from '../../components/Common/ProfileMenu';

const STATUS_STYLES = {
  approved: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  suspended: 'bg-red-100 text-red-700',
  rejected: 'bg-gray-200 text-gray-600',
};

function StatusBadge({ status }) {
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'}`}>
      {status || 'unknown'}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, tint, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-xl shadow-sm p-5 border border-gray-100 text-left ${onClick ? 'hover:border-primary-200 hover:shadow-md transition-all cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${tint}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </button>
  );
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'pending', label: 'Pending Approvals', icon: Clock },
  { key: 'schools', label: 'All Schools', icon: Building2 },
  { key: 'admins', label: 'School Admins', icon: ShieldCheck },
];

function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  // shared stats (used by Overview + as the pending count badge on the tab)
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/admin/platform-stats/');
      setStats(res.data);
    } catch (err) {
      console.error('Error fetching platform stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Super Admin Dashboard</h1>
          <p className="text-gray-500 mt-1">Approve schools and control platform access</p>
        </div>
        <ProfileMenu />
      </div>

      {/* Tab nav */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            const badge = tab.key === 'pending' && stats ? stats.pending_approvals_count : null;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {!!badge && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700 font-semibold">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === 'overview' && (
        <OverviewTab stats={stats} loading={statsLoading} onGoToPending={() => setActiveTab('pending')} />
      )}
      {activeTab === 'pending' && <PendingTab onChanged={fetchStats} />}
      {activeTab === 'schools' && <SchoolsTab onChanged={fetchStats} />}
      {activeTab === 'admins' && <AdminsTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function OverviewTab({ stats, loading, onGoToPending }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }
  if (!stats) {
    return <p className="text-gray-500 p-6">Couldn't load platform stats.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Building2} label="Total Schools" value={stats.total_schools} tint="bg-blue-100 text-blue-600" />
        <StatCard icon={CheckCircle} label="Approved" value={stats.approved_count} tint="bg-green-100 text-green-600" />
        <StatCard icon={Clock} label="Pending" value={stats.pending_count} tint="bg-yellow-100 text-yellow-600" onClick={onGoToPending} />
        <StatCard icon={PauseCircle} label="Suspended" value={stats.suspended_count} tint="bg-red-100 text-red-600" />
        <StatCard icon={XCircle} label="Rejected" value={stats.rejected_count} tint="bg-gray-200 text-gray-600" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h2 className="text-lg font-semibold text-gray-900">Subscriptions expiring within 30 days</h2>
        </div>
        {stats.expiring_soon.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Nothing expiring soon.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {stats.expiring_soon.map((s) => (
              <div key={s.id} className="px-6 py-3 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-800">{s.name} <span className="text-gray-400 font-normal">({s.code})</span></span>
                <span className="text-amber-600 font-medium">{s.subscription_expiry}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pending approvals
// ---------------------------------------------------------------------------
function PendingTab({ onChanged }) {
  const [pendingSchools, setPendingSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null); // { user_id, school_name }
  const [rejectReason, setRejectReason] = useState('');

  const fetchPending = useCallback(async () => {
    try {
      const res = await api.get('/admin/pending-approvals/');
      setPendingSchools(res.data);
    } catch (err) {
      console.error('Error fetching pending schools:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const handleApprove = async (userId) => {
    setProcessing(userId);
    try {
      await api.post(`/admin/approve/${userId}/`);
      setPendingSchools((prev) => prev.filter((s) => s.user_id !== userId));
      toast.success('School approved — they can now log in.');
      onChanged?.();
    } catch (err) {
      console.error('Error approving school:', err);
      toast.error('Failed to approve school');
    } finally {
      setProcessing(null);
    }
  };

  const openReject = (school) => {
    setRejectReason('');
    setRejectTarget(school);
  };

  const confirmReject = async () => {
    const userId = rejectTarget.user_id;
    setProcessing(userId);
    try {
      await api.post(`/admin/reject/${userId}/`, { reason: rejectReason });
      setPendingSchools((prev) => prev.filter((s) => s.user_id !== userId));
      toast.success('Registration rejected');
      setRejectTarget(null);
      onChanged?.();
    } catch (err) {
      console.error('Error rejecting school:', err);
      toast.error('Failed to reject registration');
    } finally {
      setProcessing(null);
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">Pending School Registrations</h2>
        <p className="text-sm text-gray-500 mt-0.5">Schools whose email is verified and are waiting on your review.</p>
      </div>

      {pendingSchools.length === 0 ? (
        <div className="p-12 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-gray-500">No pending approvals</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {pendingSchools.map((school) => (
            <div key={school.user_id} className="p-6 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                {school.logo ? (
                  <img src={school.logo} alt={school.school_name} className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-gray-400" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-gray-900">{school.school_name}</h3>
                  <p className="text-sm text-gray-500">Code: {school.school_code}</p>
                  <p className="text-sm text-gray-500">Admin: {school.first_name} {school.last_name}</p>
                  <p className="text-sm text-gray-500">Email: {school.email}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(school.user_id)}
                  disabled={processing === school.user_id}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 disabled:opacity-60"
                >
                  {processing === school.user_id ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Approve
                </button>
                <button
                  onClick={() => openReject(school)}
                  disabled={processing === school.user_id}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Reject {rejectTarget.school_name}?</h3>
            <p className="text-sm text-gray-500 mb-4">Optional — tell them why. This isn't required.</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Missing valid school documentation"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                disabled={processing === rejectTarget.user_id}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 flex items-center gap-2"
              >
                {processing === rejectTarget.user_id && <Loader className="h-4 w-4 animate-spin" />}
                Confirm reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// All schools
// ---------------------------------------------------------------------------
function SchoolsTab({ onChanged }) {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [processing, setProcessing] = useState(null);

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (status) params.status = status;
      const res = await api.get('/admin/schools-list/', { params });
      setSchools(res.data);
    } catch (err) {
      console.error('Error fetching schools:', err);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const t = setTimeout(fetchSchools, 300); // debounce search
    return () => clearTimeout(t);
  }, [fetchSchools]);

  const toggleSuspend = async (school) => {
    const nextStatus = school.subscription_status === 'suspended' ? 'approved' : 'suspended';
    setProcessing(school.id);
    try {
      const res = await api.patch(`/admin/schools-list/${school.id}/subscription/`, {
        subscription_status: nextStatus,
      });
      setSchools((prev) => prev.map((s) => (s.id === school.id ? res.data : s)));
      toast.success(nextStatus === 'suspended' ? 'School suspended' : 'School reactivated');
      onChanged?.();
    } catch (err) {
      console.error('Error updating subscription:', err);
      toast.error('Failed to update school');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-900">All Schools</h2>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or code"
              className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border border-gray-200 rounded-lg text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-200"
          >
            <option value="">All statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader className="h-6 w-6 animate-spin text-primary-600" />
        </div>
      ) : schools.length === 0 ? (
        <p className="p-12 text-center text-gray-500">No schools match this search.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-3 font-medium">School</th>
                <th className="text-left px-6 py-3 font-medium">Admin</th>
                <th className="text-left px-6 py-3 font-medium">Status</th>
                <th className="text-left px-6 py-3 font-medium">Expiry</th>
                <th className="text-right px-6 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {schools.map((s) => (
                <tr key={s.id}>
                  <td className="px-6 py-3">
                    <p className="font-medium text-gray-900">{s.name}</p>
                    <p className="text-gray-400 text-xs">{s.code} · {s.city || '—'}</p>
                  </td>
                  <td className="px-6 py-3">
                    <p className="text-gray-800">{s.admin_name || '—'}</p>
                    <p className="text-gray-400 text-xs">{s.admin_email || '—'}</p>
                  </td>
                  <td className="px-6 py-3"><StatusBadge status={s.subscription_status} /></td>
                  <td className="px-6 py-3 text-gray-600">{s.subscription_expiry || '—'}</td>
                  <td className="px-6 py-3 text-right">
                    {(s.subscription_status === 'approved' || s.subscription_status === 'suspended') && (
                      <button
                        onClick={() => toggleSuspend(s)}
                        disabled={processing === s.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60 ${
                          s.subscription_status === 'suspended'
                            ? 'bg-green-50 text-green-700 hover:bg-green-100'
                            : 'bg-red-50 text-red-700 hover:bg-red-100'
                        }`}
                      >
                        {processing === s.id ? (
                          <Loader className="h-3.5 w-3.5 animate-spin" />
                        ) : s.subscription_status === 'suspended' ? (
                          <PlayCircle className="h-3.5 w-3.5" />
                        ) : (
                          <PauseCircle className="h-3.5 w-3.5" />
                        )}
                        {s.subscription_status === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// School admins
// ---------------------------------------------------------------------------
function AdminsTab() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);

  const fetchAdmins = useCallback(async () => {
    try {
      const res = await api.get('/admin/school-admins/');
      setAdmins(res.data);
    } catch (err) {
      console.error('Error fetching school admins:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  const toggleActive = async (admin) => {
    setProcessing(admin.id);
    try {
      await api.post(`/admin/school-admins/${admin.id}/toggle-active/`, { is_active: !admin.is_active });
      setAdmins((prev) => prev.map((a) => (a.id === admin.id ? { ...a, is_active: !a.is_active } : a)));
      toast.success(admin.is_active ? 'Admin login deactivated' : 'Admin login reactivated');
    } catch (err) {
      console.error('Error toggling admin:', err);
      toast.error('Failed to update this admin');
    } finally {
      setProcessing(null);
    }
  };

  const resendVerification = async (admin) => {
    setProcessing(`verify-${admin.id}`);
    try {
      await api.post(`/admin/school-admins/${admin.id}/resend-verification/`);
      toast.success(`Verification email resent to ${admin.email}`);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to resend verification email';
      toast.error(msg);
    } finally {
      setProcessing(null);
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">School Admin Accounts</h2>
        <p className="text-sm text-gray-500 mt-0.5">Control login access per school admin, separate from their school's subscription.</p>
      </div>

      {admins.length === 0 ? (
        <p className="p-12 text-center text-gray-500">No school admin accounts yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-3 font-medium">Admin</th>
                <th className="text-left px-6 py-3 font-medium">School</th>
                <th className="text-left px-6 py-3 font-medium">Email verified</th>
                <th className="text-left px-6 py-3 font-medium">Login access</th>
                <th className="text-right px-6 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {admins.map((a) => (
                <tr key={a.id}>
                  <td className="px-6 py-3">
                    <p className="font-medium text-gray-900">{a.first_name} {a.last_name}</p>
                    <p className="text-gray-400 text-xs">{a.email}</p>
                  </td>
                  <td className="px-6 py-3 text-gray-700">{a.school_name || '—'}</td>
                  <td className="px-6 py-3">
                    {a.email_verified ? (
                      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium"><CheckCircle className="h-3.5 w-3.5" /> Verified</span>
                    ) : (
                      <button
                        onClick={() => resendVerification(a)}
                        disabled={processing === `verify-${a.id}`}
                        className="inline-flex items-center gap-1 text-amber-700 text-xs font-medium hover:underline disabled:opacity-60"
                      >
                        {processing === `verify-${a.id}` ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                        Not verified — resend
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                      {a.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => toggleActive(a)}
                      disabled={processing === a.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60 ${
                        a.is_active ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-green-50 text-green-700 hover:bg-green-100'
                      }`}
                    >
                      {processing === a.id ? <Loader className="h-3.5 w-3.5 animate-spin" /> : a.is_active ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                      {a.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default SuperAdminDashboard;