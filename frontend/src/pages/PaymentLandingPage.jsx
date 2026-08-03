import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

// ✅ FIX (item 3): was hardcoded to a specific Render deployment URL, which
// silently breaks this page on any other environment (staging, a future
// re-deploy under a different service name, etc). Derived from the same
// REACT_APP_API_URL env var services/api.js uses — that var includes a
// trailing /api, which this file's callers append manually, so it's
// stripped back off here.
const API_BASE = (
  process.env.REACT_APP_API_URL || "https://felege-selam-payment-system.onrender.com/api"
).replace(/\/api\/?$/, "");

const STATUS_MESSAGES = {
  expired: "This payment link has expired. Please contact the school office for a new one.",
  invalid: "This link could not be verified. Do not enter any payment details. Contact the school directly.",
  already_used: "This link was already used. If you didn't pay, contact the school immediately.",
  rate_limited: "Too many attempts. Please wait 15 minutes and try again.",
  locked: "Too many incorrect codes. Contact the school to unlock.",
  network: "Connection failed. Check your internet and retry.",
  otp_send_failed: "We couldn't send your verification code. Please try again in a moment or contact the school.",
  timeout: "The server is waking up — this can take up to 60-90 seconds. Please wait a moment, then refresh this page.",
};

const getFullUrl = (path) => {
  if (!path) return null;
  if (typeof path !== 'string') return null;
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
};

