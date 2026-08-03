// frontend/src/components/Admin/SchoolBankAccounts.js
//
// Admin UI for managing a school's bank accounts.
// Replaces the old single bank_name/account_number fields that only
// supported one bank per school. Multiple accounts can now exist, one
// marked as primary. Parents see all active accounts when choosing how
// to pay.
import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, Plus, Trash2, Star, StarOff, Loader,
  CheckCircle2, AlertTriangle, Edit2, X, Save,
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const BANK_CHOICES = [
  { value: 'cbe', label: 'Commercial Bank of Ethiopia (CBE)' },
  { value: 'awash', label: 'Awash Bank' },
  { value: 'dashen', label: 'Dashen Bank' },
  { value: 'abyssinia', label: 'Bank of Abyssinia' },
  { value: 'ahadu', label: 'Ahadu Bank' },
  { value: 'nib', label: 'Nib International Bank' },
  { value: 'coop_oromia', label: 'Cooperative Bank of Oromia' },
  { value: 'zemen', label: 'Zemen Bank' },
  { value: 'berhan', label: 'Berhan Bank' },
  { value: 'wegagen', label: 'Wegagen Bank' },
  { value: 'amhara', label: 'Amhara Bank' },
  { value: 'debub', label: 'Debub Global Bank' },
  { value: 'abay', label: 'Abay Bank' },
  { value: 'oromia', label: 'Oromia Bank' },
  { value: 'sidama', label: 'Sidama Bank' },
  { value: 'enat', label: 'Enat Bank' },
  { value: 'addis_international', label: 'Addis International Bank' },
  { value: 'united', label: 'United Bank' },
  { value: 'telebirr', label: 'Telebirr (Ethio Telecom)' },
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'other', label: 'Other (specify below)' },
];

const EMPTY_FORM = {
  bank_code: 'cbe',
  bank_name_override: '',
  account_number: '',
  account_holder: '',
  display_label: '',
  is_primary: false,
  is_active: true,
  supports_auto_verify: false,
};

export default function SchoolBankAccounts() {
  const { getAuthHeader } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/bank-accounts/', { headers: getAuthHeader() });
      setAccounts(res.data?.results || res.data || []);
    } catch {
      setError('Failed to load bank accounts');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  };

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, is_primary: accounts.length === 0 });
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (acc) => {
    setForm({
      bank_code: acc.bank_code,
      bank_name_override: acc.bank_name_override || '',
      account_number: acc.account_number,
      account_holder: acc.account_holder,
      display_label: acc.display_label || '',
      is_primary: acc.is_primary,
      is_active: acc.is_active,
      supports_auto_verify: acc.supports_auto_verify,
    });
    setEditingId(acc.id);
    setShowForm(true);
  };

  const cancelForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.account_number.trim() || !form.account_holder.trim()) {
      flash('Account number and account holder are required', true);
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/bank-accounts/${editingId}/`, form, { headers: getAuthHeader() });
        flash('Bank account updated');
      } else {
        await api.post('/bank-accounts/', form, { headers: getAuthHeader() });
        flash('Bank account added');
      }
      cancelForm();
      load();
    } catch (err) {
      flash(err.response?.data?.error || JSON.stringify(err.response?.data) || 'Failed to save', true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, label) => {
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/bank-accounts/${id}/`, { headers: getAuthHeader() });
      flash('Bank account removed');
      load();
    } catch {
      flash('Failed to delete bank account', true);
    }
  };

  const handleSetPrimary = async (acc) => {
    setSaving(true);
    try {
      await api.patch(`/bank-accounts/${acc.id}/`, { is_primary: true }, { headers: getAuthHeader() });
      flash(`${acc.bank_name} set as primary`);
      load();
    } catch {
      flash('Failed to set primary', true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary-600" />
            Bank Accounts
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Add every bank or wallet parents can pay into. They will see all active accounts
            and can choose which one they used when uploading a slip.
          </p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="h-4 w-4" /> Add Account
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border-l-4 border-green-500 p-3 rounded text-green-700 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />{success}
        </div>
      )}

      {/* ── Add / Edit form ──────────────────────────────────────── */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{editingId ? 'Edit Bank Account' : 'Add Bank Account'}</h3>
            <button onClick={cancelForm} className="text-gray-500 hover:text-gray-700"><X className="h-5 w-5" /></button>
          </div>
          <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank / Wallet *</label>
              <select
                className="input-field"
                value={form.bank_code}
                onChange={e => setForm(f => ({ ...f, bank_code: e.target.value }))}
              >
                {BANK_CHOICES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>

            {form.bank_code === 'other' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name (custom)</label>
                <input
                  className="input-field"
                  placeholder="e.g. Ethio-Islamic Microfinance"
                  value={form.bank_name_override}
                  onChange={e => setForm(f => ({ ...f, bank_name_override: e.target.value }))}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Number *</label>
              <input
                className="input-field"
                placeholder="e.g. 1000123456789"
                value={form.account_number}
                onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder Name *</label>
              <input
                className="input-field"
                placeholder="e.g. Felege Selam School"
                value={form.account_holder}
                onChange={e => setForm(f => ({ ...f, account_holder: e.target.value }))}
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Label <span className="text-gray-400">(optional, shown to parents)</span>
              </label>
              <input
                className="input-field"
                placeholder='e.g. "Main fee account (CBE)" — leave blank to auto-generate'
                value={form.display_label}
                onChange={e => setForm(f => ({ ...f, display_label: e.target.value }))}
              />
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_primary}
                  onChange={e => setForm(f => ({ ...f, is_primary: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-700">Set as primary account</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-700">Active (visible to parents)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.supports_auto_verify}
                  onChange={e => setForm(f => ({ ...f, supports_auto_verify: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm font-medium text-gray-700">
                  Auto-verify via Verify.ET
                  <span className="text-gray-400 ml-1">(CBE only)</span>
                </span>
              </label>
            </div>

            <div className="sm:col-span-2 flex gap-3 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingId ? 'Save Changes' : 'Add Account'}
              </button>
              <button type="button" onClick={cancelForm} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Account list ─────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader className="h-6 w-6 animate-spin text-primary-600" /></div>
      ) : accounts.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center text-sm text-yellow-800">
          <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
          No bank accounts yet. Parents will not know where to send money until you add at least one.
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => (
            <div
              key={acc.id}
              className={`bg-white rounded-xl border p-4 flex flex-wrap items-start gap-4 ${
                acc.is_primary ? 'border-primary-300 shadow-sm' : 'border-gray-200'
              } ${!acc.is_active ? 'opacity-60' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900">{acc.bank_name}</span>
                  {acc.is_primary && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-100 text-primary-700 flex items-center gap-1">
                      <Star className="h-3 w-3" /> Primary
                    </span>
                  )}
                  {!acc.is_active && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Inactive</span>
                  )}
                  {acc.supports_auto_verify && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Auto-verify</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-mono">{acc.account_number}</span>
                  {' · '}{acc.account_holder}
                </p>
                {acc.display_label && (
                  <p className="text-xs text-gray-400 mt-0.5">"{acc.display_label}"</p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {!acc.is_primary && (
                  <button
                    onClick={() => handleSetPrimary(acc)}
                    title="Set as primary"
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
                  >
                    <StarOff className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => openEdit(acc)}
                  title="Edit"
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(acc.id, acc.bank_name)}
                  title="Delete"
                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {accounts.length > 0 && (
        <p className="text-xs text-gray-400">
          Parents see all active accounts and choose which bank they paid into when uploading a slip.
          The primary account is shown first.
        </p>
      )}
    </div>
  );
}
