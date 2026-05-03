"use client";

import { useEffect, useState } from "react";
import { Activity, Eye, Gavel, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import clsx from "clsx";
import type { ListingMetricsRow } from "@/lib/intelligence/types";
import { fetchListingMetrics, recomputeListingMetrics } from "@/lib/intelligence/client";
import { formatPct, formatPrice, formatRelativeAgo } from "@/lib/intelligence/format";
import { getMaterial } from "@/lib/intelligence/materials";

type Props = {
  listingId: string;
  materialKey?: string;
  materialLabel?: string;
  askingPrice?: number | null;
};

export function ListingPerformanceCard({ listingId, materialKey, materialLabel, askingPrice }: Props) {
  const [metrics, setMetrics] = useState<ListingMetricsRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // Force a recompute so metrics are accurate for the current asking price.
        const fresh = await recomputeListingMetrics(listingId, {
          material_key: materialKey,
          material: materialLabel,
          asking_price: askingPrice ?? null,
        });
        if (!cancelled) setMetrics(fresh);
      } catch {
        try {
          const fallback = await fetchListingMetrics(listingId);
          if (!cancelled) setMetrics(fallback);
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : "Could not load metrics");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [listingId, materialKey, materialLabel, askingPrice]);

  if (loading) {
    return <div className="animate-pulse rounded-2xl border border-steel-100 bg-white p-5 h-48" />;
  }
  if (error || !metrics) {
    return (
      <div className="rounded-2xl border border-steel-100 bg-white p-5 text-sm text-steel-500">
        Listing intelligence unavailable.
      </div>
    );
  }

  const material = getMaterial(metrics.material_key ?? materialKey ?? "");
  const unit = material?.unit ?? "mt";
  const viewsTrendIcon = (metrics.views_change_pct ?? 0) >= 0 ? TrendingUp : TrendingDown;
  const ViewsIcon = viewsTrendIcon;
  return (
    <div className="rounded-2xl border border-steel-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-700">
            Listing performance
          </p>
          <h3 className="mt-1 text-base font-semibold text-steel-900">
            {material?.label ?? materialLabel ?? "This listing"}
          </h3>
          <p className="text-xs text-steel-500">Refreshed {formatRelativeAgo(metrics.updated_at)}</p>
        </div>
        <span
          className={clsx(
            "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
            (metrics.benchmark_delta_pct ?? 0) > 4
              ? "bg-warning-50 text-warning-800 ring-warning-500/30"
              : (metrics.benchmark_delta_pct ?? 0) < -4
                ? "bg-info-50 text-brand-800 ring-brand-500/30"
                : "bg-success-50 text-success-800 ring-success-500/30",
          )}
        >
          {metrics.ai_status_label ?? "Tracking"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Eye} label="Views (total)" value={metrics.views_total.toLocaleString()} />
        <Stat
          icon={ViewsIcon}
          label="Views 24h"
          value={metrics.views_24h.toLocaleString()}
          sub={metrics.views_change_pct != null ? formatPct(metrics.views_change_pct) : undefined}
        />
        <Stat icon={Activity} label="Watchers" value={metrics.watchers.toLocaleString()} />
        <Stat icon={Gavel} label="Bids" value={metrics.bid_count.toLocaleString()} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PriceCell label="Your asking" value={formatPrice(metrics.asking_price, unit)} />
        <PriceCell
          label="Benchmark avg"
          value={formatPrice(metrics.benchmark_avg, unit)}
          sub={metrics.benchmark_delta_pct != null ? `${formatPct(metrics.benchmark_delta_pct)} vs avg` : undefined}
        />
        <PriceCell
          label="Predicted final"
          value={formatPrice(metrics.forecast_final, unit)}
          sub={metrics.forecast_confidence != null ? `${Math.round(metrics.forecast_confidence * 100)}% confidence` : undefined}
        />
      </div>

      {metrics.ai_tip && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2 ring-1 ring-inset ring-brand-500/20">
          <Sparkles className="h-4 w-4 shrink-0 text-brand-700" />
          <p className="text-xs text-brand-900">{metrics.ai_tip}</p>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-steel-100 bg-surface-50 p-3">
      <div className="flex items-center gap-2 text-steel-500">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-1 text-base font-semibold text-steel-900">{value}</p>
      {sub && <p className="text-[10px] text-steel-500">{sub}</p>}
    </div>
  );
}

function PriceCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-steel-100 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-steel-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-steel-900">{value}</p>
      {sub && <p className="text-[10px] text-steel-500">{sub}</p>}
    </div>
  );
}
