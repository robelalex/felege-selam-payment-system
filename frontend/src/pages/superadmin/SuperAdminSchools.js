// src/pages/superadmin/SuperAdminSchools.js
//
// ✅ REDESIGNED — this keeps every existing endpoint exactly as-is
// (GET/PATCH /admin/schools-list/, GET/POST .../payments/,
// GET .../export/) and only rebuilds the UI/UX around them:
//   1. Suspended/at-risk schools are now visible across the whole list —
//      a summary strip up top, a colored left-border + tint on each
//      affected row, and a real badge next to the status pill — not just
//      a small line of text buried in the row (as before).
//   2. The billing modal is now a real ledger: a proper table with a
//      totals footer, instead of a plain stacked list of payment cards.
//   3. The "record payment" form shows a live preview of the new expiry
//      date as you fill it in (computed the same way the backend
//      computes it — extend from whichever is later, today or the
//      current expiry), so Robel isn't guessing what a payment will do
//      before he submits it.
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Search, Building2, Loader, CheckCircle2, PauseCircle, XCircle, Clock, ShieldOff,
  X, Download, Plus, AlertTriangle, Receipt, Lock, Wallet, Calendar, ArrowRight,
  Banknote, CreditCard, Landmark, HelpCircle, TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import SuperAdminLayout from '../../components/Layout/SuperAdminLayout';

// ✅ Dark mode: each status/method keeps its own hue in both modes —
// dark variants use a translucent tint on the slate surface rather than
// the light-mode pastel, for real contrast instead of a color inversion.
const STATUS_META = {
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300', icon: CheckCircle2 },
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', icon: Clock },
  suspended: { label: 'Suspended', className: 'bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-300', icon: PauseCircle },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', icon: XCircle },
};

