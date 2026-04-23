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
  neutral: "text-steel-900",
  brand: "text-brand-700",
  success: "text-emerald-700",
  warning: "text-amber-700",
  danger: "text-danger-700",
  info: "text-sky-700",
};

const TONE_ICON_BG: Record<KPITone, string> = {
  neutral: "bg-steel-100 text-steel-600",
  brand: "bg-brand-100 text-brand-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-danger-100 text-danger-700",
  info: "bg-sky-100 text-sky-700",
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
        "rounded-2xl border border-steel-100 bg-white px-5 py-4 shadow-sm transition-all duration-150",
        "hover:border-steel-200 hover:shadow-md",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-steel-500">
            {label}
          </p>
          <p
            className={clsx(
              "mt-2 text-2xl font-extrabold leading-tight",
              TONE_TEXT[effectiveTone],
              loading && "animate-pulse text-steel-300"
            )}
          >
            {loading ? "—" : value}
          </p>
          {subValue && <p className="mt-1 text-xs text-steel-500">{subValue}</p>}
          {trend && (
            <p
              className={clsx(
                "mt-1 text-xs font-semibold",
                trend.startsWith("-") ? "text-danger-600" : "text-emerald-600"
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
