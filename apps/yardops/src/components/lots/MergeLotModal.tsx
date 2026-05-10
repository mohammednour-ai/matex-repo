"use client";

import { useState, useEffect } from "react";
import { callTool } from "@/lib/api";
import { X, Merge } from "lucide-react";

type Lot = { lot_id: string; lot_number: string; total_weight_kg: number; material_name: string };

type Props = {
  sourceLotId: string;
  tenantId: string;
  actorId: string;
  onClose: () => void;
  onDone: () => void;
};

export function MergeLotModal({ sourceLotId, tenantId, actorId, onClose, onDone }: Props) {
  const [lots, setLots] = useState<Lot[]>([]);
  const [targetId, setTargetId] = useState("");
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    callTool<{ lots: Lot[] }>("yardops.list_lots", {
      tenant_id: tenantId,
      status: "open",
    }).then((res) => {
      if (res.success && res.data) {
        setLots((res.data.lots ?? []).filter((l: Lot) => l.lot_id !== sourceLotId));
      }
    });
  }, [tenantId, sourceLotId]);

  async function doMerge() {
    if (!targetId) { setError("Select a target lot."); return; }
    setError("");
    setMerging(true);
    try {
      const res = await callTool("yardops.merge_lots", {
        tenant_id: tenantId,
        actor_id: actorId,
        source_lot_ids: [sourceLotId],
        target_lot_id: targetId,
      });
      if (!res.success) {
        setError(res.error?.message ?? "Merge failed");
        return;
      }
      onDone();
    } finally {
      setMerging(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal aria-label="Merge lot">
      <div className="w-full max-w-md rounded-2xl border border-night-700 bg-night-900 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-night-100 flex items-center gap-2">
            <Merge size={18} className="text-brand-400" />
            Merge Into Another Lot
          </h2>
          <button onClick={onClose} className="text-night-500 hover:text-night-200" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-night-200">Target Lot</label>
          {lots.length === 0 ? (
            <p className="text-sm text-night-500 py-2">No other open lots available.</p>
          ) : (
            <select
              className="yard-input"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              aria-label="Target lot"
            >
              <option value="">Select a lot…</option>
              {lots.map((l) => (
                <option key={l.lot_id} value={l.lot_id}>
                  {l.lot_number} — {l.material_name} ({l.total_weight_kg.toFixed(2)} kg)
                </option>
              ))}
            </select>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-danger-400">{error}</p>}

        <p className="text-xs text-night-500">
          The current lot will be archived and its weight added to the target lot. This action cannot be undone.
        </p>

        <div className="flex gap-3">
          <button onClick={onClose} className="yard-btn-secondary flex-1">Cancel</button>
          <button onClick={doMerge} disabled={!targetId || merging || lots.length === 0} className="yard-btn-primary flex-1">
            {merging ? "Merging…" : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
