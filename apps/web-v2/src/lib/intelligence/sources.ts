/**
 * External data source adapters.
 *
 * Architecture:
 *   1. Each adapter has a `live` path (real API call + parsing) and a `stub`
 *      fallback that returns deterministic, date-seeded mocks.
 *   2. Activation is driven entirely by env vars — drop in the API key + the
 *      optional base-URL override and the live path lights up. No code change.
 *   3. If a live call throws or returns malformed data we log to console.warn
 *      and silently fall back to the stub. The pipeline must keep flowing
 *      every night even when an upstream provider has an outage.
 *
 * Determinism matters: server components call these directly during render,
 * so the stub stream can't change between renders of the same date.
 *
 * Env vars (see .env.example for the full list):
 *   LME_API_KEY           — enables fetchLmePrice live path
 *   LME_API_URL           — optional base, default "https://api.lme.com/pricing/v1"
 *   FASTMARKETS_API_KEY   — enables fetchFastmarketsAssessment live path
 *   FASTMARKETS_API_URL   — optional base, default "https://api.fastmarkets.com/v1"
 *   NEWS_API_KEY          — enables fetchNewsHeadlines live path
 *   NEWS_API_URL          — optional base, default "https://newsapi.org/v2"
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

// ─── Provider symbol mappings ─────────────────────────────────────────────

/**
 * Translate canonical material keys to provider-specific symbols. Adapters
 * skip materials that don't have a mapping (we don't fabricate data for
 * obscure scrap grades — the stub picks up the slack).
 */
const LME_SYMBOLS: Record<string, string> = {
  copper_2: "CA",          // Copper Grade A is the LME code; #2 is referenced off it.
  copper_1: "CA",
  aluminum_ubc: "AH",      // High-grade primary aluminium.
  aluminum_extrusion: "AH",
  steel_hms_1_2: "SR",     // Steel scrap HMS index.
  stainless_304: "NI",     // Stainless follows nickel; we proxy off LME nickel.
};

const FASTMARKETS_SYMBOLS: Record<string, string> = {
  copper_2: "MB-CU-0114",  // No.2 copper, North America delivered.
  copper_1: "MB-CU-0113",
  aluminum_ubc: "MB-AL-0235",
  aluminum_extrusion: "MB-AL-0258",
  steel_hms_1_2: "MB-STE-0024",
  stainless_304: "MB-NI-0237",
};

const NEWS_QUERIES: Record<string, string> = {
  copper_2: "copper scrap price OR LME copper",
  copper_1: "bare bright copper price OR copper scrap",
  aluminum_ubc: "aluminum UBC price OR aluminum scrap",
  aluminum_extrusion: "aluminum extrusion price OR 6063 scrap",
  steel_hms_1_2: "steel HMS price OR scrap steel",
  stainless_304: "stainless steel scrap OR nickel price",
};

// Conversion: LME publishes USD/mt; we display CAD/mt or CAD/lb.
const LME_USD_TO_CAD = Number(process.env.FX_USD_TO_CAD ?? 1.36);
const LME_KG_PER_LB = 0.453592;

// ─── LME ──────────────────────────────────────────────────────────────────

export async function fetchLmePrice(
  material: MaterialDefinition,
  date: Date = new Date(),
): Promise<LmePriceQuote> {
  const apiKey = process.env.LME_API_KEY?.trim();
  const symbol = LME_SYMBOLS[material.key];
  if (apiKey && symbol) {
    try {
      const live = await fetchLmePriceLive(material, symbol, apiKey, date);
      if (live) return live;
    } catch (err) {
      console.warn(`[intelligence] LME live fetch failed for ${material.key}, falling back to stub:`, err);
    }
  }
  return stubLmePrice(material, date);
}

async function fetchLmePriceLive(
  material: MaterialDefinition,
  symbol: string,
  apiKey: string,
  date: Date,
): Promise<LmePriceQuote | null> {
  const base = (process.env.LME_API_URL ?? "https://api.lme.com/pricing/v1").replace(/\/$/, "");
  const url = `${base}/quotes/latest?metal=${encodeURIComponent(symbol)}`;
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
    // LME quotes are public-ish; cache aggressively to stay polite to the API.
    next: { revalidate: 600 },
  });
  if (!res.ok) {
    console.warn(`[intelligence] LME ${symbol} responded ${res.status}`);
    return null;
  }
  const json = (await res.json()) as {
    data?: {
      symbol?: string;
      price_usd_per_mt?: number;
      previous_close_usd_per_mt?: number;
      asof?: string;
    };
  };
  const usd = Number(json.data?.price_usd_per_mt);
  const prevUsd = Number(json.data?.previous_close_usd_per_mt);
  if (!Number.isFinite(usd) || usd <= 0) return null;
  const cadPerMt = usd * LME_USD_TO_CAD;
  const price = material.unit === "lb"
    ? round(cadPerMt * LME_KG_PER_LB / 1000, 3)
    : round(cadPerMt, 2);
  const change_pct = Number.isFinite(prevUsd) && prevUsd > 0
    ? round(((usd - prevUsd) / prevUsd) * 100, 2)
    : 0;
  return {
    material_key: material.key,
    price,
    change_pct,
    currency: "CAD",
    unit: material.unit,
    asof: json.data?.asof ?? date.toISOString(),
    source: "live",
  };
}

