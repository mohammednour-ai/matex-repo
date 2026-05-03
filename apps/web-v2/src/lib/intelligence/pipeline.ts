/**
 * Daily market analysis orchestrator.
 *
 *   1. Iterate the materials catalog.
 *   2. For each material: fetch LME / Fastmarkets / News (stubbed adapters)
 *      and our own auction aggregates.
 *   3. Hand the bundle to the AI layer; persist the result in
 *      `intelligence_mcp.market_intelligence`.
 *   4. Evaluate active price alerts against the snapshot and queue dispatches.
 *
 * Designed to be invoked from Inngest (cron) or a manual debug endpoint.
 * Returns a structured summary so callers can log / display run metrics.
 */

import { MATERIALS, getMaterial } from "./materials";
import {
  fetchMatexAuctionStats,
  listActiveAlertsForMaterial,
  recordAlertDispatch,
  upsertIntelligence,
} from "./db";
import {
  classifyTrend,
  fetchFastmarketsAssessment,
  fetchLmePrice,
  fetchNewsHeadlines,
} from "./sources";
import { analyseMarket } from "./ai";
import type { MarketIntelligenceRow, PriceAlertRow } from "./types";

export type DailyRunSummary = {
  ran_at: string;
  materials_processed: number;
  ai_source: { live: number; stub: number };
  alerts_dispatched: number;
  errors: Array<{ material_key: string; message: string }>;
};

