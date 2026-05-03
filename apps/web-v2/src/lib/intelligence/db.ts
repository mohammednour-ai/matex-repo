/**
 * Thin pg pool wrapper for the intelligence stack.
 *
 * Re-uses a single Pool per Node process. Without `DATABASE_URL` set the
 * helpers operate in "memory mode" — they no-op writes and serve from the
 * in-memory demo cache so the UI remains functional in dev without Supabase.
 */

import type {
  CreateAlertInput,
  ListingMetricsRow,
  MarketIntelligenceRow,
  PriceAlertRow,
  PriceAlertStatus,
  PriceRecommendationRow,
} from "./types";
import { demoStore } from "./demo-store";

export type { CreateAlertInput } from "./types";

// `pg` ships without bundled types in this repo, so we use a structural shape
// just rich enough for our query needs. Keeps the dependency surface flat and
// matches the pattern used by `app/api/stripe/webhook/route.ts`.
type PgRowSet<T> = { rows: T[]; rowCount: number | null };
type PgPool = {
  query: <T = unknown>(text: string, params?: unknown[]) => Promise<PgRowSet<T>>;
  end?: () => Promise<void>;
};

let _pool: PgPool | null = null;

async function getPool(): Promise<PgPool | null> {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  const pg = (await import("pg")).default as { Pool: new (cfg: Record<string, unknown>) => PgPool };
  _pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 4,
  });
  return _pool;
}

/** True when a real DB is wired; false in dev/demo mode. */
export async function hasDatabase(): Promise<boolean> {
  const p = await getPool();
  return p !== null;
}

// ─── market_intelligence ──────────────────────────────────────────────────

export async function getLatestIntelligence(materialKey: string): Promise<MarketIntelligenceRow | null> {
  const p = await getPool();
  if (!p) return demoStore.getLatestIntelligence(materialKey);
  const { rows } = await p.query<MarketIntelligenceRow>(
    `SELECT * FROM intelligence_mcp.market_intelligence
     WHERE material_key = $1
     ORDER BY snapshot_date DESC LIMIT 1`,
    [materialKey],
  );
  return rows[0] ?? null;
}

export async function listLatestIntelligence(): Promise<MarketIntelligenceRow[]> {
  const p = await getPool();
  if (!p) return demoStore.listLatestIntelligence();
  const { rows } = await p.query<MarketIntelligenceRow>(
    `SELECT DISTINCT ON (material_key) *
       FROM intelligence_mcp.market_intelligence
      ORDER BY material_key, snapshot_date DESC`,
  );
  return rows;
}

export async function listIntelligenceHistory(
  materialKey: string,
  days: number,
): Promise<MarketIntelligenceRow[]> {
  const p = await getPool();
  if (!p) return demoStore.listIntelligenceHistory(materialKey, days);
  const { rows } = await p.query<MarketIntelligenceRow>(
    `SELECT * FROM intelligence_mcp.market_intelligence
      WHERE material_key = $1
        AND snapshot_date >= (CURRENT_DATE - $2::int)
      ORDER BY snapshot_date ASC`,
    [materialKey, days],
  );
  return rows;
}

export async function upsertIntelligence(row: Omit<MarketIntelligenceRow, "intelligence_id" | "created_at" | "updated_at">): Promise<MarketIntelligenceRow> {
  const p = await getPool();
  if (!p) return demoStore.upsertIntelligence(row);
  const { rows } = await p.query<MarketIntelligenceRow>(
    `INSERT INTO intelligence_mcp.market_intelligence (
        material_key, material_label, snapshot_date,
        lme_price, lme_change_pct, fastmarkets_price, fastmarkets_label,
        matex_avg_price, matex_auction_count,
        trend, demand, recommendation,
        summary, reasoning, price_low, price_high, next_event,
        news_headlines, source
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT (material_key, snapshot_date) DO UPDATE SET
        material_label = EXCLUDED.material_label,
        lme_price = EXCLUDED.lme_price,
        lme_change_pct = EXCLUDED.lme_change_pct,
        fastmarkets_price = EXCLUDED.fastmarkets_price,
        fastmarkets_label = EXCLUDED.fastmarkets_label,
        matex_avg_price = EXCLUDED.matex_avg_price,
        matex_auction_count = EXCLUDED.matex_auction_count,
        trend = EXCLUDED.trend,
        demand = EXCLUDED.demand,
        recommendation = EXCLUDED.recommendation,
        summary = EXCLUDED.summary,
        reasoning = EXCLUDED.reasoning,
        price_low = EXCLUDED.price_low,
        price_high = EXCLUDED.price_high,
        next_event = EXCLUDED.next_event,
        news_headlines = EXCLUDED.news_headlines,
        source = EXCLUDED.source,
        updated_at = NOW()
     RETURNING *`,
    [
      row.material_key, row.material_label, row.snapshot_date,
      row.lme_price, row.lme_change_pct, row.fastmarkets_price, row.fastmarkets_label,
      row.matex_avg_price, row.matex_auction_count,
      row.trend, row.demand, row.recommendation,
      row.summary, row.reasoning, row.price_low, row.price_high, row.next_event,
      row.news_headlines, row.source,
    ],
  );
  return rows[0]!;
}