const InitialsAvatar = ({ name, size = "w-14 h-14", textSize = "text-lg" }) => {
  const initials = name
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

export default function PaymentLandingPage() {
  const { token } = useParams();
  const [state, setState] = useState({ phase: "loading" });
  const [otp, setOtp] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(null);

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    
    try {
      const res = await fetch(`${API_BASE}/api/pay/${token}/`, { 
        cache: "no-store",
        headers: { "Accept": "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`HTTP ${res.status}: Invalid JSON response`);
      }
      
      if (!res.ok && !data?.status) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      if (data.status === "ok") {
        const processedData = {
          ...data,
          school_seal_url: getFullUrl(data.school_seal_url),
          student_photo_url: data.student_photo_url ? getFullUrl(data.student_photo_url) : null,
        };
        setState({ phase: "ready", data: processedData });
      } else if (data.status === "otp_required") {
        setState({ phase: "otp", data });
      } else {
        setState({ phase: "error", code: data.status });
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("Load failed:", err);
      if (err.name === "AbortError") {
        setState({ phase: "error", code: "timeout" });
      } else {
        setState({ phase: "error", code: "network" });
      }
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (state.phase !== "ready" || !state.data?.expires_at) return;
    const tick = () => {
      const diff = Math.floor((new Date(state.data.expires_at) - Date.now()) / 1000);
      setSecondsLeft(Math.max(diff, 0));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state]);

  const submitOtp = async () => {
    try {
      // ✅ Normalize OTP: Remove dashes/spaces before sending to backend
      const normalizedOtp = otp.replace(/[-\s]/g, "");

      if (normalizedOtp.length !== 6) {
        setState((s) => ({ ...s, otpError: "Please enter all 6 digits." }));
        return;
      }

      const res = await fetch(`${API_BASE}/api/pay/${token}/verify-otp/`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ code: normalizedOtp }),
        cache: "no-store",
      });
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`HTTP ${res.status}: Invalid JSON response`);
      }
      
      if (!res.ok && !data?.status) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      if (data.status === "ok") {
        setState({ 
          phase: "ready", 
          data: {
            ...data,
            school_seal_url: getFullUrl(data.school_seal_url),
            student_photo_url: data.student_photo_url ? getFullUrl(data.student_photo_url) : null,
          }
        });
      } else if (data.status === "otp_invalid") {
        setState((s) => ({ ...s, otpError: "Incorrect code. Check your SMS." }));
      } else {
        setState({ phase: "error", code: data.status });
      }
    } catch (err) {
      console.error("OTP submit failed:", err);
      setState({ phase: "error", code: "network" });
    }
  };

  const pay = async () => {
    setState((s) => ({ ...s, paying: true }));
    try {
      const res = await fetch(`${API_BASE}/api/pay/${token}/initiate/`, { 
        method: "POST",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`HTTP ${res.status}: Invalid JSON response`);
      }
      
      if (!res.ok && !data?.status) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      if (data.status === "ok") {
        window.location.href = data.checkout_url;
      } else {
        setState({ phase: "error", code: data.status });
      }
    } catch (err) {
      console.error("Pay failed:", err);
      setState({ phase: "error", code: "network" });
    }
  };

  if (state.phase === "loading") {
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-slate-500">
        Verifying secure link…
      </div>
    );
  }

  if (state.phase === "processing") {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-sm w-full border border-emerald-200 bg-emerald-50 rounded-2xl p-6 text-center">
          <p className="font-semibold text-emerald-800 mb-2">Redirecting to Secure Payment...</p>
          <p className="text-sm text-emerald-700 leading-relaxed">
            Please do not close this page or click the back button. 
            You will be redirected to Telebirr/CBE shortly.
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-sm w-full border border-rose-200 bg-rose-50 rounded-2xl p-6">
          <p className="font-semibold text-rose-800 mb-2">Link Verification Failed</p>
          <p className="text-sm text-rose-700 leading-relaxed">
            {STATUS_MESSAGES[state.code] || STATUS_MESSAGES.invalid}
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === "otp") {
    const d = state.data;
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-sm w-full border border-slate-200 rounded-2xl p-6 shadow-sm bg-white">
          <p className="font-semibold text-slate-800 mb-1">Security Verification</p>
          <p className="text-sm text-slate-500 mb-5 leading-relaxed">
            For your safety, we've sent a code to your {d.channel === "email" ? "email" : "phone"}: <span className="font-mono font-medium">{d.masked_phone}</span>. 
            Enter it below to access your payment details.
          </p>
          
          {/* ✅ FIXED INPUT FIELD: Allows dashes, visual hint matches SMS format */}
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/[^\d-]/g, "").slice(0, 7))} 
            inputMode="numeric"
            maxLength={7} 
            className="w-full border border-slate-300 rounded-xl py-3 text-center text-xl tracking-[0.3em] mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            placeholder="___-___" 
          />
          
          {state.otpError && <p className="text-sm text-rose-600 mb-3">{state.otpError}</p>}
          <button
            onClick={submitOtp}
            disabled={otp.length < 6} // Allow clicking once 6+ chars (digits+dashes) are entered
            className="w-full bg-slate-900 disabled:bg-slate-300 text-white rounded-xl py-3 font-medium transition-colors"
          >
            Confirm Code
          </button>
        </div>
      </div>
    );
  }

  const d = state.data;
  const mins = secondsLeft !== null ? Math.floor(secondsLeft / 60) : null;
  const secs = secondsLeft !== null ? secondsLeft % 60 : null;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-sm w-full border border-slate-200 rounded-2xl shadow-sm bg-white overflow-hidden">
        
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          {d.school_seal_url ? (
            <img src={d.school_seal_url} alt="" className="w-9 h-9 rounded-full object-cover border border-slate-200" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
              {d.school_name.charAt(0)}
            </div>
          )}
          <div>
            <p className="font-semibold text-slate-800 leading-tight">{d.school_name}</p>
            <p className="text-xs text-slate-400">Txn #{d.transaction_id}</p>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-5">
            {d.student_photo_url ? (
              <img src={d.student_photo_url} alt="" className="w-14 h-14 rounded-full object-cover border border-slate-200" />
            ) : (
              <InitialsAvatar name={d.student_name} />
            )}
            <div>
              <p className="font-medium text-slate-800">{d.student_name}</p>
              <p className="text-2xl font-semibold text-slate-900">
                {d.amount} <span className="text-sm font-normal text-slate-400">{d.currency}</span>
              </p>
            </div>
          </div>

          {secondsLeft !== null && (
            <p className="text-xs text-slate-400 mb-4 text-center">
              Secure link expires in {mins}m {secs}s
            </p>
          )}

          <button
            onClick={pay}
            disabled={state.paying}
            className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-300 text-white rounded-xl py-3.5 font-medium transition-all active:scale-[0.98]"
          >
            {state.paying ? "Redirecting to Payment…" : "Pay Now (Telebirr / CBE)"}
          </button>
          
          <p className="text-[10px] text-slate-400 text-center mt-3 leading-tight">
            Protected by anti-spoofing verification. Never share your SMS code with anyone calling you.
          </p>
        </div>
      </div>
    </div>
  );
}