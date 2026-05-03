"use client";

import Link from "next/link";
import { Bell, ExternalLink } from "lucide-react";
import clsx from "clsx";
import type { MarketIntelligenceRow } from "@/lib/intelligence/types";
import { TrendBadge } from "./TrendBadge";
import { DemandGauge } from "./DemandGauge";
import { PriceSparkline } from "./PriceSparkline";
import {
  RECOMMENDATION_LABEL,
  RECOMMENDATION_TONE,
  formatPct,
  formatPrice,
  formatRelativeAgo,
} from "@/lib/intelligence/format";
import { getMaterial } from "@/lib/intelligence/materials";

export type MarketSummaryCardProps = {
  snapshot: MarketIntelligenceRow;
  history?: MarketIntelligenceRow[];
  onSetAlert?: (materialKey: string) => void;
  compact?: boolean;
};

export function MarketSummaryCard({ snapshot, history, onSetAlert, compact = false }: MarketSummaryCardProps) {
  const material = getMaterial(snapshot.material_key);
  const unit = material?.unit ?? "mt";
  const series = (history ?? []).map((h) => h.lme_price ?? h.matex_avg_price ?? 0).filter((n) => n > 0);
  return (
    <div className="rounded-2xl border border-steel-100 bg-white p-5 shadow-sm transition-colors hover:border-brand-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-steel-500">
            {material?.category === "ferrous"
              ? "Ferrous"
              : material?.category === "specialty"
                ? "Specialty"
                : "Non-ferrous"}
          </p>
          <h3 className="mt-1 text-base font-semibold text-steel-900">{snapshot.material_label}</h3>
          <p className="text-xs text-steel-500">Updated {formatRelativeAgo(snapshot.updated_at)}</p>
        </div>
        <TrendBadge trend={snapshot.trend} changePct={snapshot.lme_change_pct} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric
          label="LME spot"
          value={formatPrice(snapshot.lme_price, unit)}
        />
        <Metric
          label="Matex 30-day avg"
          value={formatPrice(snapshot.matex_avg_price, unit)}
        />
        <Metric
          label="Forecast band"
          value={
            snapshot.price_low != null && snapshot.price_high != null
              ? `${formatPrice(snapshot.price_low, unit)} – ${formatPrice(snapshot.price_high, unit)}`
              : "—"
          }
        />
        <Metric
          label="Auctions / 30d"
          value={String(snapshot.matex_auction_count ?? 0)}
          sub={
            snapshot.lme_change_pct != null
              ? `LME ${formatPct(snapshot.lme_change_pct)}`
              : undefined
          }
        />
      </div>

      <div className="mt-4">
        <PriceSparkline series={series} trend={snapshot.trend} height={42} />
      </div>

      <div className={clsx("mt-4 rounded-xl px-3 py-2 ring-1 ring-inset", RECOMMENDATION_TONE[snapshot.recommendation])}>
        <p className="text-[10px] font-bold uppercase tracking-wider">
          {RECOMMENDATION_LABEL[snapshot.recommendation]} · Demand
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold leading-tight">{snapshot.summary ?? "AI summary pending"}</p>
          <DemandGauge demand={snapshot.demand} />
        </div>
        {!compact && snapshot.reasoning && (
          <p className="mt-2 text-xs text-current/80">{snapshot.reasoning}</p>
        )}
      </div>

      {!compact && snapshot.next_event && (
        <div className="mt-3 rounded-xl border-l-4 border-warning-300 bg-warning-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-warning-800">Watch</p>
          <p className="mt-0.5 text-sm text-warning-900">{snapshot.next_event}</p>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <Link
          href={`/market/${snapshot.material_key}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900"
        >
          Open detail <ExternalLink className="h-3 w-3" />
        </Link>
        {onSetAlert && (
          <button
            type="button"
            onClick={() => onSetAlert(snapshot.material_key)}
            className="inline-flex items-center gap-1 rounded-full border border-steel-200 px-3 py-1 text-xs font-semibold text-steel-700 transition-colors hover:border-brand-400 hover:text-brand-700"
          >
            <Bell className="h-3 w-3" /> Set alert
          </button>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-steel-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-steel-900">{value}</p>
      {sub && <p className="text-[10px] text-steel-500">{sub}</p>}
    </div>
  );
}
