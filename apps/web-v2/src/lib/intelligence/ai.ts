/**
 * AI analysis layer.
 *
 * `analyseMarket` and `recommendListingPrice` are the only AI entry points
 * the rest of the pipeline knows about. Both return a strict shape and never
 * throw — if Anthropic isn't configured (or the call fails), they fall back
 * to a deterministic heuristic so the rest of the pipeline can keep flowing.
 *
 * We talk to the Anthropic API via plain fetch (no SDK install required) to
 * keep the dependency surface flat.
 */

import { getMaterial } from "./materials";
import type {
  AnalysisInput,
  AnalysisResult,
  MarketDemand,
  MarketRecommendation,
  MarketTrend,
  RecommendationInput,
  RecommendationResult,
} from "./types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MARKET_MODEL ?? "claude-opus-4-7";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

// ─── Daily market analysis ────────────────────────────────────────────────

export async function analyseMarket(input: AnalysisInput): Promise<{ result: AnalysisResult; source: "live" | "stub" }> {
  if (aiConfigured()) {
    try {
      const live = await callClaudeForAnalysis(input);
      if (live) return { result: live, source: "live" };
    } catch {
      // Swallow — fall through to deterministic fallback. We don't want a
      // single bad model response to block the whole nightly pipeline.
    }
  }
  return { result: heuristicAnalysis(input), source: "stub" };
}

async function callClaudeForAnalysis(input: AnalysisInput): Promise<AnalysisResult | null> {
  const prompt = `You are a B2B scrap metals market analyst. Analyse the market data below and respond with strict JSON only — no prose, no fences.

Material: ${input.material_label} (${input.unit}, key=${input.material_key})
LME: ${input.lme_price ?? "n/a"} CAD (chg ${input.lme_change_pct ?? 0}%)
Fastmarkets assessment: ${input.fastmarkets_label ?? "n/a"} @ ${input.fastmarkets_price ?? "n/a"} CAD
Matex 30-day avg: ${input.matex_avg_price ?? "n/a"} CAD across ${input.matex_auction_count} completed auctions
Matex recent trend: ${input.matex_recent_trend}
Headlines: ${input.news_headlines.slice(0, 5).join(" | ") || "none"}

Return JSON of shape:
{
  "trend": "up" | "down" | "stable",
  "demand": "low" | "medium" | "high",
  "recommendation": "buy" | "hold" | "sell",
  "summary": string (max 140 chars),
  "reasoning": string (max 280 chars, cite at least one number),
  "price_low": number,
  "price_high": number,
  "next_event": string (max 140 chars, what to watch in the next 7 days)
}`;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find((p) => p.type === "text")?.text ?? "";
  return parseAnalysisJson(text);
}

function parseAnalysisJson(raw: string): AnalysisResult | null {
  // Tolerate light wrapping like ```json ... ```
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (!isTrend(parsed.trend) || !isDemand(parsed.demand) || !isRecommendation(parsed.recommendation)) return null;
    return {
      trend: parsed.trend,
      demand: parsed.demand,
      recommendation: parsed.recommendation,
      summary: String(parsed.summary ?? "").slice(0, 200),
      reasoning: String(parsed.reasoning ?? "").slice(0, 320),
      price_low: Number(parsed.price_low ?? 0),
      price_high: Number(parsed.price_high ?? 0),
      next_event: String(parsed.next_event ?? "").slice(0, 200),
    };
  } catch {
    return null;
  }
}

function isTrend(v: unknown): v is MarketTrend {
  return v === "up" || v === "down" || v === "stable";
}
function isDemand(v: unknown): v is MarketDemand {
  return v === "low" || v === "medium" || v === "high";
}
function isRecommendation(v: unknown): v is MarketRecommendation {
  return v === "buy" || v === "hold" || v === "sell";
}

