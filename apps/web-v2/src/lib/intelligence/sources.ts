/**
 * External data source adapters.
 *
 * Each adapter is wired so that:
 *   1. If the matching API key/credential is present, it should call the real
 *      provider (LME, Fastmarkets, NewsAPI). Those branches are intentionally
 *      stubbed with TODOs — flip them on when the keys arrive.
 *   2. Otherwise it returns a deterministic, date-seeded mock so the UI and
 *      pipeline are exercise-able end-to-end without external dependencies.
 *
 * Determinism matters: the dashboard calls these from server components and we
 * don't want every render to produce a different "live" price.
 */

import type { MarketTrend } from "./types";
import type { MaterialDefinition } from "./materials";

// ─── Deterministic helpers ────────────────────────────────────────────────

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

/** Seeded uniform in [-1, 1]. */
function jitter(seed: string): number {
  return (hash(seed) % 2000) / 1000 - 1;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Types returned by the adapters ───────────────────────────────────────

export type LmePriceQuote = {
  material_key: string;
  price: number;
  change_pct: number;
  currency: "CAD";
  unit: "mt" | "lb";
  asof: string;
  source: "stub" | "live";
};

export type FastmarketsAssessment = {
  material_key: string;
  assessment_label: string;
  price: number;
  asof: string;
  source: "stub" | "live";
};

export type NewsItem = {
  material_key: string;
  headline: string;
  sentiment: "bullish" | "bearish" | "neutral";
  asof: string;
};

// ─── LME ──────────────────────────────────────────────────────────────────

export async function fetchLmePrice(
  material: MaterialDefinition,
  date: Date = new Date(),
): Promise<LmePriceQuote> {
  const apiKey = process.env.LME_API_KEY?.trim();
  if (apiKey) {
    // TODO(live): GET https://api.lme.com/pricing/latest?metal=...
    //   const res = await fetch(...); return parseLmeResponse(res, material);
    // Falls through to stub for now until the contract is finalised.
  }

  const drift = jitter(`lme:${material.key}:${dateKey(date)}`) * material.volatility;
  const price = round(material.baseLmePrice * (1 + drift), material.unit === "lb" ? 3 : 2);
  const yesterday = jitter(`lme:${material.key}:${dateKey(addDays(date, -1))}`) * material.volatility;
  const prev = material.baseLmePrice * (1 + yesterday);
  const change_pct = round(((price - prev) / prev) * 100, 2);

  return {
    material_key: material.key,
    price,
    change_pct,
    currency: "CAD",
    unit: material.unit,
    asof: date.toISOString(),
    source: "stub",
  };
}

// ─── Fastmarkets ─────────────────────────────────────────────────────────

export async function fetchFastmarketsAssessment(
  material: MaterialDefinition,
  date: Date = new Date(),
): Promise<FastmarketsAssessment> {
  const apiKey = process.env.FASTMARKETS_API_KEY?.trim();
  if (apiKey) {
    // TODO(live): GET https://fastmarkets.com/api/assessments?symbol=...
  }

  const drift = jitter(`fm:${material.key}:${dateKey(date)}`) * material.volatility * 0.6;
  const price = round(material.baseLmePrice * (1 + drift) * 1.012, material.unit === "lb" ? 3 : 2);
  return {
    material_key: material.key,
    assessment_label:
      material.category === "ferrous"
        ? "Toronto delivered, dealer to mill"
        : "North America delivered, consumer buying",
    price,
    asof: date.toISOString(),
    source: "stub",
  };
}

// ─── News ────────────────────────────────────────────────────────────────

const NEWS_TEMPLATES: Record<MaterialDefinition["category"], string[]> = {
  ferrous: [
    "{label} demand steady as Ontario rebar mills hold output",
    "Quebec auto-shred yards report lighter feed; {label} prices firm",
    "US Midwest hot-band slips, dragging {label} export bids",
  ],
  non_ferrous: [
    "China refined-{token} imports up {pct}% YoY, supporting {label}",
    "Codelco strike chatter lifts {label} sentiment; LME tightens",
    "Saudi smelter outage reroutes {label} flows toward NA buyers",
  ],
  specialty: [
    "Nickel volatility filters into {label}; mills push back on premiums",
    "European demand for {label} muted as stainless inventories build",
    "Aerospace tier-1 restocking nudges {label} bids higher in Quebec",
  ],
};

export async function fetchNewsHeadlines(
  material: MaterialDefinition,
  date: Date = new Date(),
): Promise<NewsItem[]> {
  const apiKey = process.env.NEWS_API_KEY?.trim();
  if (apiKey) {
    // TODO(live): GET https://newsapi.org/v2/everything?q=<material> ...
  }

  const templates = NEWS_TEMPLATES[material.category];
  const seed = hash(`news:${material.key}:${dateKey(date)}`);
  const pct = (seed % 9) + 1;
  const token = material.key.split("_")[0]!;
  const picks: NewsItem[] = [];
  for (let i = 0; i < 3; i++) {
    const t = templates[(seed + i * 31) % templates.length]!;
    const headline = t.replaceAll("{label}", material.label).replaceAll("{token}", token).replaceAll("{pct}", String(pct));
    const sentimentSeed = (seed + i) % 3;
    picks.push({
      material_key: material.key,
      headline,
      sentiment: sentimentSeed === 0 ? "bullish" : sentimentSeed === 1 ? "bearish" : "neutral",
      asof: date.toISOString(),
    });
  }
  return picks;
}

// ─── Trend computation from a price series ───────────────────────────────

export function classifyTrend(series: number[]): MarketTrend {
  if (series.length < 2) return "stable";
  const first = series[0]!;
  const last = series.at(-1)!;
  const pct = ((last - first) / first) * 100;
  if (pct > 1.0) return "up";
  if (pct < -1.0) return "down";
  return "stable";
}

// ─── Tiny number helpers ─────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function round(n: number, digits = 2): number {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
}