export async function runDailyMarketAnalysis(now: Date = new Date()): Promise<DailyRunSummary> {
  const summary: DailyRunSummary = {
    ran_at: now.toISOString(),
    materials_processed: 0,
    ai_source: { live: 0, stub: 0 },
    alerts_dispatched: 0,
    errors: [],
  };

  for (const material of MATERIALS) {
    try {
      const [lme, fm, news, matex] = await Promise.all([
        fetchLmePrice(material, now),
        fetchFastmarketsAssessment(material, now),
        fetchNewsHeadlines(material, now),
        fetchMatexAuctionStats(material.key),
      ]);
      const matexTrend = classifyTrend(matex.trend_series);
      const { result, source } = await analyseMarket({
        material_key: material.key,
        material_label: material.label,
        unit: material.unit,
        lme_price: lme.price,
        lme_change_pct: lme.change_pct,
        fastmarkets_price: fm.price,
        fastmarkets_label: fm.assessment_label,
        matex_avg_price: matex.avg_price,
        matex_auction_count: matex.count,
        matex_recent_trend: matexTrend,
        news_headlines: news.map((n) => n.headline),
      });
      summary.ai_source[source]++;

      const row = await upsertIntelligence({
        material_key: material.key,
        material_label: material.label,
        snapshot_date: now.toISOString().slice(0, 10),
        lme_price: lme.price,
        lme_change_pct: lme.change_pct,
        fastmarkets_price: fm.price,
        fastmarkets_label: fm.assessment_label,
        matex_avg_price: matex.avg_price,
        matex_auction_count: matex.count,
        trend: result.trend,
        demand: result.demand,
        recommendation: result.recommendation,
        summary: result.summary,
        reasoning: result.reasoning,
        price_low: result.price_low,
        price_high: result.price_high,
        next_event: result.next_event,
        news_headlines: news.map((n) => n.headline),
        source,
      });

      const dispatched = await dispatchAlertsForSnapshot(row);
      summary.alerts_dispatched += dispatched;
      summary.materials_processed++;
    } catch (err) {
      summary.errors.push({
        material_key: material.key,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

async function dispatchAlertsForSnapshot(row: MarketIntelligenceRow): Promise<number> {
  const alerts = await listActiveAlertsForMaterial(row.material_key);
  let count = 0;
  for (const alert of alerts) {
    if (!shouldFireAlert(alert, row)) continue;
    for (const channel of alert.channels) {
      const fired = await recordAlertDispatch({
        alert_id: alert.alert_id,
        intelligence_id: row.intelligence_id,
        channel,
        delivery_status: "queued",
        snapshot: {
          material_key: row.material_key,
          trend: row.trend,
          demand: row.demand,
          recommendation: row.recommendation,
          lme_price: row.lme_price,
          summary: row.summary,
        },
      });
      if (fired) {
        count++;
        // TODO(notifications): hand off to notifications-mcp / Knock /
        // SendGrid here. For now we only persist the dispatch record so the
        // UI can show "alert fired" without sending real messages.
      }
    }
  }
  return count;
}

function shouldFireAlert(alert: PriceAlertRow, row: MarketIntelligenceRow): boolean {
  const reference = row.lme_price ?? row.matex_avg_price;
  switch (alert.alert_type) {
    case "price_below":
      return reference !== null && alert.threshold !== null && reference <= alert.threshold;
    case "price_above":
      return reference !== null && alert.threshold !== null && reference >= alert.threshold;
    case "trend_reversal":
      return alert.last_known_trend !== null && alert.last_known_trend !== row.trend;
    case "demand_change":
      return alert.last_known_demand !== null && alert.last_known_demand !== row.demand;
    default:
      return false;
  }
}

/**
 * Compute and persist `listing_metrics` derived from the listing's market
 * intelligence + (eventually) its raw analytics events. Currently the inputs
 * are deterministic stubs so the dashboard is exercise-able. When an
 * analytics adapter lands, replace `synthesizeMetrics`.
 */
export async function refreshListingMetrics(input: {
  listing_id: string;
  material_key: string | null;
  asking_price: number | null;
}): Promise<import("./types").ListingMetricsRow> {
  const { upsertListingMetrics, getLatestIntelligence } = await import("./db");
  const intel = input.material_key ? await getLatestIntelligence(input.material_key) : null;
  const synthesized = synthesizeMetrics(input, intel);
  return upsertListingMetrics(synthesized);
}

function synthesizeMetrics(
  input: { listing_id: string; material_key: string | null; asking_price: number | null },
  intel: MarketIntelligenceRow | null,
): Omit<import("./types").ListingMetricsRow, "updated_at"> {
  const seed = hash(input.listing_id);
  const views_total = 60 + (seed % 250);
  const views_24h = 8 + (seed % 60);
  const views_change_pct = round(((seed % 50) - 15), 2);
  const watchers = 2 + (seed % 18);
  const bid_count = seed % 6;
  const benchmark =
    intel?.matex_avg_price ?? intel?.lme_price ?? getMaterial(input.material_key ?? "")?.baseLmePrice ?? null;
  const asking = input.asking_price ?? benchmark;
  const benchmark_delta_pct =
    asking && benchmark ? round(((asking - benchmark) / benchmark) * 100, 2) : null;
  const forecast_final = asking ? round(asking * 1.03, 2) : null;

  let label: string;
  let tip: string;
  if (benchmark_delta_pct === null) {
    label = "No benchmark yet";
    tip = "Once enough comparable auctions close we'll surface a competitive band here.";
  } else if (benchmark_delta_pct > 4) {
    label = "Premium pricing";
    tip = `Listing is ${benchmark_delta_pct}% above the 30-day benchmark. Consider a 1–2% trim to widen bidder pool.`;
  } else if (benchmark_delta_pct < -4) {
    label = "Below benchmark";
    tip = `Listing is ${Math.abs(benchmark_delta_pct)}% below the 30-day benchmark. Likely to clear quickly.`;
  } else {
    label = "Competitively priced";
    tip = `Within ±4% of the 30-day benchmark. Expect to sell on schedule.`;
  }

  return {
    listing_id: input.listing_id,
    material_key: input.material_key,
    views_total,
    views_24h,
    views_change_pct,
    watchers,
    bid_count,
    current_top_bid: bid_count > 0 && asking ? round(asking * 1.01, 2) : null,
    asking_price: asking,
    benchmark_avg: benchmark,
    benchmark_delta_pct,
    forecast_final,
    forecast_confidence: intel ? 0.72 : 0.5,
    ai_status_label: label,
    ai_tip: tip,
    last_event_at: new Date().toISOString(),
  };
}

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