// ─── price_recommendations ────────────────────────────────────────────────

export async function insertPriceRecommendation(row: Omit<PriceRecommendationRow, "recommendation_id" | "created_at">): Promise<PriceRecommendationRow> {
  const p = await getPool();
  if (!p) return demoStore.insertPriceRecommendation(row);
  const { rows } = await p.query<PriceRecommendationRow>(
    `INSERT INTO intelligence_mcp.price_recommendations (
        listing_id, user_id, material_key, quantity, unit, seller_region,
        recommended_price, floor_price, ceiling_price, rationale, confidence,
        intelligence_id, source
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      row.listing_id, row.user_id, row.material_key, row.quantity, row.unit, row.seller_region,
      row.recommended_price, row.floor_price, row.ceiling_price, row.rationale, row.confidence,
      row.intelligence_id, row.source,
    ],
  );
  return rows[0]!;
}

// ─── listing_metrics ──────────────────────────────────────────────────────

export async function getListingMetrics(listingId: string): Promise<ListingMetricsRow | null> {
  const p = await getPool();
  if (!p) return demoStore.getListingMetrics(listingId);
  const { rows } = await p.query<ListingMetricsRow>(
    `SELECT * FROM intelligence_mcp.listing_metrics WHERE listing_id = $1`,
    [listingId],
  );
  return rows[0] ?? null;
}

export async function upsertListingMetrics(row: Omit<ListingMetricsRow, "updated_at">): Promise<ListingMetricsRow> {
  const p = await getPool();
  if (!p) return demoStore.upsertListingMetrics(row);
  const { rows } = await p.query<ListingMetricsRow>(
    `INSERT INTO intelligence_mcp.listing_metrics (
        listing_id, material_key, views_total, views_24h, views_change_pct,
        watchers, bid_count, current_top_bid, asking_price,
        benchmark_avg, benchmark_delta_pct, forecast_final, forecast_confidence,
        ai_status_label, ai_tip, last_event_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (listing_id) DO UPDATE SET
        material_key = EXCLUDED.material_key,
        views_total = EXCLUDED.views_total,
        views_24h = EXCLUDED.views_24h,
        views_change_pct = EXCLUDED.views_change_pct,
        watchers = EXCLUDED.watchers,
        bid_count = EXCLUDED.bid_count,
        current_top_bid = EXCLUDED.current_top_bid,
        asking_price = EXCLUDED.asking_price,
        benchmark_avg = EXCLUDED.benchmark_avg,
        benchmark_delta_pct = EXCLUDED.benchmark_delta_pct,
        forecast_final = EXCLUDED.forecast_final,
        forecast_confidence = EXCLUDED.forecast_confidence,
        ai_status_label = EXCLUDED.ai_status_label,
        ai_tip = EXCLUDED.ai_tip,
        last_event_at = EXCLUDED.last_event_at,
        updated_at = NOW()
     RETURNING *`,
    [
      row.listing_id, row.material_key, row.views_total, row.views_24h, row.views_change_pct,
      row.watchers, row.bid_count, row.current_top_bid, row.asking_price,
      row.benchmark_avg, row.benchmark_delta_pct, row.forecast_final, row.forecast_confidence,
      row.ai_status_label, row.ai_tip, row.last_event_at,
    ],
  );
  return rows[0]!;
}

// ─── price_alerts ─────────────────────────────────────────────────────────

export async function listAlertsForUser(userId: string): Promise<PriceAlertRow[]> {
  const p = await getPool();
  if (!p) return demoStore.listAlertsForUser(userId);
  const { rows } = await p.query<PriceAlertRow>(
    `SELECT * FROM intelligence_mcp.price_alerts
       WHERE user_id = $1 AND status <> 'archived'
       ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function listActiveAlertsForMaterial(materialKey: string): Promise<PriceAlertRow[]> {
  const p = await getPool();
  if (!p) return demoStore.listActiveAlertsForMaterial(materialKey);
  const { rows } = await p.query<PriceAlertRow>(
    `SELECT * FROM intelligence_mcp.price_alerts
       WHERE material_key = $1 AND status = 'active'`,
    [materialKey],
  );
  return rows;
}

export async function createAlert(input: CreateAlertInput): Promise<PriceAlertRow> {
  const p = await getPool();
  if (!p) return demoStore.createAlert(input);
  const { rows } = await p.query<PriceAlertRow>(
    `INSERT INTO intelligence_mcp.price_alerts (
       user_id, material_key, material_label, alert_type, threshold, region, channels, note
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      input.user_id, input.material_key, input.material_label, input.alert_type,
      input.threshold, input.region, input.channels, input.note,
    ],
  );
  return rows[0]!;
}

export async function updateAlertStatus(alertId: string, userId: string, status: PriceAlertStatus): Promise<PriceAlertRow | null> {
  const p = await getPool();
  if (!p) return demoStore.updateAlertStatus(alertId, userId, status);
  const { rows } = await p.query<PriceAlertRow>(
    `UPDATE intelligence_mcp.price_alerts
        SET status = $3::intelligence_mcp.alert_status, updated_at = NOW()
      WHERE alert_id = $1 AND user_id = $2
      RETURNING *`,
    [alertId, userId, status],
  );
  return rows[0] ?? null;
}

export async function deleteAlert(alertId: string, userId: string): Promise<boolean> {
  const p = await getPool();
  if (!p) return demoStore.deleteAlert(alertId, userId);
  const { rowCount } = await p.query(
    `DELETE FROM intelligence_mcp.price_alerts WHERE alert_id = $1 AND user_id = $2`,
    [alertId, userId],
  );
  return Boolean(rowCount && rowCount > 0);
}

export async function recordAlertDispatch(input: {
  alert_id: string;
  intelligence_id: string | null;
  channel: string;
  delivery_status: string;
  snapshot: Record<string, unknown>;
}): Promise<boolean> {
  const p = await getPool();
  if (!p) return demoStore.recordAlertDispatch(input);
  const res = await p.query(
    `INSERT INTO intelligence_mcp.alert_dispatches (alert_id, intelligence_id, channel, delivery_status, snapshot)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (alert_id, intelligence_id, channel) DO NOTHING`,
    [input.alert_id, input.intelligence_id, input.channel, input.delivery_status, JSON.stringify(input.snapshot)],
  );
  return Boolean(res.rowCount && res.rowCount > 0);
}

// ─── Matex auction aggregates (best-effort) ──────────────────────────────

export async function fetchMatexAuctionStats(materialKey: string): Promise<{
  avg_price: number | null;
  count: number;
  trend_series: number[];
}> {
  const p = await getPool();
  if (!p) return demoStore.matexStats(materialKey);
  // The listings.material column doesn't follow our material_key vocabulary,
  // so we match on category-name overlap. This stays best-effort: missing
  // matches simply yield zero counts and the pipeline falls back on stub
  // data. Production hardening would add a material_key column upstream.
  try {
    const { rows } = await p.query<{ final_price: number; closed_at: string }>(
      `SELECT bid.amount AS final_price, lst.updated_at AS closed_at
         FROM listing_mcp.listings lst
         JOIN bidding_mcp.bids bid ON bid.listing_id = lst.listing_id
        WHERE lst.status = 'sold'
          AND lst.title ILIKE $1
          AND lst.updated_at >= NOW() - INTERVAL '30 days'
        ORDER BY lst.updated_at DESC
        LIMIT 60`,
      [`%${materialKey.split("_")[0]}%`],
    );
    if (rows.length === 0) return demoStore.matexStats(materialKey);
    const prices = rows.map((r) => Number(r.final_price)).filter((n) => Number.isFinite(n));
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    return {
      avg_price: round(avg, 2),
      count: prices.length,
      trend_series: prices.slice(0, 12).reverse(),
    };
  } catch {
    return demoStore.matexStats(materialKey);
  }
}

function round(n: number, digits = 2): number {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
}
