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
import { CheckCircle, Building2, Loader, Clock, PauseCircle, XCircle, AlertTriangle, Wallet, Pencil, Receipt, Check, X, MessageSquare } from 'lucide-react';
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

  // ✅ NEW: editing the developer fee RATES themselves (previously only
  // readable here — PlatformFeeSettings.monthly_payment_fee /
  // registration_payment_fee defaulted to 5/2 ETB in the model and there
  // was no UI to ever change them, even though the backend endpoint
  // (developer_fee_rates, PATCH-able) already supported it). Editing
  // only ever affects payments verified AFTER the change — every
  // already-verified payment keeps whatever rate was snapshotted onto it
  // at the time (see Payment.save() on the backend), so raising this
  // never rewrites what a school already owes for past months.
  const [editingRates, setEditingRates] = useState(false);
  const [editMonthlyFee, setEditMonthlyFee] = useState('');
  const [editRegFee, setEditRegFee] = useState('');
  const [editSubscriptionFee, setEditSubscriptionFee] = useState('');
  const [savingRates, setSavingRates] = useState(false);
  const [ratesError, setRatesError] = useState('');

  // ✅ NEW (requested): the review queue for settlements schools have
  // submitted themselves with a receipt attached. Nothing here counts
  // toward "settled" until reviewTarget is Confirmed below — see
  // _school_fee_summary on the backend, which only sums
  // status='confirmed' settlements.
  const [pendingSettlements, setPendingSettlements] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [reviewTarget, setReviewTarget] = useState(null); // settlement being reviewed
  const [reviewAmount, setReviewAmount] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);

  // ✅ NEW (requested): SMS wallet review queue — identical shape to the
  // developer-fee settlement review above, but for topping up a
  // school's SMS credit rather than paying down accrued fees. Kept as
  // separate state (rather than merging with reviewTarget above) since
  // the two review modals show different fields (SMS shows price/SMS
  // context) and it's clearer to keep them as two distinct, simple
  // flows than one overloaded modal.
  const [smsPricing, setSmsPricing] = useState(null);
  const [pendingSmsTopups, setPendingSmsTopups] = useState([]);
  const [pendingSmsLoading, setPendingSmsLoading] = useState(true);
  const [smsReviewTarget, setSmsReviewTarget] = useState(null);
  const [smsReviewAmount, setSmsReviewAmount] = useState('');
  const [smsReviewing, setSmsReviewing] = useState(false);
  const [smsRejecting, setSmsRejecting] = useState(false);
  const [smsRejectReason, setSmsRejectReason] = useState('');
  const [smsShowRejectBox, setSmsShowRejectBox] = useState(false);
  const [editingSmsRates, setEditingSmsRates] = useState(false);
  const [editSmsCost, setEditSmsCost] = useState('');
  const [editSmsMarkup, setEditSmsMarkup] = useState('');
  const [editPlatformApiKey, setEditPlatformApiKey] = useState('');
  const [savingSmsRates, setSavingSmsRates] = useState(false);

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

  const fetchPendingSettlements = useCallback(async () => {
    try {
      const res = await api.get('/platform/developer-fees/settlements/pending/');
      setPendingSettlements(res.data.settlements || []);
    } catch (err) {
      console.error('Error fetching pending settlements:', err);
    } finally {
      setPendingLoading(false);
    }
  }, []);

  // ✅ NEW: SMS wallet fetches
  const fetchSmsPricing = useCallback(async () => {
    try {
      const res = await api.get('/platform/sms-pricing/');
      setSmsPricing(res.data);
    } catch (err) {
      console.error('Error fetching SMS pricing:', err);
    }
  }, []);

  const fetchPendingSmsTopups = useCallback(async () => {
    try {
      const res = await api.get('/platform/sms-wallets/topups/pending/');
      setPendingSmsTopups(res.data.topups || []);
    } catch (err) {
      console.error('Error fetching pending SMS top-ups:', err);
    } finally {
      setPendingSmsLoading(false);
    }
  }, []);

  // ✅ NEW: the per-school SMS wallet overview — so the super admin can
  // see every platform-managed school's balance and low-balance status
  // proactively, instead of only finding out when a school happens to
  // submit a top-up. Mirrors the developer-fee "Per School" table.
  const [smsWallets, setSmsWallets] = useState([]);
  const [smsWalletsLoading, setSmsWalletsLoading] = useState(true);
  const fetchSmsWallets = useCallback(async () => {
    try {
      const res = await api.get('/platform/sms-wallets/');
      setSmsWallets(res.data.schools || []);
    } catch (err) {
      console.error('Error fetching SMS wallets overview:', err);
    } finally {
      setSmsWalletsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(); fetchFees(); fetchPendingSettlements();
    fetchSmsPricing(); fetchPendingSmsTopups(); fetchSmsWallets();
  }, [fetchStats, fetchFees, fetchPendingSettlements, fetchSmsPricing, fetchPendingSmsTopups, fetchSmsWallets]);

  const openReview = (s) => {
    setReviewTarget(s);
    setReviewAmount(String(s.amount));
    setShowRejectBox(false);
    setRejectReason('');
  };

  const confirmReviewed = async () => {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      await api.post(`/platform/developer-fees/settlements/${reviewTarget.id}/confirm/`, {
        amount: reviewAmount,
      });
      setReviewTarget(null);
      await Promise.all([fetchPendingSettlements(), fetchFees()]);
    } catch (err) {
      console.error('Error confirming settlement:', err);
      alert(err.response?.data?.error || '❌ Failed to confirm settlement');
    } finally {
      setReviewing(false);
    }
  };

  const rejectReviewed = async () => {
    if (!reviewTarget || !rejectReason.trim()) return;
    setRejecting(true);
    try {
      await api.post(`/platform/developer-fees/settlements/${reviewTarget.id}/reject/`, {
        reason: rejectReason.trim(),
      });
      setReviewTarget(null);
      await fetchPendingSettlements();
    } catch (err) {
      console.error('Error rejecting settlement:', err);
      alert(err.response?.data?.error || '❌ Failed to reject settlement');
    } finally {
      setRejecting(false);
    }
  };

  // ✅ NEW: SMS top-up review handlers — same shape as the developer-fee
  // settlement review functions above.
  const openSmsReview = (t) => {
    setSmsReviewTarget(t);
    setSmsReviewAmount(String(t.amount));
    setSmsShowRejectBox(false);
    setSmsRejectReason('');
  };

  const confirmSmsReviewed = async () => {
    if (!smsReviewTarget) return;
    setSmsReviewing(true);
    try {
      await api.post(`/platform/sms-wallets/topups/${smsReviewTarget.id}/confirm/`, {
        amount: smsReviewAmount,
      });
      setSmsReviewTarget(null);
      await fetchPendingSmsTopups();
    } catch (err) {
      console.error('Error confirming SMS top-up:', err);
      alert(err.response?.data?.error || '❌ Failed to confirm top-up');
    } finally {
      setSmsReviewing(false);
    }
  };

  const rejectSmsReviewed = async () => {
    if (!smsReviewTarget || !smsRejectReason.trim()) return;
    setSmsRejecting(true);
    try {
      await api.post(`/platform/sms-wallets/topups/${smsReviewTarget.id}/reject/`, {
        reason: smsRejectReason.trim(),
      });
      setSmsReviewTarget(null);
      await fetchPendingSmsTopups();
    } catch (err) {
      console.error('Error rejecting SMS top-up:', err);
      alert(err.response?.data?.error || '❌ Failed to reject top-up');
    } finally {
      setSmsRejecting(false);
    }
  };

  const openSmsRateEditor = () => {
    if (!smsPricing) return;
    setEditSmsCost(String(smsPricing.cost_per_sms));
    setEditSmsMarkup(String(Number(smsPricing.markup_percentage) * 100));
    // The real key is never sent back by the API (security) — this box
    // always starts empty. Leaving it empty on Save keeps your existing
    // key untouched; only typing a new one replaces it.
    setEditPlatformApiKey('');
    setEditingSmsRates(true);
  };

  const saveSmsRates = async () => {
    setSavingSmsRates(true);
    try {
      const payload = {
        cost_per_sms: editSmsCost,
        markup_percentage: Number(editSmsMarkup) / 100,
      };
      // Only include the key if you actually typed something — this way
      // saving your rates never accidentally wipes out an already-saved key.
      if (editPlatformApiKey.trim()) {
        payload.platform_api_key = editPlatformApiKey.trim();
      }
      const res = await api.patch('/platform/sms-pricing/', payload);
      setSmsPricing(res.data);
      setEditPlatformApiKey('');
      setEditingSmsRates(false);
    } catch (err) {
      console.error('Error saving SMS rates:', err);
      alert(err.response?.data?.error || '❌ Failed to save SMS rates');
    } finally {
      setSavingSmsRates(false);
    }
  };

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

  const openRateEditor = () => {
    if (!feeData) return;
    setEditMonthlyFee(String(feeData.current_rates.monthly_payment_fee));
    setEditRegFee(String(feeData.current_rates.registration_payment_fee));
    setEditSubscriptionFee(String(feeData.current_rates.platform_subscription_fee_per_student));
    setRatesError('');
    setEditingRates(true);
  };

  const saveRates = async () => {
    const monthly = parseFloat(editMonthlyFee);
    const registration = parseFloat(editRegFee);
    const subscription = parseFloat(editSubscriptionFee);
    if (
      Number.isNaN(monthly) || monthly < 0 ||
      Number.isNaN(registration) || registration < 0 ||
      Number.isNaN(subscription) || subscription < 0
    ) {
      setRatesError('Enter valid, non-negative numbers for all three rates.');
      return;
    }
    setSavingRates(true);
    setRatesError('');
    try {
      await api.patch('/platform/developer-fees/rates/', {
        monthly_payment_fee: monthly,
        registration_payment_fee: registration,
        platform_subscription_fee_per_student: subscription,
      });
      setEditingRates(false);
      await fetchFees(); // refresh the displayed rates + totals
    } catch (err) {
      console.error('Error updating developer fee rates:', err);
      setRatesError(err.response?.data?.error || 'Failed to save the new rates. Please try again.');
    } finally {
      setSavingRates(false);
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

          {/* ✅ NEW (requested): settlement receipts waiting for review — the
              "school sends a receipt, developer checks their bank account
              and clicks accept" step. Kept as its own card, above the
              summary table, so it's the first thing Robel sees. */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-amber-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Settlement Receipts Awaiting Review</h2>
              {pendingSettlements.length > 0 && (
                <span className="text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 px-2 py-0.5 rounded-full">
                  {pendingSettlements.length}
                </span>
              )}
            </div>
            {pendingLoading ? (
              <div className="p-6 flex justify-center"><Loader className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : pendingSettlements.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 dark:text-slate-400">Nothing waiting on you right now.</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {pendingSettlements.map((s) => (
                  <div key={s.id} className="px-6 py-3 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-800 dark:text-slate-200">
                        {s.school_name} <span className="text-gray-400 dark:text-slate-500 font-normal">({s.school_code})</span>
                      </span>
                      <p className="text-gray-400 dark:text-slate-500 text-xs mt-0.5">
                        Claims to have sent <strong className="text-gray-700 dark:text-slate-300">{s.amount} ETB</strong>
                        {s.note ? ` — ${s.note}` : ''} · {new Date(s.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => openReview(s)}
                      className="text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-md font-medium hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300"
                    >
                      Review receipt
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ✅ NEW (requested): SMS wallet top-ups waiting for review —
              same shape as the settlement queue above, for schools
              topping up their SMS credit instead of paying down fees. */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-amber-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">SMS Top-Ups Awaiting Review</h2>
                {pendingSmsTopups.length > 0 && (
                  <span className="text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 px-2 py-0.5 rounded-full">
                    {pendingSmsTopups.length}
                  </span>
                )}
              </div>
              {smsPricing && (
                <button
                  onClick={openSmsRateEditor}
                  className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 border border-gray-200 dark:border-slate-700 rounded-md px-2 py-1"
                >
                  <Pencil className="h-3 w-3" /> SMS rates: {smsPricing.price_per_sms} ETB/msg
                </button>
              )}
            </div>
            {pendingSmsLoading ? (
              <div className="p-6 flex justify-center"><Loader className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : pendingSmsTopups.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 dark:text-slate-400">Nothing waiting on you right now.</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {pendingSmsTopups.map((t) => (
                  <div key={t.id} className="px-6 py-3 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-800 dark:text-slate-200">
                        {t.school_name} <span className="text-gray-400 dark:text-slate-500 font-normal">({t.school_code})</span>
                      </span>
                      <p className="text-gray-400 dark:text-slate-500 text-xs mt-0.5">
                        Claims to have sent <strong className="text-gray-700 dark:text-slate-300">{t.amount} ETB</strong>
                        {t.note ? ` — ${t.note}` : ''} · {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => openSmsReview(t)}
                      className="text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-md font-medium hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300"
                    >
                      Review receipt
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ✅ NEW: SMS Wallets — Per School — proactive visibility into
              every platform-managed school's balance, so a low balance
              is visible here BEFORE a school ever submits a top-up. */}
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">SMS Wallets — Per School</h2>
            </div>
            {smsWalletsLoading ? (
              <div className="p-6 flex justify-center"><Loader className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : smsWallets.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 dark:text-slate-400">No platform-managed schools yet — every school currently uses its own Afro Message account.</p>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {smsWallets.map((w) => (
                  <div key={w.school_id} className="px-6 py-3 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-800 dark:text-slate-200">{w.school_name}</span>
                      {!w.sms_enabled && (
                        <span className="ml-2 text-xs text-gray-400 dark:text-slate-500">(not enabled yet)</span>
                      )}
                    </div>
                    {w.sms_enabled ? (
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${w.is_low ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'}`}>
                        {w.balance_etb} ETB {w.is_low ? '— running low' : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-slate-500">—</span>
                    )}
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
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-500 dark:text-slate-400">
                    Rates: {feeData.current_rates.monthly_payment_fee} ETB/monthly · {feeData.current_rates.registration_payment_fee} ETB/registration · {feeData.current_rates.platform_subscription_fee_per_student} ETB/student/month
                  </span>
                  <button
                    onClick={openRateEditor}
                    className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-md font-medium hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  >
                    <Pencil className="h-3 w-3" /> Edit rates
                  </button>
                </div>
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

          {editingRates && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 w-full max-w-sm">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Edit developer usage fee rates</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                  Only affects payments verified from now on — every already-verified payment keeps the rate it was charged at the time, so this never rewrites what a school already owes for past months.
                </p>
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Monthly tuition payment fee (ETB)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editMonthlyFee}
                  onChange={(e) => setEditMonthlyFee(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-md px-3 py-2 text-sm mb-3"
                />
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Registration payment fee (ETB)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editRegFee}
                  onChange={(e) => setEditRegFee(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-md px-3 py-2 text-sm mb-3"
                />
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Platform subscription fee (ETB per active student, per month)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editSubscriptionFee}
                  onChange={(e) => setEditSubscriptionFee(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-md px-3 py-2 text-sm mb-1"
                />
                <p className="text-xs text-gray-400 dark:text-slate-500 mb-1">Covers hosting/infrastructure (Render, Neon, Cloudinary, Vercel) and ongoing access. Charged once per school, per calendar month, at whatever the active student count is when the month is first billed.</p>
                {ratesError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">{ratesError}</p>
                )}
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setEditingRates(false)} className="px-4 py-2 text-sm text-gray-500 dark:text-slate-400">Cancel</button>
                  <button
                    onClick={saveRates}
                    disabled={savingRates}
                    className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {savingRates ? 'Saving...' : 'Save rates'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {reviewTarget && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 w-full max-w-md">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  {reviewTarget.school_name}'s receipt
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
                  Check your bank account for this transfer before confirming — this is the moment their balance actually updates.
                </p>

                {reviewTarget.receipt_url ? (
                  <a href={reviewTarget.receipt_url} target="_blank" rel="noopener noreferrer" className="block mb-3">
                    <img
                      src={reviewTarget.receipt_url}
                      alt="Payment receipt"
                      className="w-full max-h-64 object-contain rounded-lg border border-gray-200 dark:border-slate-700"
                    />
                  </a>
                ) : (
                  <p className="text-xs text-gray-400 mb-3">No receipt image attached.</p>
                )}

                {reviewTarget.note && (
                  <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">Note from school: "{reviewTarget.note}"</p>
                )}

                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                  Amount to confirm (ETB) — adjust if the receipt shows a different amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={reviewAmount}
                  onChange={(e) => setReviewAmount(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-md px-3 py-2 text-sm mb-4"
                />

                {showRejectBox && (
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Reason for rejecting</label>
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="e.g. Amount doesn't match, receipt unreadable"
                      className="w-full border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                )}

                <div className="flex justify-between items-center gap-2">
                  <button onClick={() => setReviewTarget(null)} className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">Cancel</button>
                  <div className="flex gap-2">
                    {!showRejectBox ? (
                      <button
                        onClick={() => setShowRejectBox(true)}
                        className="flex items-center gap-1 px-3 py-2 text-sm bg-red-50 text-red-700 rounded-md font-medium hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                    ) : (
                      <button
                        onClick={rejectReviewed}
                        disabled={rejecting || !rejectReason.trim()}
                        className="px-3 py-2 text-sm bg-red-600 text-white rounded-md font-medium hover:bg-red-700 disabled:opacity-50"
                      >
                        {rejecting ? 'Rejecting...' : 'Confirm rejection'}
                      </button>
                    )}
                    {!showRejectBox && (
                      <button
                        onClick={confirmReviewed}
                        disabled={reviewing}
                        className="flex items-center gap-1 px-3 py-2 text-sm bg-emerald-600 text-white rounded-md font-medium hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> {reviewing ? 'Confirming...' : 'Confirm received'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ✅ NEW: SMS top-up receipt review modal — same pattern as the settlement review above */}
          {smsReviewTarget && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 w-full max-w-md">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  {smsReviewTarget.school_name}'s SMS top-up receipt
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
                  Check your bank account before confirming — this is the moment their SMS wallet balance actually increases.
                </p>

                {smsReviewTarget.receipt_url ? (
                  <a href={smsReviewTarget.receipt_url} target="_blank" rel="noopener noreferrer" className="block mb-3">
                    <img
                      src={smsReviewTarget.receipt_url}
                      alt="Payment receipt"
                      className="w-full max-h-64 object-contain rounded-lg border border-gray-200 dark:border-slate-700"
                    />
                  </a>
                ) : (
                  <p className="text-xs text-gray-400 mb-3">No receipt image attached.</p>
                )}

                {smsReviewTarget.note && (
                  <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">Note from school: "{smsReviewTarget.note}"</p>
                )}

                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                  Amount to confirm (ETB) — adjust if the receipt shows a different amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={smsReviewAmount}
                  onChange={(e) => setSmsReviewAmount(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-md px-3 py-2 text-sm mb-4"
                />

                {smsShowRejectBox && (
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Reason for rejecting</label>
                    <input
                      type="text"
                      value={smsRejectReason}
                      onChange={(e) => setSmsRejectReason(e.target.value)}
                      placeholder="e.g. Amount doesn't match, receipt unreadable"
                      className="w-full border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-md px-3 py-2 text-sm"
                    />
                  </div>
                )}

                <div className="flex justify-between items-center gap-2">
                  <button onClick={() => setSmsReviewTarget(null)} className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">Cancel</button>
                  <div className="flex gap-2">
                    {!smsShowRejectBox ? (
                      <button
                        onClick={() => setSmsShowRejectBox(true)}
                        className="flex items-center gap-1 px-3 py-2 text-sm bg-red-50 text-red-700 rounded-md font-medium hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                    ) : (
                      <button
                        onClick={rejectSmsReviewed}
                        disabled={smsRejecting || !smsRejectReason.trim()}
                        className="px-3 py-2 text-sm bg-red-600 text-white rounded-md font-medium hover:bg-red-700 disabled:opacity-50"
                      >
                        {smsRejecting ? 'Rejecting...' : 'Confirm rejection'}
                      </button>
                    )}
                    {!smsShowRejectBox && (
                      <button
                        onClick={confirmSmsReviewed}
                        disabled={smsReviewing}
                        className="flex items-center gap-1 px-3 py-2 text-sm bg-emerald-600 text-white rounded-md font-medium hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> {smsReviewing ? 'Confirming...' : 'Confirm received'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ✅ NEW: SMS pricing / rate editor modal — mirrors the developer fee rate editor */}
          {editingSmsRates && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 rounded-xl shadow-lg p-6 w-full max-w-md">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Edit SMS Rates</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                  This only affects platform-managed schools (those without their own Afro Message key) — self-managed
                  schools pay Afro Message directly and are unaffected by this rate.
                </p>

                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                  Your real cost per SMS (ETB) — what Afro Message charges you
                </label>
                <input
                  type="number" step="0.0001" value={editSmsCost}
                  onChange={(e) => setEditSmsCost(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-md px-3 py-2 text-sm mb-3"
                />

                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                  Your markup (%) — e.g. 50 means schools pay 1.5x your cost
                </label>
                <input
                  type="number" step="1" value={editSmsMarkup}
                  onChange={(e) => setEditSmsMarkup(e.target.value)}
                  className="w-full border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-md px-3 py-2 text-sm mb-4"
                />

                {editSmsCost && editSmsMarkup && (
                  <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                    Schools will be charged <strong className="text-gray-800 dark:text-slate-200">
                      {(Number(editSmsCost) * (1 + Number(editSmsMarkup) / 100)).toFixed(2)} ETB
                    </strong> per SMS.
                  </p>
                )}

                <hr className="border-gray-200 dark:border-slate-700 mb-4" />

                <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                  Your own Afro Message API key
                </label>
                <p className="text-xs mb-2">
                  {smsPricing?.platform_api_key_configured ? (
                    <span className="text-green-600 dark:text-green-400">✓ A key is currently saved. Leave the box below empty to keep it — only fill it in if you want to replace it.</span>
                  ) : (
                    <span className="text-red-500">⚠ No key saved yet — this is why schools see "Platform-managed SMS has not been enabled". Paste your Afro Message API key below to fix that.</span>
                  )}
                </p>
                <input
                  type="password" value={editPlatformApiKey}
                  onChange={(e) => setEditPlatformApiKey(e.target.value)}
                  placeholder={smsPricing?.platform_api_key_configured ? 'Leave blank to keep current key' : 'Paste your Afro Message API key'}
                  className="w-full border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-md px-3 py-2 text-sm mb-4"
                  autoComplete="off"
                />

                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingSmsRates(false)} className="px-3 py-2 text-sm text-gray-500 dark:text-slate-400">Cancel</button>
                  <button
                    onClick={saveSmsRates}
                    disabled={savingSmsRates}
                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-md font-medium hover:bg-primary-700 disabled:opacity-50"
                  >
                    {savingSmsRates ? 'Saving...' : 'Save rates'}
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