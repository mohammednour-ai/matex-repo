"use client";

import { useState } from "react";
import { callTool } from "@/lib/api";
import { X, Globe, AlertTriangle } from "lucide-react";

type Lot = { lot_id: string; lot_number: string; total_weight_kg: number; material_name: string };

type Props = {
  lot: Lot;
  tenantId: string;
  actorId: string;
  onClose: () => void;
  onDone: () => void;
};

export function PublishToExchangeModal({ lot, tenantId, actorId, onClose, onDone }: Props) {
  const [askingPricePerKg, setAskingPricePerKg] = useState("");
  const [minQtyKg, setMinQtyKg] = useState("");
  const [pickupWindow, setPickupWindow] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  const priceNum = parseFloat(askingPricePerKg) || 0;
  const minQtyNum = parseFloat(minQtyKg) || 0;
  const totalAsk = priceNum * lot.total_weight_kg;

  async function publish() {
    if (!priceNum || priceNum <= 0) { setError("Enter asking price per kg."); return; }
    setError("");
    setPublishing(true);
    try {
      const res = await callTool("yardops.publish_lot_to_exchange", {
        tenant_id: tenantId,
        actor_id: actorId,
        lot_id: lot.lot_id,
        asking_price_per_kg: priceNum,
        min_quantity_kg: minQtyNum > 0 ? minQtyNum : undefined,
        pickup_window: pickupWindow.trim() || undefined,
      });
      if (!res.success) {
        setError(res.error?.message ?? "Failed to publish. Ensure yard is connected to Matex Exchange.");
        return;
      }
      onDone();
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal aria-label="Publish to exchange">
      <div className="w-full max-w-md rounded-2xl border border-night-700 bg-night-900 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-night-100 flex items-center gap-2">
            <Globe size={18} className="text-brand-400" />
            Publish to Matex Exchange
          </h2>
          <button onClick={onClose} className="text-night-500 hover:text-night-200" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="rounded-xl border border-night-700 bg-night-800 px-4 py-3 text-sm">
          <p className="text-night-400">{lot.lot_number} · {lot.material_name}</p>
          <p className="font-bold tabular-nums text-night-100 mt-0.5">{lot.total_weight_kg.toFixed(2)} kg</p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-night-200">Asking Price ($/kg CAD)</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-night-500">$</span>
            <input
              className="yard-input pl-6 tabular-nums"
              type="number"
              step="0.001"
              min="0.001"
              placeholder="0.000"
              value={askingPricePerKg}
              onChange={(e) => setAskingPricePerKg(e.target.value)}
              autoFocus
            />
          </div>
          {priceNum > 0 && (
            <p className="mt-1.5 text-xs text-night-400 tabular-nums">
              Total asking: ${totalAsk.toFixed(2)} CAD
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-night-200">
            Minimum Quantity (kg) <span className="text-night-500">optional</span>
          </label>
          <div className="relative">
            <input
              className="yard-input pr-10 tabular-nums"
              type="number"
              step="1"
              min="1"
              placeholder="No minimum"
              value={minQtyKg}
              onChange={(e) => setMinQtyKg(e.target.value)}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-night-500">kg</span>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-night-200">
            Pickup Window <span className="text-night-500">optional</span>
          </label>
          <input
            className="yard-input"
            placeholder="e.g. Mon–Fri 8am–5pm, 2 weeks"
            value={pickupWindow}
            onChange={(e) => setPickupWindow(e.target.value)}
          />
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-night-700 bg-night-800/50 p-3">
          <AlertTriangle size={13} className="text-warning-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-night-400">
            Publishing creates a live listing on Matex Exchange. Buyers can see and bid on this lot immediately.
          </p>
        </div>

        {error && <p role="alert" className="text-sm text-danger-400">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="yard-btn-secondary flex-1">Cancel</button>
          <button onClick={publish} disabled={!priceNum || publishing} className="yard-btn-primary flex-1">
            {publishing ? "Publishing…" : "Publish →"}
          </button>
        </div>
      </div>
    </div>
  );
}
