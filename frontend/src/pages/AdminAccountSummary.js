// src/pages/AdminAccountSummary.js
//
// NEW (requested): a dedicated, professional page - not a small
// dashboard card - showing the school admin two things clearly:
//   1. Their school's own current Chapa balance (read-only, live from
//      Chapa's own Balance API using the school's own credentials)
//   2. What the school has accrued in developer usage fees (5 ETB per
//      monthly payment, 2 ETB per registration payment), what's
//      already been settled, and the outstanding balance - with a
//      month-by-month breakdown so the total is never a mystery
//      number, and clear language that this is an ANNOUNCEMENT, not
//      an automatic deduction: nothing here moves money on its own.
import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, TrendingUp, CheckCircle2, AlertCircle, RefreshCw, Info } from 'lucide-react';
import api from '../services/api';

function AdminAccountSummary() {
  const [feeSummary, setFeeSummary] = useState(null);
  const [feeLoading, setFeeLoading] = useState(true);
  const [feeError, setFeeError] = useState(null);

  const [balance, setBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(true);

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

  useEffect(() => {
    fetchFeeSummary();
    fetchBalance();
  }, [fetchFeeSummary, fetchBalance]);

  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
            A small amount is tracked for each payment processed through this system:
            5 ETB per monthly payment, 2 ETB per registration payment.
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
                directly (bank transfer), the same way as your annual license fee. Once received, it will be
                recorded here as settled.
              </p>
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
                              {row.monthly_count} x 5 ETB = {fmt(row.monthly_total)} ETB
                            </td>
                            <td className="px-6 py-3 text-gray-600">
                              {row.registration_count} x 2 ETB = {fmt(row.registration_total)} ETB
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
