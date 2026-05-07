import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import clsx from "clsx";
import type { MarketTrend } from "@/lib/intelligence/types";

const VARIANTS: Record<MarketTrend, { tone: string; icon: typeof ArrowUpRight; label: string }> = {
  up: {
    tone: "bg-success-500/15 text-success-400 ring-success-500/20",
    icon: ArrowUpRight,
    label: "Trending up",
  },
  down: {
    tone: "bg-danger-500/15 text-danger-400 ring-danger-500/20",
    icon: ArrowDownRight,
    label: "Trending down",
  },
  stable: {
    tone: "bg-steel-100 text-night-200 ring-steel-300/40",
    icon: Minus,
    label: "Stable",
  },
};

export function TrendBadge({ trend, changePct, className }: { trend: MarketTrend; changePct?: number | null; className?: string }) {
  const variant = VARIANTS[trend];
  const Icon = variant.icon;
  const showPct = typeof changePct === "number" && !Number.isNaN(changePct);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        variant.tone,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {showPct ? `${changePct! >= 0 ? "+" : ""}${changePct!.toFixed(2)}%` : variant.label}
    </span>
  );
}
