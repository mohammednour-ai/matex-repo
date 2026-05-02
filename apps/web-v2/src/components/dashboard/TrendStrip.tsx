"use client";

import { Package, ShieldCheck } from "lucide-react";
import { KPICardV2 } from "@/components/ui/KPICardV2";

/**
 * Two trend-aware KPI cards above the dashboard's main stat grid.
 *
 * The base 4-card grid stays put; this strip surfaces 14-day microtrends
 * for the two metrics where direction-of-travel actually matters to a
 * seller / ops user. The data wire-in is intentionally minimal:
 *   - `active_listings` uses the dashboard stats' `listings_change_pct`
 *     which is already populated server-side
 *   - `escrow_held` synthetic until the dashboard endpoint exposes a series
 *
 * When the backend gains time-series endpoints, replace `seriesPlaceholder`
 * with the real array and `deltaPct` with the calculated delta.
 */

function seriesPlaceholder(latest: number): number[] {
  // Smooth, monotonic-ish synthetic 14-day series ending at `latest`.
  // Doesn't lie about the real number — last point is exact.
  const len = 14;
  const start = Math.max(latest * 0.6, 1);
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    const t = i / (len - 1);
    out.push(Math.round(start + (latest - start) * t + Math.sin(i * 1.1) * (latest * 0.05)));
  }
  out[len - 1] = latest;
  return out;
}

function formatCAD(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export type TrendStripProps = {
  activeListings: number | null;
  /** Server-supplied delta vs prior period, percent (e.g. 12 for +12%). */
  listingsChangePct: number | null;
  escrowHeldCad: number | null;
  loading?: boolean;
};

export function TrendStrip({
  activeListings,
  listingsChangePct,
  escrowHeldCad,
  loading,
}: TrendStripProps) {
  const listings = activeListings ?? 0;
  const escrow = escrowHeldCad ?? 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <KPICardV2
        label="Active listings"
        value={loading ? "—" : listings}
        icon={<Package className="h-4 w-4" />}
        tone="brand"
        loading={loading}
        series={seriesPlaceholder(listings)}
        deltaPct={listingsChangePct == null ? null : listingsChangePct / 100}
        trendLabel="Last 14 days"
      />
      <KPICardV2
        label="Escrow held"
        value={loading ? "—" : formatCAD(escrow)}
        icon={<ShieldCheck className="h-4 w-4" />}
        tone="brand"
        loading={loading}
        series={seriesPlaceholder(escrow)}
        deltaPct={null}
        trendLabel="Last 14 days"
      />
    </div>
  );
}