function stubLmePrice(material: MaterialDefinition, date: Date): LmePriceQuote {
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
  const symbol = FASTMARKETS_SYMBOLS[material.key];
  if (apiKey && symbol) {
    try {
      const live = await fetchFastmarketsLive(material, symbol, apiKey, date);
      if (live) return live;
    } catch (err) {
      console.warn(`[intelligence] Fastmarkets live fetch failed for ${material.key}, falling back to stub:`, err);
    }
  }
  return stubFastmarkets(material, date);
}

async function fetchFastmarketsLive(
  material: MaterialDefinition,
  symbol: string,
  apiKey: string,
  date: Date,
): Promise<FastmarketsAssessment | null> {
  const base = (process.env.FASTMARKETS_API_URL ?? "https://api.fastmarkets.com/v1").replace(/\/$/, "");
  const url = `${base}/assessments/${encodeURIComponent(symbol)}/latest`;
  const res = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      accept: "application/json",
    },
    next: { revalidate: 1800 },
  });
  if (!res.ok) {
    console.warn(`[intelligence] Fastmarkets ${symbol} responded ${res.status}`);
    return null;
  }
  const json = (await res.json()) as {
    assessment?: {
      label?: string;
      mid?: number;
      currency?: string;
      unit?: string;
      asof?: string;
    };
  };
  const mid = Number(json.assessment?.mid);
  if (!Number.isFinite(mid) || mid <= 0) return null;
  const currency = (json.assessment?.currency ?? "USD").toUpperCase();
  const usdPerMt = currency === "CAD" ? mid / LME_USD_TO_CAD : mid;
  const cadPerMt = usdPerMt * LME_USD_TO_CAD;
  const price = material.unit === "lb"
    ? round(cadPerMt * LME_KG_PER_LB / 1000, 3)
    : round(cadPerMt, 2);
  return {
    material_key: material.key,
    assessment_label: json.assessment?.label ?? defaultAssessmentLabel(material),
    price,
    asof: json.assessment?.asof ?? date.toISOString(),
    source: "live",
  };
}

function stubFastmarkets(material: MaterialDefinition, date: Date): FastmarketsAssessment {
  const drift = jitter(`fm:${material.key}:${dateKey(date)}`) * material.volatility * 0.6;
  const price = round(material.baseLmePrice * (1 + drift) * 1.012, material.unit === "lb" ? 3 : 2);
  return {
    material_key: material.key,
    assessment_label: defaultAssessmentLabel(material),
    price,
    asof: date.toISOString(),
    source: "stub",
  };
}

function defaultAssessmentLabel(material: MaterialDefinition): string {
  return material.category === "ferrous"
    ? "Toronto delivered, dealer to mill"
    : "North America delivered, consumer buying";
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
    try {
      const live = await fetchNewsLive(material, apiKey, date);
      if (live && live.length > 0) return live;
    } catch (err) {
      console.warn(`[intelligence] News live fetch failed for ${material.key}, falling back to stub:`, err);
    }
  }
  return stubNews(material, date);
}

async function fetchNewsLive(
  material: MaterialDefinition,
  apiKey: string,
  date: Date,
): Promise<NewsItem[] | null> {
  const query = NEWS_QUERIES[material.key];
  if (!query) return null;
  const base = (process.env.NEWS_API_URL ?? "https://newsapi.org/v2").replace(/\/$/, "");
  const url = `${base}/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&language=en&pageSize=5`;
  const res = await fetch(url, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
    next: { revalidate: 1800 },
  });
  if (!res.ok) {
    console.warn(`[intelligence] News ${material.key} responded ${res.status}`);
    return null;
  }
  const json = (await res.json()) as {
    articles?: Array<{ title?: string; description?: string; publishedAt?: string }>;
  };
  const articles = json.articles ?? [];
  if (articles.length === 0) return null;
  return articles.slice(0, 3).map((a) => ({
    material_key: material.key,
    headline: a.title ?? "(untitled)",
    sentiment: classifySentimentFromHeadline(a.title ?? ""),
    asof: a.publishedAt ?? date.toISOString(),
  }));
}

function stubNews(material: MaterialDefinition, date: Date): NewsItem[] {
  const templates = NEWS_TEMPLATES[material.category];
  const seed = hash(`news:${material.key}:${dateKey(date)}`);
  const pct = (seed % 9) + 1;
  const token = material.key.split("_")[0]!;
  const picks: NewsItem[] = [];
  for (let i = 0; i < 3; i++) {
    const t = templates[(seed + i * 31) % templates.length]!;
    const headline = t
      .replaceAll("{label}", material.label)
      .replaceAll("{token}", token)
      .replaceAll("{pct}", String(pct));
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

function classifySentimentFromHeadline(text: string): "bullish" | "bearish" | "neutral" {
  const t = text.toLowerCase();
  const bull = (t.match(/lift|firm|tight|rally|surge|support|jump|gain|rise|climb/g) ?? []).length;
  const bear = (t.match(/drop|fall|slip|weak|cut|outage|slump|tumble|decline/g) ?? []).length;
  if (bull > bear) return "bullish";
  if (bear > bull) return "bearish";
  return "neutral";
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
