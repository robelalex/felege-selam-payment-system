// src/pages/superadmin/SuperAdminDashboard.js
//
// ✅ RECONCILED (build spec §3.1) — this used to be a standalone 4-tab
// dashboard (Overview/Pending/Schools/Admins) with its own top-tab nav,
// no sidebar, and no SuperAdminLayout — duplicating everything that
// SuperAdminSchools.js, SuperAdminApprovals.js, and SuperAdminUsers.js
// already do as separate sidebar pages. That left two competing UIs for
// the same data. This file is now ONLY the Overview page — the 5 stat
// cards + expiring-subscriptions list — living inside SuperAdminLayout
// exactly like its three sibling pages, so each thing lives in exactly
// one place: Overview here, pending approvals in SuperAdminApprovals.js,
// the school list in SuperAdminSchools.js, admin accounts in
// SuperAdminUsers.js.
import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Building2, Loader, Clock, PauseCircle, XCircle, AlertTriangle } from 'lucide-react';
import api from '../../services/api';
import SuperAdminLayout from '../../components/Layout/SuperAdminLayout';

function StatCard({ icon: Icon, label, value, tint }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-5 border border-gray-100 dark:border-slate-800 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${tint}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-slate-400">{label}</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

function SuperAdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/admin/platform-stats/');
      setStats(res.data);
    } catch (err) {
      console.error('Error fetching platform stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return (
    <SuperAdminLayout pendingCount={stats?.pending_approvals_count || 0}>
      <div className="mb-6">
        <p className="text-sm text-gray-400 dark:text-slate-500">Platform overview</p>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Dashboard</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader className="h-8 w-8 animate-spin text-gray-400 dark:text-slate-500" />
        </div>
      ) : !stats ? (
        <p className="text-gray-500 dark:text-slate-400 p-6">Couldn't load platform stats.</p>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard icon={Building2} label="Total Schools" value={stats.total_schools} tint="bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300" />
            <StatCard icon={CheckCircle} label="Approved" value={stats.approved_count} tint="bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300" />
            <StatCard icon={Clock} label="Pending" value={stats.pending_count} tint="bg-yellow-100 text-yellow-600 dark:bg-amber-500/15 dark:text-amber-300" />
            <StatCard icon={PauseCircle} label="Suspended" value={stats.suspended_count} tint="bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" />
            <StatCard icon={XCircle} label="Rejected" value={stats.rejected_count} tint="bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-slate-300" />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Subscriptions expiring within 30 days</h2>
            </div>
            {stats.expiring_soon.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 dark:text-slate-400">Nothing expiring soon.</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {stats.expiring_soon.map((s) => (
                  <div key={s.id} className="px-6 py-3 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-800 dark:text-slate-200">{s.name} <span className="text-gray-400 dark:text-slate-500 font-normal">({s.code})</span></span>
                    <span className="text-amber-600 dark:text-amber-400 font-medium">{s.subscription_expiry}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </SuperAdminLayout>
  );
}

export default SuperAdminDashboard;
