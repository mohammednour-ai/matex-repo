/**
 * In-memory demo store. Used when DATABASE_URL isn't set so the intelligence
 * UI is fully exercise-able locally without Supabase. Data is process-local
 * and resets on restart. Seeded lazily on first read with a deterministic
 * snapshot derived from the materials catalog and today's date.
 */

import { randomUUID } from "node:crypto";
import { MATERIALS, getMaterial } from "./materials";
import type {
  CreateAlertInput,
  ListingMetricsRow,
  MarketIntelligenceRow,
  PriceAlertRow,
  PriceAlertStatus,
  PriceRecommendationRow,
} from "./types";

type Row<T> = T;

const intelligenceByDate = new Map<string, MarketIntelligenceRow>(); // key: material:date
const recommendations: PriceRecommendationRow[] = [];
const listingMetricsByListing = new Map<string, ListingMetricsRow>();
const alerts = new Map<string, PriceAlertRow>();
const dispatchedKeys = new Set<string>();

let seeded = false;

function seedIfNeeded(): void {
  if (seeded) return;
  seeded = true;
  const today = new Date();
  for (let dayOffset = 14; dayOffset >= 0; dayOffset--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - dayOffset);
    const isoDate = d.toISOString().slice(0, 10);
    for (const material of MATERIALS) {
      const seed = hash(`${material.key}:${isoDate}`);
      const drift = ((seed % 2000) / 1000 - 1) * material.volatility;
      const lme = round(material.baseLmePrice * (1 + drift), material.unit === "lb" ? 3 : 2);
      const fm = round(lme * 1.012, material.unit === "lb" ? 3 : 2);
      const matexAvg = round(lme * (1 + drift * 0.4), material.unit === "lb" ? 3 : 2);
      const trend = drift > 0.005 ? "up" : drift < -0.005 ? "down" : "stable";
      const demand = seed % 3 === 0 ? "high" : seed % 3 === 1 ? "medium" : "low";
      const rec = trend === "up" && demand !== "low" ? "buy" : trend === "down" ? "hold" : "hold";
      const key = `${material.key}:${isoDate}`;
      const row: MarketIntelligenceRow = {
        intelligence_id: `demo-${key}`,
        material_key: material.key,
        material_label: material.label,
        snapshot_date: isoDate,
        lme_price: lme,
        lme_change_pct: round(drift * 100, 2),
        fastmarkets_price: fm,
        fastmarkets_label:
          material.category === "ferrous"
            ? "Toronto delivered, dealer to mill"
            : "North America delivered, consumer buying",
        matex_avg_price: matexAvg,
        matex_auction_count: 4 + (seed % 8),
        trend,
        demand,
        recommendation: rec,
        summary:
          trend === "up"
            ? `${material.label} firming on tight regional supply`
            : trend === "down"
              ? `${material.label} drifting lower; buyers cautious`
              : `${material.label} range-bound around the LME reference`,
        reasoning:
          "Seed analysis derived deterministically from the materials catalog. Replace with live AI output once data feeds are wired.",
        price_low: round(lme * 0.97, 2),
        price_high: round(lme * 1.04, 2),
        next_event:
          dayOffset === 0
            ? "US Fed minutes release this Wednesday — watch USD/CAD."
            : "Monthly LME options expiry approaching.",
        news_headlines: [
          `${material.label} demand steady as North American mills hold output`,
          `Trader sentiment on ${material.label} ${trend === "up" ? "constructive" : trend === "down" ? "cautious" : "balanced"} this week`,
        ],
        source: "stub",
        created_at: d.toISOString(),
        updated_at: d.toISOString(),
      };
      intelligenceByDate.set(key, row);
    }
  }
}

