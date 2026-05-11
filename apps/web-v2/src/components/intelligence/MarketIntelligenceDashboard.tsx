"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Bell, RefreshCw, TrendingUp } from "lucide-react";
import type { MarketIntelligenceRow } from "@/lib/intelligence/types";
import { fetchAllSnapshots } from "@/lib/intelligence/client";
import { MarketSummaryCard } from "./MarketSummaryCard";
import { PriceAlertsList } from "./PriceAlertsList";
import { PriceAlertDialog } from "./PriceAlertDialog";

export function MarketIntelligenceDashboard() {
  const [snapshots, setSnapshots] = useState<MarketIntelligenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dialogMaterial, setDialogMaterial] = useState<string | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAllSnapshots()
      .then((rows) => {
        if (!cancelled) setSnapshots(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load market data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  function openDialog(materialKey?: string) {
    setDialogMaterial(materialKey);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <Image
            src="/grphs/Icons/market-intelligence-i-market.png"
            alt=""
            aria-hidden
            width={48}
            height={48}
            className="h-12 w-12 flex-shrink-0 object-contain"
          />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-400">
              Matex Intelligence
            </p>
            <h2 className="mt-1 text-2xl font-bold text-fg">Market dashboard</h2>
            <p className="mt-1 text-sm text-fg-subtle">
              Daily AI snapshot for every tracked material — LME spot, regional assessments, our own auction
              aggregates and what we recommend doing next.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRefreshKey((n) => n + 1)}
            className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-fg-muted hover:border-brand-400 hover:text-brand-700"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => openDialog()}
            className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
          >
            <Bell className="h-3.5 w-3.5" /> New alert
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-danger-500/15 px-4 py-3 text-sm text-danger-400 ring-1 ring-inset ring-danger-500/20">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-line bg-surfaceBg h-72" />
          ))}
        </div>
      ) : snapshots.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surfaceBg/90 p-10 text-center">
          <div
            aria-hidden
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/10 text-brand-400"
          >
            <TrendingUp size={32} />
          </div>
          <p className="text-sm font-semibold text-fg-muted">No market snapshots yet</p>
          <p className="mt-1 text-xs text-fg-subtle">
            The daily Inngest job will populate this view. Trigger it manually with the run-daily debug
            endpoint while developing.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {snapshots.map((snap) => (
            <MarketSummaryCard key={snap.intelligence_id} snapshot={snap} onSetAlert={openDialog} />
          ))}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-fg">Your alerts</h3>
          <button
            type="button"
            onClick={() => openDialog()}
            className="text-xs font-semibold text-brand-400 hover:text-brand-300"
          >
            + Add alert
          </button>
        </div>
        <PriceAlertsList refreshKey={refreshKey} />
      </section>

      <PriceAlertDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        defaultMaterialKey={dialogMaterial}
        onCreated={() => setRefreshKey((n) => n + 1)}
      />
    </div>
  );
}
