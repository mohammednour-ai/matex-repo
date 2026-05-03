"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Trash2 } from "lucide-react";
import clsx from "clsx";
import type { PriceAlertRow } from "@/lib/intelligence/types";
import { deleteAlert, fetchAlerts, setAlertStatus } from "@/lib/intelligence/client";
import { formatPrice, formatRelativeAgo } from "@/lib/intelligence/format";
import { getMaterial } from "@/lib/intelligence/materials";

const TYPE_LABEL: Record<string, string> = {
  price_below: "Price drops below",
  price_above: "Price rises above",
  trend_reversal: "Trend reversal",
  demand_change: "Demand change",
};

export function PriceAlertsList({ refreshKey }: { refreshKey?: number }) {
  const [alerts, setAlerts] = useState<PriceAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAlerts()
      .then((rows) => {
        if (!cancelled) setAlerts(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load alerts");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey, tick]);

  async function toggle(alert: PriceAlertRow) {
    const next = alert.status === "active" ? "paused" : "active";
    try {
      await setAlertStatus(alert.alert_id, next);
      setTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update alert");
    }
  }

  async function remove(alert: PriceAlertRow) {
    try {
      await deleteAlert(alert.alert_id);
      setTick((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete alert");
    }
  }

  if (loading) {
    return <div className="animate-pulse rounded-xl bg-steel-100 h-32" />;
  }
  if (error) {
    return <p className="text-xs text-danger-600">{error}</p>;
  }
  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-steel-200 bg-surface-50 p-6 text-center">
        <Bell className="mx-auto h-6 w-6 text-steel-400" />
        <p className="mt-2 text-sm font-semibold text-steel-700">No price alerts yet</p>
        <p className="mt-1 text-xs text-steel-500">
          Create one to get notified when material prices cross your threshold.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-steel-100 rounded-2xl border border-steel-100 bg-white">
      {alerts.map((alert) => {
        const material = getMaterial(alert.material_key);
        const unit = material?.unit ?? "mt";
        const muted = alert.status !== "active";
        return (
          <li
            key={alert.alert_id}
            className={clsx("flex items-center justify-between gap-3 px-4 py-3", muted && "opacity-70")}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-steel-900">
                {alert.material_label ?? material?.label ?? alert.material_key}
              </p>
              <p className="text-xs text-steel-500">
                {TYPE_LABEL[alert.alert_type] ?? alert.alert_type}
                {alert.threshold !== null
                  ? ` · ${formatPrice(alert.threshold, unit)}`
                  : ""}
                {alert.region ? ` · ${alert.region}` : ""}
                {alert.last_triggered_at
                  ? ` · last fired ${formatRelativeAgo(alert.last_triggered_at)}`
                  : ` · created ${formatRelativeAgo(alert.created_at)}`}
              </p>
              {alert.note && <p className="mt-0.5 truncate text-[11px] text-steel-400">{alert.note}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => toggle(alert)}
                title={alert.status === "active" ? "Pause alert" : "Resume alert"}
                className="rounded-full border border-steel-200 p-1.5 text-steel-600 transition-colors hover:border-brand-400 hover:text-brand-700"
              >
                {alert.status === "active" ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => remove(alert)}
                title="Delete alert"
                className="rounded-full border border-steel-200 p-1.5 text-steel-600 transition-colors hover:border-danger-400 hover:text-danger-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
