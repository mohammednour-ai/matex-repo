/**
 * Tiny inline SVG sparkline for the dashboard cards. Avoids pulling in a chart
 * lib for what is effectively a 1KB visualisation.
 *
 * `series` is an array of numeric prices (oldest → newest). Empty / single-
 * point series render as a flat line so the card still has a stable footprint.
 */

import clsx from "clsx";
import type { MarketTrend } from "@/lib/intelligence/types";

const STROKE: Record<MarketTrend, string> = {
  up: "stroke-success-500",
  down: "stroke-danger-500",
  stable: "stroke-steel-400",
};

const FILL: Record<MarketTrend, string> = {
  up: "fill-success-500/15",
  down: "fill-danger-500/15",
  stable: "fill-steel-300/30",
};

export function PriceSparkline({
  series,
  trend = "stable",
  className,
  height = 48,
}: {
  series: number[];
  trend?: MarketTrend;
  className?: string;
  height?: number;
}) {
  const pts = series.filter((n) => Number.isFinite(n));
  if (pts.length < 2) {
    return (
      <svg viewBox="0 0 100 30" className={clsx("h-12 w-full", className)} preserveAspectRatio="none">
        <line x1="0" y1="15" x2="100" y2="15" className="stroke-steel-200" strokeWidth="1.5" />
      </svg>
    );
  }
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const step = 100 / (pts.length - 1);
  const path = pts
    .map((p, i) => {
      const x = i * step;
      const y = 30 - ((p - min) / span) * 28 - 1;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `${path} L 100 30 L 0 30 Z`;
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={clsx("w-full", className)}
      style={{ height }}
      aria-hidden
    >
      <path d={area} className={FILL[trend]} />
      <path d={path} className={clsx("fill-none", STROKE[trend])} strokeWidth="1.6" />
    </svg>
  );
}
