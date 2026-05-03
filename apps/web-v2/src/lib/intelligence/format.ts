/**
 * Display helpers for intelligence rows. Keep formatting in one place so the
 * dashboard, market page, and embedded widgets stay consistent.
 */

import type { MarketRecommendation, MarketTrend } from "./types";

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const CAD_SUB = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 3 });

export function formatPrice(value: number | null | undefined, unit: string | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const formatted = (unit ?? "").toLowerCase() === "lb" ? CAD_SUB.format(value) : CAD.format(value);
  return unit ? `${formatted}/${unit}` : formatted;
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export const RECOMMENDATION_TONE: Record<MarketRecommendation, string> = {
  buy: "bg-success-50 text-success-800 ring-success-500/30",
  hold: "bg-warning-50 text-warning-800 ring-warning-500/30",
  sell: "bg-danger-50 text-danger-800 ring-danger-500/30",
};

export const RECOMMENDATION_LABEL: Record<MarketRecommendation, string> = {
  buy: "Buy window",
  hold: "Hold",
  sell: "Sell now",
};

export const TREND_LABEL: Record<MarketTrend, string> = {
  up: "Trending up",
  down: "Trending down",
  stable: "Stable",
};

export function formatRelativeAgo(iso: string | null | undefined): string {
  if (!iso) return "just now";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
