"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

export type KPITone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export type KPICardProps = {
  label: string;
  value: string | number | ReactNode;
  subValue?: string | null;
  trend?: string | null;
  icon?: ReactNode;
  /**
   * Visual tone of the card. IMPORTANT: zero-valued metrics should always use
   * "neutral" — never paint a "0 Frozen" card red or a "0 Released" card green.
   */
  tone?: KPITone;
  loading?: boolean;
  className?: string;
};

const TONE_TEXT: Record<KPITone, string> = {
  neutral: "text-night-100",
  brand: "text-brand-400",
  success: "text-success-400",
  warning: "text-warning-400",
  danger: "text-danger-400",
  info: "text-night-200",
};

const TONE_ICON_BG: Record<KPITone, string> = {
  neutral: "bg-night-700/90 text-night-100",
  brand: "bg-orange-500/12 text-brand-400",
  success: "bg-success-500/15 text-success-400",
  warning: "bg-warning-500/15 text-warning-400",
  danger: "bg-danger-100 text-danger-400",
  info: "bg-night-800 text-night-200",
};

export function KPICard({
  label,
  value,
  subValue,
  trend,
  icon,
  tone = "neutral",
  loading = false,
  className,
}: KPICardProps) {
  // Rule: a value that resolves to zero (0, "0", "$0.00 CAD", "0 %") must fall
  // back to neutral tone so the card reads as "no data" not "alert".
  const isZeroish =
    value === 0 ||
    value === "0" ||
    (typeof value === "string" && /^\s*\$?0+(\.0+)?\s*(%|CAD)?\s*$/.test(value));
  const effectiveTone: KPITone = isZeroish ? "neutral" : tone;

  return (
    <div
      className={clsx(
        "rounded-2xl border border-night-600/70 bg-night-900/95 px-5 py-4 shadow-industrial-panel transition-all duration-150",
        "hover:border-orange-400/35 hover:shadow-card-hover",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-night-200">
            {label}
          </p>
          <p
            className={clsx(
              "mt-2 text-2xl font-extrabold leading-tight",
              TONE_TEXT[effectiveTone],
              loading && "animate-pulse text-night-300"
            )}
          >
            {loading ? "—" : value}
          </p>
          {subValue && <p className="mt-1 text-xs text-night-200">{subValue}</p>}
          {trend && (
            <p
              className={clsx(
                "mt-1 text-xs font-semibold",
                trend.startsWith("-")
                  ? "text-danger-600"
                  : tone === "brand"
                    ? "text-brand-400"
                    : "text-emerald-600"
              )}
            >
              {trend}
            </p>
          )}
        </div>
        {icon && (
          <span
            className={clsx(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              TONE_ICON_BG[effectiveTone]
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>
    </div>
  );
}