const METHOD_META = {
  chapa: { label: 'Chapa (online)', icon: CreditCard, className: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300' },
  bank_transfer: { label: 'Bank Transfer', icon: Landmark, className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  cash: { label: 'Cash', icon: Banknote, className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  other: { label: 'Other', icon: HelpCircle, className: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${meta.className}`}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

/** Small pill that makes a school's access risk visible without opening anything. */
function AccessBadge({ school }) {
  if (school.is_access_suspended) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-red-600 text-white">
        <Lock className="h-3 w-3" /> Access locked
      </span>
    );
  }
  if (school.days_until_access_suspended !== null && school.days_until_access_suspended !== undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-700/60">
        <AlertTriangle className="h-3 w-3" /> {school.days_until_access_suspended}d grace period left
      </span>
    );
  }
  return null;
}

/** Row background/left-border treatment so risk is visible scanning the whole list, not just per-row text. */
function rowRiskClasses(school) {
  if (school.is_access_suspended) return 'border-l-4 border-l-red-500 bg-red-50/60 dark:bg-red-500/10';
  if (school.days_until_access_suspended !== null && school.days_until_access_suspended !== undefined) {
    return 'border-l-4 border-l-amber-400 bg-amber-50/50 dark:bg-amber-500/10';
  }
  return 'border-l-4 border-l-transparent';
}

function SuperAdminSchools() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [onlyAtRisk, setOnlyAtRisk] = useState(false);
  const [actingId, setActingId] = useState(null);
  const [managing, setManaging] = useState(null); // school being managed in the modal

  const fetchSchools = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      const res = await api.get('/admin/schools-list/', { params });
      setSchools(res.data);
    } catch (err) {
      console.error('Error fetching schools:', err);
      toast.error('Could not load schools');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(fetchSchools, 300);
    return () => clearTimeout(t);
  }, [fetchSchools]);

  const { lockedOut, atRisk } = useMemo(() => ({
    lockedOut: schools.filter((s) => s.is_access_suspended),
    atRisk: schools.filter((s) => !s.is_access_suspended && s.days_until_access_suspended !== null && s.days_until_access_suspended !== undefined),
  }), [schools]);

  const visibleSchools = onlyAtRisk
    ? schools.filter((s) => s.is_access_suspended || (s.days_until_access_suspended !== null && s.days_until_access_suspended !== undefined))
    : schools;

  const handleSuspendToggle = async (school) => {
    const nextStatus = school.subscription_status === 'suspended' ? 'approved' : 'suspended';
    setActingId(school.id);
    try {
      await api.patch(`/admin/schools-list/${school.id}/subscription/`, {
        subscription_status: nextStatus,
      });
      toast.success(nextStatus === 'suspended' ? 'School suspended' : 'School reactivated');
      fetchSchools();
    } catch (err) {
      console.error(err);
      toast.error('Action failed');
    } finally {
      setActingId(null);
    }
  };

  return (
    <SuperAdminLayout>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-gray-400 dark:text-slate-500">All schools</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Schools</h1>
        </div>
      </div>

      {/* ✅ NEW — at-a-glance risk summary, so a school losing access isn't
          something Robel only discovers by opening a modal or reading a
          line of text buried in a row. Clicking either chip (or the pill
          on the right) filters the list down to just those schools. */}
      {(lockedOut.length > 0 || atRisk.length > 0) && (
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {lockedOut.length > 0 && (
            <button
              onClick={() => setOnlyAtRisk((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
            >
              <Lock className="h-4 w-4" />
              {lockedOut.length} school{lockedOut.length !== 1 ? 's' : ''} currently locked out
            </button>
          )}
          {atRisk.length > 0 && (
            <button
              onClick={() => setOnlyAtRisk((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
            >
              <AlertTriangle className="h-4 w-4" />
              {atRisk.length} school{atRisk.length !== 1 ? 's' : ''} in their grace period
            </button>
          )}
          {onlyAtRisk && (
            <button
              onClick={() => setOnlyAtRisk(false)}
              className="text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 underline"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-gray-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/40"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 rounded-lg text-sm px-3 py-2"
        >
          <option value="">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800 overflow-hidden transition-colors">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="h-6 w-6 animate-spin text-gray-400 dark:text-slate-500" />
          </div>
        ) : visibleSchools.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-16">
            {onlyAtRisk ? 'No schools currently at risk.' : 'No schools match this search.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {visibleSchools.map((school) => (
              <div key={school.id} className={`px-5 py-4 flex items-center justify-between gap-4 flex-wrap transition-colors ${rowRiskClasses(school)}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-gray-400 dark:text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">{school.name}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      {school.code}{school.city ? ` · ${school.city}` : ''}
                      {school.subscription_expiry ? ` · expires ${school.subscription_expiry}` : ''}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-slate-500">
                      Admin: {school.admin_name || '—'} {school.admin_email ? `(${school.admin_email})` : ''}
                      {school.admin_email_verified === false && (
                        <span className="ml-1 text-amber-600 dark:text-amber-400">· email unverified</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  <StatusBadge status={school.subscription_status} />
                  <AccessBadge school={school} />
                  <button
                    onClick={() => setManaging(school)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 transition-colors flex items-center gap-1"
                  >
                    <Receipt className="h-3.5 w-3.5" /> Billing
                  </button>
                  {school.subscription_status !== 'pending' && school.subscription_status !== 'rejected' && (
                    <button
                      onClick={() => handleSuspendToggle(school)}
                      disabled={actingId === school.id}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                        school.subscription_status === 'suspended'
                          ? 'border-green-200 dark:border-green-800/60 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10'
                          : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {actingId === school.id ? (
                        <Loader className="h-3.5 w-3.5 animate-spin" />
                      ) : school.subscription_status === 'suspended' ? (
                        'Reactivate'
                      ) : (
                        <span className="flex items-center gap-1"><ShieldOff className="h-3 w-3" />Suspend</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {managing && (
        <BillingModal
          school={managing}
          onClose={() => setManaging(null)}
          onChanged={() => { fetchSchools(); }}
        />
      )}
    </SuperAdminLayout>
  );
}

/* -------------------- Billing modal -------------------- */

/** Mirrors the backend's extension rule (platform_admin_views.py:
 * school_platform_payments) purely for the live preview — the actual
 * date is still always computed and saved server-side on submit. */
function computePreviewExpiry(currentExpiry, periodMonths) {
  const months = parseInt(periodMonths, 10);
  if (!months || months < 1) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let base = today;
  if (currentExpiry) {
    const parsed = new Date(currentExpiry + 'T00:00:00');
    if (!isNaN(parsed) && parsed > today) base = parsed;
  }
  const result = new Date(base);
  result.setMonth(result.getMonth() + months);
  return result.toISOString().slice(0, 10);
}

function BillingModal({ school, onClose, onChanged }) {
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [currentSchool, setCurrentSchool] = useState(school); // updated locally after a payment, so the header reflects the new expiry without refetching the whole list
  const [form, setForm] = useState({
    amount: '', method: 'bank_transfer', period_months: 1,
    paid_on: new Date().toISOString().slice(0, 10), note: '',
  });

  const fetchPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const res = await api.get(`/admin/schools-list/${school.id}/payments/`);
      setPayments(res.data);
    } catch (err) {
      toast.error('Could not load billing history');
    } finally {
      setLoadingPayments(false);
    }
  }, [school.id]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const totalCollected = useMemo(
    () => payments.reduce((sum, p) => sum + Number(p.amount), 0),
    [payments]
  );
  const totalMonths = useMemo(
    () => payments.reduce((sum, p) => sum + Number(p.period_months || 0), 0),
    [payments]
  );

  const previewExpiry = computePreviewExpiry(currentSchool.subscription_expiry, form.period_months);

  const submitPayment = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post(`/admin/schools-list/${school.id}/payments/`, form);
      toast.success('Payment recorded — subscription extended');
      setCurrentSchool((s) => ({ ...s, ...res.data.school }));
      setForm({ amount: '', method: 'bank_transfer', period_months: 1, paid_on: new Date().toISOString().slice(0, 10), note: '' });
      setShowForm(false);
      fetchPayments();
      onChanged();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not record payment');
    } finally {
      setSaving(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/admin/schools-list/${school.id}/export/`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${school.name.replace(/[^a-z0-9]/gi, '_')}_data_export.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Export downloaded');
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col transition-colors">
        {/* Header — school identity + a status strip, so the risk context
            that's now visible in the list is still visible once you're
            inside the modal working on it. */}
        <div className="border-b border-gray-100 dark:border-slate-800 px-6 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-lg">{currentSchool.name}</h3>
              <p className="text-xs text-gray-400 dark:text-slate-500">{currentSchool.code} · Platform billing</p>
            </div>
            <button onClick={onClose} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <StatusBadge status={currentSchool.subscription_status} />
            <AccessBadge school={currentSchool} />
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full px-2 py-1">
              <Calendar className="h-3 w-3" /> Expires {currentSchool.subscription_expiry || '—'}
            </span>
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-5">
          {/* Ledger totals — quick "how much has this school paid us,
              lifetime" summary, sitting above the actual ledger table. */}
          {!loadingPayments && payments.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-lg p-3 flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-lg"><Wallet className="h-4 w-4 text-indigo-600 dark:text-indigo-300" /></div>
                <div>
                  <p className="text-xs text-indigo-600 dark:text-indigo-300">Total collected</p>
                  <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">{totalCollected.toLocaleString()} ETB</p>
                </div>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-500/10 rounded-lg p-3 flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-500/20 rounded-lg"><TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-300" /></div>
                <div>
                  <p className="text-xs text-emerald-600 dark:text-emerald-300">Total months purchased</p>
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">{totalMonths} mo across {payments.length} payment{payments.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700 dark:text-slate-200">Billing history</p>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Record payment
            </button>
          </div>

          {showForm && (
            <form onSubmit={submitPayment} className="bg-gray-50 dark:bg-slate-800/60 border border-gray-200 dark:border-slate-700 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Amount (ETB)</label>
                  <input
                    type="number" min="0" step="0.01" value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Method</label>
                  <select
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/40"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="chapa">Chapa (online)</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Covers (months)</label>
                  <input
                    type="number" min="1" value={form.period_months}
                    onChange={(e) => setForm({ ...form, period_months: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Paid on</label>
                  <input
                    type="date" value={form.paid_on}
                    onChange={(e) => setForm({ ...form, paid_on: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/40"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-slate-300 mb-1">Note (optional)</label>
                <input
                  type="text" value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="e.g. Term 1 subscription"
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-500/40"
                />
              </div>

              {/* ✅ NEW — live preview of what this payment will actually
                  do, computed the same way the backend does (extend from
                  today or the current expiry, whichever is later), so
                  Robel isn't submitting blind. The real value is still
                  always computed server-side on save. */}
              {previewExpiry && (
                <div className="flex items-center gap-2 text-xs bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-800/60 rounded-lg px-3 py-2 text-indigo-800 dark:text-indigo-300">
                  <ArrowRight className="h-3.5 w-3.5 flex-shrink-0" />
                  This will extend access to <span className="font-semibold">{previewExpiry}</span>
                  {currentSchool.subscription_status === 'suspended' && ' and lift the suspension'}.
                </div>
              )}

              <button
                type="submit" disabled={saving}
                className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader className="h-4 w-4 animate-spin" />}
                Save payment & extend subscription
              </button>
            </form>
          )}

          {/* Ledger — a real table (date / method / period / note / amount)
              with a totals footer, instead of a stacked list of cards. */}
          {loadingPayments ? (
            <div className="flex justify-center py-8"><Loader className="h-5 w-5 animate-spin text-gray-400 dark:text-slate-500" /></div>
          ) : payments.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-8 border border-dashed border-gray-200 dark:border-slate-700 rounded-lg">
              No payments recorded yet.
            </p>
          ) : (
            <div className="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-800 text-left text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Method</th>
                    <th className="px-3 py-2 font-medium">Period</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {payments.map((p) => {
                    const meta = METHOD_META[p.method] || METHOD_META.other;
                    const MethodIcon = meta.icon;
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-800/60">
                        <td className="px-3 py-2.5 text-gray-700 dark:text-slate-300 whitespace-nowrap">{p.paid_on}</td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${meta.className}`}>
                            <MethodIcon className="h-3 w-3" /> {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 dark:text-slate-400 whitespace-nowrap">{p.period_months} mo</td>
                        <td className="px-3 py-2.5 text-gray-500 dark:text-slate-400 max-w-[160px] truncate" title={p.note}>{p.note || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                          {Number(p.amount).toLocaleString()} ETB
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-slate-800 border-t-2 border-gray-200 dark:border-slate-700">
                    <td colSpan={4} className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Total collected</td>
                    <td className="px-3 py-2.5 text-right font-bold text-gray-900 dark:text-white">{totalCollected.toLocaleString()} ETB</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 flex-shrink-0">
          <button
            onClick={exportData} disabled={exporting}
            className="w-full py-2 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {exporting ? <Loader className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export this school's data (students, staff, payments)
          </button>
        </div>
      </div>
    </div>
  );
}

export default SuperAdminSchools;
