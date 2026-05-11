"use client";

import { useState } from "react";
import { callTool } from "@/lib/api";
import { X, Scissors } from "lucide-react";

type Lot = { lot_id: string; lot_number: string; total_weight_kg: number };

type Props = {
  lot: Lot;
  tenantId: string;
  actorId: string;
  onClose: () => void;
  onDone: () => void;
};

export function SplitLotModal({ lot, tenantId, actorId, onClose, onDone }: Props) {
  const [weight, setWeight] = useState("");
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState("");

  const splitWeight = parseFloat(weight) || 0;
  const remainWeight = lot.total_weight_kg - splitWeight;
  const valid = splitWeight > 0 && splitWeight < lot.total_weight_kg;

  async function doSplit() {
    setError("");
    if (!valid) { setError("Split weight must be between 0 and original weight."); return; }
    setSplitting(true);
    try {
      const res = await callTool("yardops.split_lot", {
        tenant_id: tenantId,
        actor_id: actorId,
        lot_id: lot.lot_id,
        split_weight_kg: splitWeight,
      });
      if (!res.success) {
        setError(res.error?.message ?? "Failed to split lot");
        return;
      }
      onDone();
    } finally {
      setSplitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal aria-label="Split lot">
      <div className="w-full max-w-md rounded-2xl border border-night-700 bg-night-900 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-night-100 flex items-center gap-2">
            <Scissors size={18} className="text-brand-400" />
            Split {lot.lot_number}
          </h2>
          <button onClick={onClose} className="text-night-500 hover:text-night-200" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="rounded-xl border border-night-700 bg-night-800 px-4 py-3 text-sm">
          <p className="text-night-400">Original weight</p>
          <p className="text-xl font-black tabular-nums text-night-100 mt-0.5">{lot.total_weight_kg.toFixed(2)} kg</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-night-200">Split-off weight (kg)</label>
          <div className="relative">
            <input
              className="yard-input pr-10 tabular-nums"
              type="number"
              step="0.01"
              min="0.01"
              max={lot.total_weight_kg - 0.01}
              placeholder="0.00"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              autoFocus
              aria-label="Split weight"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-night-500">kg</span>
          </div>
        </div>

        {splitWeight > 0 && splitWeight < lot.total_weight_kg && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-night-700 bg-night-800 p-3 text-center">
              <p className="text-night-500 text-xs mb-1">New child lot</p>
              <p className="font-bold tabular-nums text-night-100">{splitWeight.toFixed(2)} kg</p>
            </div>
            <div className="rounded-xl border border-night-700 bg-night-800 p-3 text-center">
              <p className="text-night-500 text-xs mb-1">Remaining</p>
              <p className="font-bold tabular-nums text-night-100">{remainWeight.toFixed(2)} kg</p>
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-danger-400">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="yard-btn-secondary flex-1">Cancel</button>
          <button onClick={doSplit} disabled={!valid || splitting} className="yard-btn-primary flex-1">
            {splitting ? "Splitting…" : "Split Lot"}
          </button>
        </div>
      </div>
    </div>
  );
}
