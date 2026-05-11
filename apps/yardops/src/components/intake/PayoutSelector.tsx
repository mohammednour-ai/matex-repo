"use client";

import { useState } from "react";
import { CreditCard, Building2, Banknote, AlertTriangle } from "lucide-react";

const HST_RATE = 0.13;
const DEFAULT_CASH_THRESHOLD = 100;

type Props = {
  tenantId: string;
  subtotal: number;
  cashThreshold?: number;
  onComplete: (method: string, ref: string) => void;
};

type Method = "e_transfer" | "cheque" | "cash";

const METHODS: { id: Method; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "e_transfer", label: "e-Transfer", icon: <CreditCard size={20} />, desc: "Sent to seller's email address" },
  { id: "cheque", label: "Cheque", icon: <Building2 size={20} />, desc: "Write cheque number below" },
  { id: "cash", label: "Cash", icon: <Banknote size={20} />, desc: "Immediate cash payout" },
];

export function PayoutSelector({ tenantId: _tenantId, subtotal, cashThreshold = DEFAULT_CASH_THRESHOLD, onComplete }: Props) {
  const [method, setMethod] = useState<Method>("e_transfer");
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");

  const hst = subtotal * HST_RATE;
  const total = subtotal + hst;
  const cashBlocked = method === "cash" && subtotal >= cashThreshold;

  function handleContinue() {
    setError("");
    if (method === "e_transfer") {
      if (!ref.trim() || !ref.includes("@")) {
        setError("Enter a valid email address for e-Transfer.");
        return;
      }
    } else if (method === "cheque") {
      if (!ref.trim()) {
        setError("Enter the cheque number.");
        return;
      }
    } else if (cashBlocked) {
      setError(`Cash payouts ≥ $${cashThreshold.toFixed(2)} are not permitted. Select e-Transfer or cheque.`);
      return;
    }
    onComplete(method, ref.trim());
  }

  return (
    <div className="space-y-6">
      {/* Totals */}
      <div className="rounded-xl border border-night-700 bg-night-800 p-5 space-y-3">
        <p className="text-sm font-bold uppercase tracking-widest text-night-400">Payout Breakdown</p>
        <div className="flex justify-between text-sm">
          <span className="text-night-300">Subtotal (materials)</span>
          <span className="tabular-nums font-semibold text-night-100">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-night-300">HST 13% (Ontario ETA s.165(2))</span>
          <span className="tabular-nums text-night-300">${hst.toFixed(2)}</span>
        </div>
        <div className="border-t border-night-700 pt-3 flex justify-between">
          <span className="font-bold text-night-100">Total</span>
          <span className="payout-total tabular-nums text-night-100">${total.toFixed(2)} CAD</span>
        </div>
      </div>

      {/* Method selector */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-night-200">Payment Method</p>
        {METHODS.map((m) => {
          const isCashBlocked = m.id === "cash" && subtotal >= cashThreshold;
          return (
            <label
              key={m.id}
              className={[
                "flex items-start gap-4 rounded-xl border p-4 cursor-pointer transition-colors",
                method === m.id && !isCashBlocked
                  ? "border-brand-500 bg-brand-500/10"
                  : isCashBlocked
                  ? "border-night-700 bg-night-800/50 opacity-50 cursor-not-allowed"
                  : "border-night-700 bg-night-800 hover:border-night-600",
              ].join(" ")}
            >
              <input
                type="radio"
                name="payout-method"
                value={m.id}
                checked={method === m.id}
                disabled={isCashBlocked}
                onChange={() => { if (!isCashBlocked) { setMethod(m.id); setRef(""); setError(""); } }}
                className="mt-0.5 h-4 w-4 accent-brand-500"
              />
              <span className={["flex-shrink-0 mt-0.5", method === m.id ? "text-brand-400" : "text-night-400"].join(" ")}>
                {m.icon}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-night-100">{m.label}</p>
                <p className="text-xs text-night-400 mt-0.5">{m.desc}</p>
                {isCashBlocked && (
                  <p className="flex items-center gap-1 mt-1 text-xs text-warning-400">
                    <AlertTriangle size={11} />
                    Disabled — subtotal ≥ ${cashThreshold.toFixed(2)} threshold
                  </p>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {/* Reference field */}
      {method === "e_transfer" && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-night-200">
            Seller Email for e-Transfer
          </label>
          <input
            className="yard-input"
            type="email"
            placeholder="seller@example.com"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            aria-label="e-Transfer email address"
            autoComplete="email"
          />
        </div>
      )}

      {method === "cheque" && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-night-200">Cheque Number</label>
          <input
            className="yard-input"
            placeholder="e.g. 1042"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            aria-label="Cheque number"
          />
        </div>
      )}

      {method === "cash" && !cashBlocked && (
        <div className="flex items-start gap-3 rounded-xl border border-warning-500/20 bg-warning-500/5 p-4">
          <AlertTriangle size={16} className="flex-shrink-0 text-warning-400 mt-0.5" />
          <p className="text-xs text-warning-300">
            Cash payouts must be recorded in the cash log. Ensure a signed receipt is retained.
          </p>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger-400">{error}</p>}

      <button
        onClick={handleContinue}
        disabled={cashBlocked}
        className="yard-btn-primary w-full"
      >
        Continue to Signature →
      </button>
    </div>
  );
}
