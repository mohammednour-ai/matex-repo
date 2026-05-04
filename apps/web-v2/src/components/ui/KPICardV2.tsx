"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { SparkAreaChart } from "@tremor/react";
import { KPICard, type KPITone } from "@/components/ui/KPICard";

/**
 * KPI card with a sparkline + delta vs previous period.
 *
 * Use this for metrics where a 14-day micro-trend is meaningful to the user
 * (active listings count, GMV, escrow held, bid volume). For non-trend
 * metrics (wallet balance, KYC level), keep using the base `KPICard`.
 *
 * The series is small (~14 points). Pass numbers in chronological order.
 */
export type KPICardV2Props = {
  label: string;
  value: string | number | ReactNode;
  subValue?: string | null;
  icon?: ReactNode;
  tone?: KPITone;
  loading?: boolean;
  className?: string;
  /** Extra classes on the sparkline sub-card (border, background). */
  chartClassName?: string;
  /** ~14 points, chronological. */
  series: number[];
  /** Override the sparkline label; default "Last 14 days". */
  trendLabel?: string;
  /** Decimal change vs previous period, e.g. 0.12 for +12%. Pass null to hide. */
  deltaPct?: number | null;
};

function formatDelta(deltaPct: number | null | undefined): string | null {
  if (deltaPct === null || deltaPct === undefined || !Number.isFinite(deltaPct)) return null;
  const pct = Math.round(deltaPct * 1000) / 10;
  if (pct === 0) return "0% vs prev";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}% vs prev`;
}

export function KPICardV2({
  label,
  value,
  subValue,
  icon,
  tone = "neutral",
  loading,
  className,
  chartClassName,
  series,
  trendLabel = "Last 14 days",
  deltaPct,
}: KPICardV2Props) {
  const trendString = formatDelta(deltaPct);
  const data = series.map((v, i) => ({ i, v }));

  return (
    <div className={clsx("space-y-2", className)}>
      <KPICard
        label={label}
        value={value}
        subValue={subValue}
        trend={trendString}
        icon={icon}
        tone={tone}
        loading={loading}
      />
      {series.length > 1 && !loading && (
        <div
          className={clsx(
            "rounded-xl border border-sky-200/65 bg-white/[0.92] px-3 py-2 shadow-sm",
            chartClassName
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600">
            {trendLabel}
          </p>
          <SparkAreaChart
            data={data}
            categories={["v"]}
            index="i"
            className="mt-1 h-10 w-full"
            colors={[tone === "danger" ? "red" : tone === "warning" ? "amber" : "orange"]}
          />
        </div>
      )}
    </div>
  );
}