// Heuristic fallback used when AI is offline. It still produces sensible,
// data-grounded outputs so the dashboard doesn't show "—" forever.
function heuristicAnalysis(input: AnalysisInput): AnalysisResult {
  const lme = input.lme_price ?? input.fastmarkets_price ?? input.matex_avg_price ?? 0;
  const change = input.lme_change_pct ?? 0;
  const headlineSentiment = guessSentiment(input.news_headlines);
  const trend: MarketTrend = change > 0.5 ? "up" : change < -0.5 ? "down" : input.matex_recent_trend;
  const demand: MarketDemand =
    input.matex_auction_count >= 8 ? "high" : input.matex_auction_count <= 3 ? "low" : "medium";
  const recommendation: MarketRecommendation =
    trend === "up" && demand === "high"
      ? "buy"
      : trend === "down" && demand === "low"
        ? "sell"
        : "hold";
  const swing = lme * 0.04;
  return {
    trend,
    demand,
    recommendation,
    summary:
      trend === "up"
        ? `${input.material_label} firming with ${input.matex_auction_count} recent auctions`
        : trend === "down"
          ? `${input.material_label} drifting lower; bid coverage thinning`
          : `${input.material_label} steady; LME ±1% week-on-week`,
    reasoning: `LME ${input.lme_price ?? "n/a"} (${change >= 0 ? "+" : ""}${change}%); Matex 30-day avg ${input.matex_avg_price ?? "n/a"} across ${input.matex_auction_count} sales; sentiment ${headlineSentiment}.`,
    price_low: round(Math.max(lme - swing, 0), 2),
    price_high: round(lme + swing, 2),
    next_event: "Watch the upcoming LME options expiry and Friday's CPI print for direction.",
  };
}

function guessSentiment(headlines: string[]): "bullish" | "bearish" | "neutral" {
  const txt = headlines.join(" ").toLowerCase();
  const bull = (txt.match(/lift|firm|tight|rally|surge|support/g) ?? []).length;
  const bear = (txt.match(/drop|fall|slip|weak|cut|outage/g) ?? []).length;
  if (bull > bear + 1) return "bullish";
  if (bear > bull + 1) return "bearish";
  return "neutral";
}

// ─── Listing price recommendation ─────────────────────────────────────────

export async function recommendListingPrice(input: RecommendationInput): Promise<{ result: RecommendationResult; source: "live" | "stub" }> {
  if (aiConfigured() && input.intelligence) {
    try {
      const live = await callClaudeForRecommendation(input);
      if (live) return { result: live, source: "live" };
    } catch {
      // Fall through.
    }
  }
  return { result: heuristicRecommendation(input), source: "stub" };
}

async function callClaudeForRecommendation(input: RecommendationInput): Promise<RecommendationResult | null> {
  const intel = input.intelligence!;
  const prompt = `You are pricing a B2B scrap listing. Given the market snapshot, recommend a single starting price plus a defensible floor and ceiling. Respond with strict JSON only.

Material: ${intel.material_label} (key=${input.material_key})
Quantity: ${input.quantity ?? "?"} ${input.unit ?? ""}
Seller region: ${input.seller_region ?? "n/a"}
LME: ${intel.lme_price} CAD (chg ${intel.lme_change_pct ?? 0}%)
Fastmarkets assessment: ${intel.fastmarkets_label ?? "n/a"} @ ${intel.fastmarkets_price ?? "n/a"} CAD
Matex 30-day avg: ${intel.matex_avg_price ?? "n/a"} CAD across ${intel.matex_auction_count} sales
Trend: ${intel.trend}; Demand: ${intel.demand}; Outlook: ${intel.recommendation}

Return JSON:
{
  "recommended_price": number,
  "floor_price": number,
  "ceiling_price": number,
  "rationale": string (max 220 chars),
  "confidence": number  // 0..1
}`;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find((p) => p.type === "text")?.text ?? "";
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      recommended_price: Number(parsed.recommended_price ?? 0),
      floor_price: Number(parsed.floor_price ?? 0),
      ceiling_price: Number(parsed.ceiling_price ?? 0),
      rationale: String(parsed.rationale ?? "").slice(0, 280),
      confidence: clamp(Number(parsed.confidence ?? 0.6), 0, 1),
    };
  } catch {
    return null;
  }
}

function heuristicRecommendation(input: RecommendationInput): RecommendationResult {
  const intel = input.intelligence;
  const fallback = getMaterial(input.material_key)?.baseLmePrice ?? 0;
  const anchor = intel?.lme_price ?? intel?.matex_avg_price ?? fallback;
  const premium =
    intel?.demand === "high" ? 0.018 : intel?.demand === "low" ? -0.012 : 0.005;
  const trendAdj = intel?.trend === "up" ? 0.01 : intel?.trend === "down" ? -0.008 : 0;
  const recommended = round(anchor * (1 + premium + trendAdj), 2);
  return {
    recommended_price: recommended,
    floor_price: round(anchor * 0.97, 2),
    ceiling_price: round(anchor * 1.05, 2),
    rationale: intel
      ? `Anchored on LME ${intel.lme_price ?? fallback}; Matex 30-day avg ${intel.matex_avg_price ?? "n/a"}; demand ${intel.demand}, trend ${intel.trend}.`
      : `Anchored on the materials catalog reference; refresh once a market snapshot is available.`,
    confidence: intel ? 0.7 : 0.45,
  };
}

function round(n: number, digits = 2): number {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
