"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import { Input } from "@/components/ui/shadcn/input";
import { MATERIALS, getMaterial } from "@/lib/intelligence/materials";
import type { PriceAlertType } from "@/lib/intelligence/types";
import { createAlert } from "@/lib/intelligence/client";

const ALERT_TYPES: Array<{ value: PriceAlertType; label: string; needsThreshold: boolean }> = [
  { value: "price_below", label: "Price drops below threshold", needsThreshold: true },
  { value: "price_above", label: "Price rises above threshold", needsThreshold: true },
  { value: "trend_reversal", label: "Trend reverses direction", needsThreshold: false },
  { value: "demand_change", label: "Demand level changes", needsThreshold: false },
];

const CHANNELS = [
  { value: "in_app", label: "In-app" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

export function PriceAlertDialog({
  open,
  onClose,
  defaultMaterialKey,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultMaterialKey?: string;
  onCreated?: () => void;
}) {
  const [materialKey, setMaterialKey] = useState(defaultMaterialKey ?? MATERIALS[0]!.key);
  const [alertType, setAlertType] = useState<PriceAlertType>("price_below");
  const [threshold, setThreshold] = useState("");
  const [region, setRegion] = useState("");
  const [channels, setChannels] = useState<string[]>(["in_app"]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultMaterialKey) setMaterialKey(defaultMaterialKey);
  }, [defaultMaterialKey]);

  const meta = ALERT_TYPES.find((t) => t.value === alertType)!;
  const material = getMaterial(materialKey);

  function toggleChannel(value: string) {
    setChannels((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await createAlert({
        material_key: materialKey,
        alert_type: alertType,
        threshold: meta.needsThreshold ? threshold : null,
        region: region.trim() || null,
        channels: channels.length > 0 ? channels : ["in_app"],
        note: note.trim() || null,
      });
      onCreated?.();
      onClose();
      setThreshold("");
      setRegion("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create alert");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-brand-600" />
            New price alert
          </DialogTitle>
          <DialogDescription>
            We&apos;ll notify you the moment the daily intelligence pipeline observes the condition.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-steel-600">
              Material
            </label>
            <select
              value={materialKey}
              onChange={(e) => setMaterialKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-steel-200 bg-white px-3 py-2 text-sm text-steel-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              {MATERIALS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-steel-600">
              Alert type
            </label>
            <select
              value={alertType}
              onChange={(e) => setAlertType(e.target.value as PriceAlertType)}
              className="mt-1 w-full rounded-lg border border-steel-200 bg-white px-3 py-2 text-sm text-steel-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              {ALERT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {meta.needsThreshold && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-steel-600">
                Threshold ({material?.unit === "lb" ? "CAD/lb" : "CAD/mt"})
              </label>
              <Input
                type="number"
                inputMode="decimal"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder={material?.unit === "lb" ? "1.05" : "4700"}
                className="mt-1"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-steel-600">
              Region filter <span className="text-steel-400">(optional)</span>
            </label>
            <Input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Ontario, Quebec..."
              className="mt-1"
            />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-steel-600">Channels</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {CHANNELS.map((c) => {
                const active = channels.includes(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => toggleChannel(c.value)}
                    className={
                      active
                        ? "rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white"
                        : "rounded-full border border-steel-200 px-3 py-1 text-xs font-semibold text-steel-700 hover:border-brand-400"
                    }
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-steel-600">
              Note <span className="text-steel-400">(optional)</span>
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Buy window for Q3 program"
              className="mt-1"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating…" : "Create alert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
