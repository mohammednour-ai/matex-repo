/**
 * Shared types for the intelligence pipeline. Mirrors `intelligence_mcp.*`
 * column shapes so DB rows can be returned to the frontend as-is.
 */

export type MarketTrend = "up" | "down" | "stable";
export type MarketDemand = "low" | "medium" | "high";
export type MarketRecommendation = "buy" | "hold" | "sell";

export type PriceAlertType = "price_below" | "price_above" | "trend_reversal" | "demand_change";
export type PriceAlertStatus = "active" | "paused" | "archived";

export type IntelligenceSource = "stub" | "live" | "manual";

export type MarketIntelligenceRow = {
  intelligence_id: string;
  material_key: string;
  material_label: string;
  snapshot_date: string;
  lme_price: number | null;
  lme_change_pct: number | null;
  fastmarkets_price: number | null;
  fastmarkets_label: string | null;
  matex_avg_price: number | null;
  matex_auction_count: number;
  trend: MarketTrend;
  demand: MarketDemand;
  recommendation: MarketRecommendation;
  summary: string | null;
  reasoning: string | null;
  price_low: number | null;
  price_high: number | null;
  next_event: string | null;
  news_headlines: string[];
  source: IntelligenceSource;
  created_at: string;
  updated_at: string;
};

export type ListingMetricsRow = {
  listing_id: string;
  material_key: string | null;
  views_total: number;
  views_24h: number;
  views_change_pct: number | null;
  watchers: number;
  bid_count: number;
  current_top_bid: number | null;
  asking_price: number | null;
  benchmark_avg: number | null;
  benchmark_delta_pct: number | null;
  forecast_final: number | null;
  forecast_confidence: number | null;
  ai_status_label: string | null;
  ai_tip: string | null;
  last_event_at: string | null;
  updated_at: string;
};

export type PriceAlertRow = {
  alert_id: string;
  user_id: string;
  material_key: string;
  material_label: string | null;
  alert_type: PriceAlertType;
  threshold: number | null;
  region: string | null;
  channels: string[];
  status: PriceAlertStatus;
  last_triggered_at: string | null;
  last_known_trend: MarketTrend | null;
  last_known_demand: MarketDemand | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type PriceRecommendationRow = {
  recommendation_id: string;
  listing_id: string | null;
  user_id: string | null;
  material_key: string;
  quantity: number | null;
  unit: string | null;
  seller_region: string | null;
  recommended_price: number;
  floor_price: number | null;
  ceiling_price: number | null;
  rationale: string | null;
  confidence: number | null;
  intelligence_id: string | null;
  source: IntelligenceSource;
  created_at: string;
};

export type AnalysisInput = {
  material_key: string;
  material_label: string;
  unit: "mt" | "lb";
  lme_price: number | null;
  lme_change_pct: number | null;
  fastmarkets_price: number | null;
  fastmarkets_label: string | null;
  matex_avg_price: number | null;
  matex_auction_count: number;
  matex_recent_trend: MarketTrend;
  news_headlines: string[];
};

export type AnalysisResult = {
  trend: MarketTrend;
  demand: MarketDemand;
  recommendation: MarketRecommendation;
  summary: string;
  reasoning: string;
  price_low: number;
  price_high: number;
  next_event: string;
};

export type RecommendationInput = {
  material_key: string;
  quantity: number | null;
  unit: string | null;
  seller_region: string | null;
  intelligence: MarketIntelligenceRow | null;
};

export type RecommendationResult = {
  recommended_price: number;
  floor_price: number;
  ceiling_price: number;
  rationale: string;
  confidence: number;
};

export type CreateAlertInput = {
  user_id: string;
  material_key: string;
  material_label: string | null;
  alert_type: PriceAlertType;
  threshold: number | null;
  region: string | null;
  channels: string[];
  note: string | null;
};
