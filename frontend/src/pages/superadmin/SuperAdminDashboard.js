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
import { CheckCircle, Building2, Loader, Clock, PauseCircle, XCircle, AlertTriangle, Wallet } from 'lucide-react';
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

  // ✅ NEW: developer usage fee overview — what every school currently
  // owes, at a glance. Loaded separately from the main platform stats
  // so a slow/failed fee fetch never blocks the rest of the dashboard.
  const [feeData, setFeeData] = useState(null);
  const [feeLoading, setFeeLoading] = useState(true);
  const [settleTarget, setSettleTarget] = useState(null); // school row being settled
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [settling, setSettling] = useState(false);

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

  const fetchFees = useCallback(async () => {
    try {
      const res = await api.get('/platform/developer-fees/');
      setFeeData(res.data);
    } catch (err) {
      console.error('Error fetching developer fee overview:', err);
    } finally {
      setFeeLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); fetchFees(); }, [fetchStats, fetchFees]);

  const submitSettlement = async () => {
    if (!settleTarget || !settleAmount) return;
    setSettling(true);
    try {
      await api.post('/platform/developer-fees/settle/', {
        school_id: settleTarget.school_id,
        amount: settleAmount,
        note: settleNote,
      });
      setSettleTarget(null);
      setSettleAmount('');
      setSettleNote('');
      await fetchFees();
    } catch (err) {
      console.error('Error recording settlement:', err);
      alert('❌ Failed to record settlement');
    } finally {
      setSettling(false);
    }
  };

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

          {/* ✅ NEW: Developer usage fee — what each school currently owes */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-emerald-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Developer Usage Fee — Per School</h2>
              </div>
              {feeData && (
                <span className="text-sm font-medium text-gray-500 dark:text-slate-400">
                  Rates: {feeData.current_rates.monthly_payment_fee} ETB/monthly · {feeData.current_rates.registration_payment_fee} ETB/registration
                </span>
              )}
            </div>
            {feeLoading ? (
              <div className="p-6 flex justify-center"><Loader className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : !feeData || feeData.schools.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 dark:text-slate-400">No payment activity yet.</p>
            ) : (
              <>
                <div className="px-6 py-3 bg-gray-50 dark:bg-slate-800/50 flex gap-6 text-sm">
                  <span className="text-gray-500 dark:text-slate-400">Total accrued: <strong className="text-gray-900 dark:text-white">{feeData.totals.total_accrued} ETB</strong></span>
                  <span className="text-gray-500 dark:text-slate-400">Total settled: <strong className="text-gray-900 dark:text-white">{feeData.totals.total_settled} ETB</strong></span>
                  <span className="text-gray-500 dark:text-slate-400">Outstanding: <strong className="text-amber-600 dark:text-amber-400">{feeData.totals.total_balance_owed} ETB</strong></span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                  {feeData.schools.map((row) => (
                    <div key={row.school_id} className="px-6 py-3 flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-800 dark:text-slate-200">
                        {row.school_name} <span className="text-gray-400 dark:text-slate-500 font-normal">({row.school_code})</span>
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-gray-400 dark:text-slate-500">Owed: <strong className={row.balance_owed > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500'}>{row.balance_owed} ETB</strong></span>
                        <button
                          onClick={() => { setSettleTarget(row); setSettleAmount(String(row.balance_owed)); }}
                          className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md font-medium hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
                        >
                          Record payment received
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {settleTarget && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 w-full max-w-sm">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Record payment from {settleTarget.school_name}</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">Only log this once the money has actually arrived — this doesn't move any money itself.</p>
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Amount (ETB)</label>
                <input
                  type="number"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-md px-3 py-2 text-sm mb-3"
                />
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Note (optional)</label>
                <input
                  type="text"
                  value={settleNote}
                  onChange={(e) => setSettleNote(e.target.value)}
                  placeholder="e.g. Bank transfer, CBE, 12 Sep"
                  className="w-full border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-md px-3 py-2 text-sm mb-4"
                />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setSettleTarget(null)} className="px-4 py-2 text-sm text-gray-500 dark:text-slate-400">Cancel</button>
                  <button
                    onClick={submitSettlement}
                    disabled={settling}
                    className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {settling ? 'Saving...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </SuperAdminLayout>
  );
}

export default SuperAdminDashboard;
