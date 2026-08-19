import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const API_BASE = "https://felege-selam-payment-system.onrender.com";

const STATUS_MESSAGES = {
  not_found: "Receipt not found. It may not exist, or the payment isn't confirmed yet.",
  network: "Connection failed. Check your internet and retry.",
  timeout: "The server is waking up — this can take up to 60-90 seconds. Please wait a moment, then refresh this page.",
};

const InitialsAvatar = ({ name, size = "w-14 h-14", textSize = "text-lg" }) => {
  const initials = (name || "")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className={`${size} rounded-full bg-emerald-100 flex items-center justify-center ${textSize} font-bold text-emerald-700 border border-emerald-200`}>
      {initials || "?"}
    </div>
  );
};

export default function ReceiptPage() {
  const { token } = useParams();
  const [state, setState] = useState({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    try {
      const res = await fetch(`${API_BASE}/api/receipt/${token}/`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`HTTP ${res.status}: Invalid JSON response`);
      }

      if (!res.ok) {
        setState({ phase: "error", code: "not_found" });
        return;
      }

      setState({ phase: "ready", data });
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("Receipt load failed:", err);
      if (err.name === "AbortError") {
        setState({ phase: "error", code: "timeout" });
      } else {
        setState({ phase: "error", code: "network" });
      }
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePrint = () => {
    window.print();
  };

  if (state.phase === "loading") {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-slate-500">
        Loading receipt…
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-sm w-full border border-rose-200 bg-rose-50 rounded-2xl p-6">
          <p className="font-semibold text-rose-800 mb-2">Couldn't Load Receipt</p>
          <p className="text-sm text-rose-700 leading-relaxed">
            {STATUS_MESSAGES[state.code] || STATUS_MESSAGES.not_found}
          </p>
        </div>
      </div>
    );
  }

  const d = state.data;
  const verifiedDate = d.verified_at
    ? new Date(d.verified_at).toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
      <div
        id="receipt-card"
        className="max-w-sm w-full border border-slate-200 rounded-2xl shadow-sm bg-white overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
            {(d.school_name || "?").charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-slate-800 leading-tight">{d.school_name}</p>
            <p className="text-xs text-slate-400">Invoice #{d.invoice_number}</p>
          </div>
        </div>

        {/* Confirmed banner */}
        <div className={`flex items-center justify-center gap-2 border-b py-3 ${
          d.is_registration ? 'bg-purple-50 border-purple-100' : 'bg-emerald-50 border-emerald-100'
        }`}>
          <span className={`font-medium text-sm ${d.is_registration ? 'text-purple-700' : 'text-emerald-700'}`}>
            {d.is_registration ? '✅ Registration Fee Confirmed' : '✅ Payment Confirmed'}
          </span>
        </div>

        <div className="px-6 py-5">
          {/* Student */}
          <div className="flex items-center gap-3 mb-5">
            <InitialsAvatar name={d.student_name} />
            <div>
              <p className="font-medium text-slate-800">{d.student_name}</p>
              <p className="text-xs text-slate-400">
                {d.student_id} • Grade {d.grade}
                {d.section ? ` - ${d.section}` : ""}
              </p>
            </div>
          </div>

          {/* Amount */}
          <div className="text-center mb-5">
            {d.is_registration && (
              <span className="inline-block text-xs font-medium text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full mb-2">
                One-Time Registration Fee
              </span>
            )}
            <p className="text-3xl font-semibold text-slate-900">
              {d.amount} <span className="text-sm font-normal text-slate-400">{d.currency}</span>
            </p>
          </div>

          {/* Details */}
          <div className="space-y-2 text-sm border-t border-slate-100 pt-4">
            <div className="flex justify-between">
              <span className="text-slate-400">{d.is_registration ? 'Fee Type' : 'Month'}</span>
              <span className="text-slate-800 font-medium">{d.month || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Academic Year</span>
              <span className="text-slate-800 font-medium">{d.academic_year || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Payment Method</span>
              <span className="text-slate-800 font-medium capitalize">{d.payment_method || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Reference</span>
              <span className="text-slate-800 font-medium font-mono text-xs">
                {d.transaction_reference || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Paid By</span>
              <span className="text-slate-800 font-medium">{d.paid_by || "—"}</span>
            </div>
            {verifiedDate && (
              <div className="flex justify-between">
                <span className="text-slate-400">Confirmed On</span>
                <span className="text-slate-800 font-medium">{verifiedDate}</span>
              </div>
            )}
          </div>

          {/* Download / Print */}
          <button
            onClick={handlePrint}
            className="w-full mt-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-3 font-medium transition-colors print:hidden"
          >
            Download / Print Receipt
          </button>

          <p className="text-[10px] text-slate-400 text-center mt-3 leading-tight print:hidden">
            This is your official payment receipt. Keep this link private.
          </p>
        </div>
      </div>
    </div>
  );
}