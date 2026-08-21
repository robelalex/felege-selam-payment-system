// src/pages/superadmin/SuperAdminSchools.js
import React, { useEffect, useState, useCallback } from 'react';
import {
  Search, Building2, Loader, CheckCircle2, PauseCircle, XCircle, Clock, ShieldOff,
  X, Download, Plus, AlertTriangle, Receipt,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import SuperAdminLayout from '../../components/Layout/SuperAdminLayout';

const STATUS_META = {
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700', icon: Clock },
  suspended: { label: 'Suspended', className: 'bg-gray-200 text-gray-700', icon: PauseCircle },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700', icon: XCircle },
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

function SuperAdminSchools() {
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
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
          <p className="text-sm text-gray-400">All schools</p>
          <h1 className="text-2xl font-semibold text-gray-900">Schools</h1>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg text-sm px-3 py-2"
        >
          <option value="">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : schools.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-16">No schools match this search.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {schools.map((school) => (
              <div key={school.id} className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">{school.name}</p>
                    <p className="text-xs text-gray-500">
                      {school.code}{school.city ? ` · ${school.city}` : ''}
                      {school.subscription_expiry ? ` · expires ${school.subscription_expiry}` : ''}
                    </p>
                    <p className="text-xs text-gray-400">
                      Admin: {school.admin_name || '—'} {school.admin_email ? `(${school.admin_email})` : ''}
                      {school.admin_email_verified === false && (
                        <span className="ml-1 text-amber-600">· email unverified</span>
                      )}
                    </p>
                    {school.is_access_suspended ? (
                      <p className="text-xs text-red-600 font-medium flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3" /> School-side access is currently locked out
                      </p>
                    ) : school.days_until_access_suspended !== null && school.days_until_access_suspended !== undefined ? (
                      <p className="text-xs text-amber-600 font-medium flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="h-3 w-3" /> {school.days_until_access_suspended} day(s) left in grace period
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <StatusBadge status={school.subscription_status} />
                  <button
                    onClick={() => setManaging(school)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                  >
                    Manage billing
                  </button>
                  {school.subscription_status !== 'pending' && school.subscription_status !== 'rejected' && (
                    <button
                      onClick={() => handleSuspendToggle(school)}
                      disabled={actingId === school.id}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                        school.subscription_status === 'suspended'
                          ? 'border-green-200 text-green-700 hover:bg-green-50'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
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

function BillingModal({ school, onClose, onChanged }) {
  const [payments, setPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
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

  const submitPayment = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/admin/schools-list/${school.id}/payments/`, form);
      toast.success('Payment recorded — subscription extended');
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
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">{school.name}</h3>
            <p className="text-xs text-gray-400">Platform billing history</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">
              Current expiry: <span className="font-medium text-gray-800">{school.subscription_expiry || '—'}</span>
            </p>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Record payment
            </button>
          </div>

          {showForm && (
            <form onSubmit={submitPayment} className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount (ETB)</label>
                  <input
                    type="number" min="0" step="0.01" value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
                  <select
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="chapa">Chapa (online)</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Covers (months)</label>
                  <input
                    type="number" min="1" value={form.period_months}
                    onChange={(e) => setForm({ ...form, period_months: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Paid on</label>
                  <input
                    type="date" value={form.paid_on}
                    onChange={(e) => setForm({ ...form, paid_on: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                <input
                  type="text" value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="e.g. Term 1 subscription"
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <button
                type="submit" disabled={saving}
                className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader className="h-4 w-4 animate-spin" />}
                Save payment & extend subscription
              </button>
            </form>
          )}

          {loadingPayments ? (
            <div className="flex justify-center py-8"><Loader className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : payments.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No payments recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Receipt className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800">{Number(p.amount).toLocaleString()} ETB · {p.period_months} mo</p>
                      <p className="text-xs text-gray-400 truncate">
                        {p.paid_on} · {p.method.replace('_', ' ')}{p.note ? ` · ${p.note}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={exportData} disabled={exporting}
            className="w-full py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 disabled:opacity-50"
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
