"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Sparkles } from "lucide-react";
import clsx from "clsx";
import type { MarketIntelligenceRow } from "@/lib/intelligence/types";
import { fetchAllSnapshots } from "@/lib/intelligence/client";
import { TrendBadge } from "./TrendBadge";
import { DemandGauge } from "./DemandGauge";
import { PriceSparkline } from "./PriceSparkline";
import {
  RECOMMENDATION_LABEL,
  RECOMMENDATION_TONE,
  formatPct,
  formatPrice,
} from "@/lib/intelligence/format";
import { getMaterial } from "@/lib/intelligence/materials";

const MAX_TILES = 3;
const COLLAPSE_KEY = "matex.dashboard.intelligence.collapsed";

/**
 * Compact, three-tile market intelligence strip for the main dashboard.
 * Foldable — collapsed state persists across reloads via localStorage.
 */
export function DashboardMarketSummary() {
  const [snapshots, setSnapshots] = useState<MarketIntelligenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  // Restore collapsed state on mount.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COLLAPSE_KEY);
      if (saved === "1") setCollapsed(true);
    } catch {
      // ignore — privacy mode etc.
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    fetchAllSnapshots()
      .then((rows) => {
        if (cancelled) return;
        const ranked = [...rows].sort((a, b) => Math.abs(b.lme_change_pct ?? 0) - Math.abs(a.lme_change_pct ?? 0));
        setSnapshots(ranked.slice(0, MAX_TILES));
      })
      .catch(() => {
        if (!cancelled) setSnapshots([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <section className="rounded-3xl border border-night-700 bg-night-850/85 p-4">
        <div className="flex items-center justify-between">
          <SectionHeading />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-night-800/70" />
          ))}
        </div>
      </section>
    );
  }
  if (snapshots.length === 0) return null;

  return (
    <section className="rounded-3xl border border-night-700 bg-night-850/85 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading />
        <div className="flex items-center gap-2">
          <Link
            href="/market"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-400 hover:text-brand-300"
          >
            Open Matex Intelligence <ArrowRight className="h-3 w-3" />
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="dashboard-intelligence-grid"
            aria-label={collapsed ? "Expand Matex Intelligence" : "Collapse Matex Intelligence"}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-night-700 bg-night-800/60 text-night-200 transition-colors hover:border-brand-500/40 hover:bg-night-800 hover:text-night-100"
          >
            <ChevronDown
              size={16}
              className={clsx(
                "transition-transform duration-200",
                collapsed && "-rotate-90",
              )}
              aria-hidden
            />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div
          id="dashboard-intelligence-grid"
          className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3"
        >
          {snapshots.map((snap) => (
            <MiniSummary key={snap.intelligence_id} snapshot={snap} />
          ))}
        </div>
      )}
    </section>
  );
}

function SectionHeading() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-xl border border-brand-500/30 bg-night-800/70 text-brand-400 shadow-sm">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-400">
          Matex Intelligence
        </p>
        <p className="text-sm font-semibold text-night-100">Today&apos;s market signal</p>
      </div>
    </div>
  );
}

function MiniSummary({ snapshot }: { snapshot: MarketIntelligenceRow }) {
  const material = getMaterial(snapshot.material_key);
  const unit = material?.unit ?? "mt";
  return (
    <Link
      href={`/market/${snapshot.material_key}`}
      className="group rounded-2xl border border-night-700 bg-night-850/90 p-4 transition-colors hover:border-brand-300 hover:bg-night-850"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-night-300">
            {snapshot.material_label}
          </p>
          <p className="mt-1 text-base font-bold text-night-100">
            {formatPrice(snapshot.lme_price, unit)}
          </p>
          <p className="text-[11px] text-night-300">
            LME {formatPct(snapshot.lme_change_pct)} · {snapshot.matex_auction_count} auctions / 30d
          </p>
        </div>
        <TrendBadge trend={snapshot.trend} changePct={snapshot.lme_change_pct} />
      </div>
      <PriceSparkline
        series={
          snapshot.matex_avg_price && snapshot.lme_price
            ? [snapshot.matex_avg_price, snapshot.lme_price]
            : [snapshot.lme_price ?? 0]
        }
        trend={snapshot.trend}
        height={28}
        className="mt-2"
      />
      <div className={"mt-3 flex items-center justify-between rounded-xl px-2.5 py-1.5 ring-1 ring-inset " + RECOMMENDATION_TONE[snapshot.recommendation]}>
        <span className="text-[11px] font-semibold">{RECOMMENDATION_LABEL[snapshot.recommendation]}</span>
        <DemandGauge demand={snapshot.demand} />
      </div>
    </Link>
  );
}