export const demoStore = {
  getLatestIntelligence(materialKey: string): MarketIntelligenceRow | null {
    seedIfNeeded();
    const candidates = [...intelligenceByDate.values()]
      .filter((r) => r.material_key === materialKey)
      .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
    return candidates[0] ?? null;
  },

  listLatestIntelligence(): MarketIntelligenceRow[] {
    seedIfNeeded();
    const byMat = new Map<string, MarketIntelligenceRow>();
    for (const row of intelligenceByDate.values()) {
      const existing = byMat.get(row.material_key);
      if (!existing || existing.snapshot_date < row.snapshot_date) {
        byMat.set(row.material_key, row);
      }
    }
    return [...byMat.values()].sort((a, b) => a.material_label.localeCompare(b.material_label));
  },

  listIntelligenceHistory(materialKey: string, days: number): MarketIntelligenceRow[] {
    seedIfNeeded();
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    return [...intelligenceByDate.values()]
      .filter((r) => r.material_key === materialKey && new Date(r.snapshot_date) >= cutoff)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  },

  upsertIntelligence(row: Omit<MarketIntelligenceRow, "intelligence_id" | "created_at" | "updated_at">): MarketIntelligenceRow {
    seedIfNeeded();
    const key = `${row.material_key}:${row.snapshot_date}`;
    const existing = intelligenceByDate.get(key);
    const now = new Date().toISOString();
    const merged: MarketIntelligenceRow = {
      intelligence_id: existing?.intelligence_id ?? `demo-${key}`,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      ...row,
    };
    intelligenceByDate.set(key, merged);
    return merged;
  },

  insertPriceRecommendation(input: Omit<PriceRecommendationRow, "recommendation_id" | "created_at">): PriceRecommendationRow {
    const row: PriceRecommendationRow = {
      ...input,
      recommendation_id: randomUUID(),
      created_at: new Date().toISOString(),
    };
    recommendations.unshift(row);
    if (recommendations.length > 200) recommendations.pop();
    return row;
  },

  getListingMetrics(listingId: string): ListingMetricsRow | null {
    return listingMetricsByListing.get(listingId) ?? null;
  },

  upsertListingMetrics(row: Omit<ListingMetricsRow, "updated_at">): ListingMetricsRow {
    const merged: ListingMetricsRow = { ...row, updated_at: new Date().toISOString() };
    listingMetricsByListing.set(row.listing_id, merged);
    return merged;
  },

  listAlertsForUser(userId: string): PriceAlertRow[] {
    return [...alerts.values()]
      .filter((a) => a.user_id === userId && a.status !== "archived")
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  listActiveAlertsForMaterial(materialKey: string): PriceAlertRow[] {
    return [...alerts.values()].filter((a) => a.material_key === materialKey && a.status === "active");
  },

  createAlert(input: CreateAlertInput): PriceAlertRow {
    const row: PriceAlertRow = {
      alert_id: randomUUID(),
      user_id: input.user_id,
      material_key: input.material_key,
      material_label: input.material_label,
      alert_type: input.alert_type,
      threshold: input.threshold,
      region: input.region,
      channels: input.channels,
      status: "active",
      last_triggered_at: null,
      last_known_trend: null,
      last_known_demand: null,
      note: input.note,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    alerts.set(row.alert_id, row);
    return row;
  },

  updateAlertStatus(alertId: string, userId: string, status: PriceAlertStatus): PriceAlertRow | null {
    const row = alerts.get(alertId);
    if (!row || row.user_id !== userId) return null;
    const updated: PriceAlertRow = { ...row, status, updated_at: new Date().toISOString() };
    alerts.set(alertId, updated);
    return updated;
  },

  deleteAlert(alertId: string, userId: string): boolean {
    const row = alerts.get(alertId);
    if (!row || row.user_id !== userId) return false;
    alerts.delete(alertId);
    return true;
  },

  recordAlertDispatch(input: { alert_id: string; intelligence_id: string | null; channel: string; delivery_status: string; snapshot: Record<string, unknown>; }): boolean {
    const key = `${input.alert_id}:${input.intelligence_id ?? "null"}:${input.channel}`;
    if (dispatchedKeys.has(key)) return false;
    dispatchedKeys.add(key);
    return true;
  },

  matexStats(materialKey: string): { avg_price: number | null; count: number; trend_series: number[] } {
    seedIfNeeded();
    const material = getMaterial(materialKey);
    if (!material) return { avg_price: null, count: 0, trend_series: [] };
    const series = [...intelligenceByDate.values()]
      .filter((r) => r.material_key === materialKey)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
      .map((r) => r.matex_avg_price ?? r.lme_price ?? material.baseLmePrice);
    const avg = series.reduce((a, b) => a + b, 0) / Math.max(series.length, 1);
    return {
      avg_price: round(avg, 2),
      count: 6 + (hash(materialKey) % 8),
      trend_series: series.slice(-12),
    };
  },
};

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

function round(n: number, digits = 2): number {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
}
