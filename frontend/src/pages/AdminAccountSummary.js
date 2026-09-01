// src/pages/AdminAccountSummary.js
//
// NEW (requested): a dedicated, professional page - not a small
// dashboard card - showing the school admin two things clearly:
//   1. Their school's own current Chapa balance (read-only, live from
//      Chapa's own Balance API using the school's own credentials)
//   2. What the school has accrued in developer usage fees (rate set
//      live by the super admin), what's already been settled, and the
//      outstanding balance - with a month-by-month breakdown so the
//      total is never a mystery number, and clear language that this
//      is an ANNOUNCEMENT, not an automatic deduction: nothing here
//      moves money on its own.
//
// ✅ NEW (requested): a "Send a Payment" form so the school admin can
// tell the developer they've sent a bank transfer, attach a receipt,
// and track its status (pending / confirmed / rejected) themselves —
// instead of the balance only ever changing when the super admin
// quietly typed something in on their end with no visibility here.
import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, TrendingUp, CheckCircle2, AlertCircle, RefreshCw, Info, Send, Clock, XCircle, Upload } from 'lucide-react';
import api from '../services/api';

const STATUS_BADGE = {
  pending: { label: 'Pending review', icon: Clock, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed: { label: 'Confirmed', icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejected', icon: XCircle, cls: 'bg-red-50 text-red-700 border-red-200' },
};

function SettlementStatusBadge({ status }) {
  const cfg = STATUS_BADGE[status] || STATUS_BADGE.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${cfg.cls}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

function AdminAccountSummary() {
  const [feeSummary, setFeeSummary] = useState(null);
  const [feeLoading, setFeeLoading] = useState(true);
  const [feeError, setFeeError] = useState(null);

  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(true);

  // ✅ NEW: "Send a Payment" form state + the school's own submission history
  const [mySettlements, setMySettlements] = useState([]);
  const [settlementsLoading, setSettlementsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formAmount, setFormAmount] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formReceipt, setFormReceipt] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(null);

  const fetchFeeSummary = useCallback(async () => {
    setFeeLoading(true);
    setFeeError(null);
    try {
      const res = await api.get('/developer-fee-summary/');
      setFeeSummary(res.data);
    } catch (err) {
      console.error('Error fetching developer fee summary:', err);
      setFeeError('Could not load fee summary. Please try refreshing.');
    } finally {
      setFeeLoading(false);
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const res = await api.get('/my-school-chapa-balance/');
      setBalance(res.data);
    } catch (err) {
      console.error('Error fetching Chapa balance:', err);
      setBalance({ success: false, error: 'Could not reach Chapa.' });
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  const fetchMySettlements = useCallback(async () => {
    setSettlementsLoading(true);
    try {
      const res = await api.get('/my-school/developer-fee-settlements/');
      setMySettlements(res.data.settlements || []);
    } catch (err) {
      console.error('Error fetching settlement history:', err);
    } finally {
      setSettlementsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeeSummary();
    fetchBalance();
    fetchMySettlements();
  }, [fetchFeeSummary, fetchBalance, fetchMySettlements]);

  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleSubmitSettlement = async (e) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    if (!formAmount || Number(formAmount) <= 0) {
      setFormError('Enter the amount you sent.');
      return;
    }
    if (!formReceipt) {
      setFormError('Attach a screenshot or photo of the receipt.');
      return;
    }
    setFormSubmitting(true);
    try {
      const data = new FormData();
      data.append('amount', formAmount);
      data.append('note', formNote);
      data.append('receipt', formReceipt);
      await api.post('/my-school/developer-fee-settlements/submit/', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setFormSuccess('Sent! The developer will review your receipt and confirm it shortly.');
      setFormAmount('');
      setFormNote('');
      setFormReceipt(null);
      setFormOpen(false);
      fetchMySettlements();
      fetchFeeSummary();
    } catch (err) {
      console.error('Error submitting settlement:', err);
      setFormError(err.response?.data?.error || 'Could not submit — please try again.');
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary-600" />
          Account &amp; Fees
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Your school's Chapa balance, and the developer usage fee accrued from payments processed through this system.
        </p>
      </div>

      {/* ==================== CHAPA BALANCE ==================== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">School Chapa Balance</h2>
          <button
            onClick={fetchBalance}
            className="text-gray-400 hover:text-gray-600"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${balanceLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="p-6">
          {balanceLoading ? (
            <div className="flex justify-center py-4"><RefreshCw className="h-6 w-6 animate-spin text-gray-300" /></div>
          ) : !balance?.success ? (
            <div className="flex items-start gap-3 text-sm text-gray-500">
              <AlertCircle className="h-5 w-5 text-gray-300 flex-shrink-0 mt-0.5" />
              <div>
                <p>Balance not available right now{balance?.error ? ` (${balance.error})` : ''}.</p>
                <p className="text-xs text-gray-400 mt-1">
                  This reads your balance directly from Chapa using your school's own Chapa API key - make sure
                  it's configured under Chapa Payment settings.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-900">
                  {fmt(balance.etb_balance?.available_balance ?? balance.all_balances?.[0]?.available_balance)}
                </span>
                <span className="text-gray-500 font-medium">ETB available</span>
              </div>
              {/* ✅ NEW: show ledger balance alongside available balance.
                  Chapa's Balance API returns BOTH numbers, and they can
                  legitimately differ a lot — "ledger" includes funds not
                  yet settled/withdrawable (and in test mode, Chapa's own
                  dashboard often shows an inflated demo ledger figure
                  that has nothing to do with real transactions). Showing
                  only "available" (0.00 in test mode, since test money
                  isn't real/withdrawable) with no context looked like a
                  bug. Displaying both makes it clear which number is
                  which, and why they can disagree. */}
              {(balance.etb_balance?.ledger_balance ?? balance.all_balances?.[0]?.ledger_balance) !== undefined && (
                <p className="text-sm text-gray-400 mt-1">
                  Ledger balance (incl. unsettled funds): {fmt(balance.etb_balance?.ledger_balance ?? balance.all_balances?.[0]?.ledger_balance)} ETB
                </p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                "Available" is real, withdrawable money. In Chapa test mode this is usually 0 — test transactions aren't real funds. Switch to a live API key to see real available balance from real payments.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ==================== DEVELOPER FEE SUMMARY ==================== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Developer Usage Fee</h2>
          <p className="text-xs text-gray-500 mt-1">
            {/* ✅ FIXED: was hardcoded "5 ETB / 2 ETB" text — now reads the
                live rate set by the super admin, so a rate change shows up
                here automatically instead of silently going stale. */}
            A small amount is tracked for each payment processed through this system:
            {feeSummary?.current_rates
              ? ` ${fmt(feeSummary.current_rates.monthly_payment_fee)} ETB per monthly payment, ${fmt(feeSummary.current_rates.registration_payment_fee)} ETB per registration payment.`
              : ' rate set by the platform.'}
          </p>
        </div>

        {feeLoading ? (
          <div className="p-8 flex justify-center"><RefreshCw className="h-6 w-6 animate-spin text-gray-300" /></div>
        ) : feeError ? (
          <p className="p-6 text-sm text-red-500">{feeError}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
              <div className="p-6">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Total Accrued</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(feeSummary.total_accrued)} <span className="text-sm font-normal text-gray-400">ETB</span></p>
              </div>
              <div className="p-6">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Already Settled</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(feeSummary.total_settled)} <span className="text-sm font-normal text-gray-400">ETB</span></p>
              </div>
              <div className="p-6 bg-amber-50">
                <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Outstanding Balance</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{fmt(feeSummary.balance_owed)} <span className="text-sm font-normal text-amber-500">ETB</span></p>
              </div>
            </div>

            <div className="px-6 py-4 bg-blue-50 border-t border-blue-100 flex items-start gap-3">
              <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800">
                This is an <strong>announcement only</strong> - nothing is ever deducted automatically from your
                school's account. When convenient, please arrange to send the outstanding balance to the developer
                directly (bank transfer), the same way as your annual license fee. Once you've sent it, use
                "Send a Payment" below to attach your receipt — the balance updates once it's reviewed and confirmed.
              </p>
            </div>

            {/* ✅ NEW: pending-review note — the balance above does NOT yet
                reflect anything the school has submitted but the developer
                hasn't confirmed. Without this line the school could send a
                receipt and be confused why "Outstanding Balance" didn't
                move immediately. */}
            {Number(feeSummary.pending_settlement_amount) > 0 && (
              <div className="px-6 py-3 bg-amber-50 border-t border-amber-100 flex items-center gap-2 text-xs text-amber-800">
                <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                {fmt(feeSummary.pending_settlement_amount)} ETB is awaiting the developer's review right now — it
                will move from "Outstanding" once confirmed.
              </div>
            )}

            {/* ==================== SEND A PAYMENT ==================== */}
            <div className="border-t border-gray-100">
              <div className="px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                    <Send className="h-4 w-4 text-primary-600" /> Send a Payment
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Sent a bank transfer to the developer? Log it here with your receipt.</p>
                </div>
                <button
                  onClick={() => setFormOpen((v) => !v)}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700 px-3 py-1.5 rounded-lg border border-primary-200 hover:bg-primary-50"
                >
                  {formOpen ? 'Cancel' : 'I sent a payment'}
                </button>
              </div>

              {formOpen && (
                <form onSubmit={handleSubmitSettlement} className="px-6 pb-6 space-y-3">
                  {formError && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Amount sent (ETB)</label>
                      <input
                        type="number" min="0" step="0.01" value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        placeholder={fmt(feeSummary.balance_owed)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Note (optional)</label>
                      <input
                        type="text" value={formNote} onChange={(e) => setFormNote(e.target.value)}
                        placeholder="e.g. CBE transfer, 1 Sep 2026"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Receipt / screenshot</label>
                    <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-3 py-3 text-sm text-gray-500 cursor-pointer hover:bg-gray-50">
                      <Upload className="h-4 w-4" />
                      {formReceipt ? formReceipt.name : 'Click to choose a photo or screenshot'}
                      <input
                        type="file" accept="image/*" className="hidden"
                        onChange={(e) => setFormReceipt(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                  <button
                    type="submit" disabled={formSubmitting}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                  >
                    {formSubmitting ? 'Sending…' : 'Submit for review'}
                  </button>
                </form>
              )}

              {formSuccess && (
                <div className="mx-6 mb-4 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  <CheckCircle2 className="h-4 w-4" /> {formSuccess}
                </div>
              )}

              {/* ✅ NEW: submission history so the school always knows exactly
                  where each thing they sent stands — this is the real-time
                  visibility the developer/school communication was missing. */}
              {!settlementsLoading && mySettlements.length > 0 && (
                <div className="px-6 pb-6 space-y-2">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Your submissions</h4>
                  {mySettlements.map((s) => (
                    <div key={s.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{fmt(s.amount)} ETB {s.note && <span className="text-gray-400 font-normal">— {s.note}</span>}</p>
                        <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString()}</p>
                        {s.status === 'rejected' && s.rejection_reason && (
                          <p className="text-xs text-red-600 mt-1">Reason: {s.rejection_reason}</p>
                        )}
                      </div>
                      <SettlementStatusBadge status={s.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {feeSummary.breakdown && feeSummary.breakdown.length > 0 && (
              <div className="border-t border-gray-100">
                <div className="px-6 py-3 bg-gray-50">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" /> Monthly Breakdown
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 uppercase">
                        <th className="px-6 py-2 font-medium">Month</th>
                        <th className="px-6 py-2 font-medium">Monthly Payments</th>
                        <th className="px-6 py-2 font-medium">Registration Payments</th>
                        <th className="px-6 py-2 font-medium text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {feeSummary.breakdown.map((row) => {
                        const rowTotal = Number(row.monthly_total || 0) + Number(row.registration_total || 0);
                        return (
                          <tr key={row.month}>
                            <td className="px-6 py-3 font-medium text-gray-800">{row.month}</td>
                            <td className="px-6 py-3 text-gray-600">
                              {/* ✅ FIXED: was hardcoded "x 5 ETB" — that's wrong for any
                                  month where the rate differs, since past months keep
                                  whatever rate was active when each payment was verified
                                  (see Payment.save()). Deriving the per-payment rate from
                                  the row's own total/count is correct even across a rate
                                  change, unlike printing the current rate for every row. */}
                              {row.monthly_count} x {fmt(row.monthly_count ? row.monthly_total / row.monthly_count : (feeSummary.current_rates?.monthly_payment_fee || 0))} ETB = {fmt(row.monthly_total)} ETB
                            </td>
                            <td className="px-6 py-3 text-gray-600">
                              {row.registration_count} x {fmt(row.registration_count ? row.registration_total / row.registration_count : (feeSummary.current_rates?.registration_payment_fee || 0))} ETB = {fmt(row.registration_total)} ETB
                            </td>
                            <td className="px-6 py-3 text-right font-semibold text-gray-900">{fmt(rowTotal)} ETB</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {feeSummary.balance_owed <= 0 && (
              <div className="px-6 py-4 flex items-center gap-2 text-sm text-emerald-600 border-t border-gray-100">
                <CheckCircle2 className="h-4 w-4" /> Nothing currently outstanding.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminAccountSummary;