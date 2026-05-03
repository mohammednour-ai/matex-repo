-- ============================================================================
-- MATEX INTELLIGENCE — Market analytics, price recommendations & alerts
-- ============================================================================
-- Adds the storage layer for the AI-driven market intelligence features:
--
--   * intelligence_mcp.market_intelligence    one row per (material, snapshot_date)
--   * intelligence_mcp.price_recommendations  cached AI price suggestions for sellers
--   * intelligence_mcp.listing_metrics        per-listing engagement aggregates
--   * intelligence_mcp.price_alerts           buyer-defined notification triggers
--   * intelligence_mcp.alert_dispatches       audit log of fired alerts (idempotency)
--
-- Pipeline overview:
--   Daily Inngest job populates `market_intelligence` from external feeds
--   (LME / Fastmarkets / news API — currently stubbed) plus our own auction
--   aggregates, then evaluates `price_alerts` and writes `alert_dispatches`.
--   Listing creation flow caches recommendations in `price_recommendations`.
--   Per-listing view/watch/bid counters land in `listing_metrics`.
--
-- All tables are additive; nothing references them with FK from earlier
-- schemas, so this migration is safe to apply on populated databases.

CREATE SCHEMA IF NOT EXISTS intelligence_mcp;

-- ─── ENUMS ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE intelligence_mcp.market_trend AS ENUM ('up', 'down', 'stable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE intelligence_mcp.market_demand AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE intelligence_mcp.market_recommendation AS ENUM ('buy', 'hold', 'sell');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE intelligence_mcp.alert_type AS ENUM (
    'price_below',
    'price_above',
    'trend_reversal',
    'demand_change'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE intelligence_mcp.alert_status AS ENUM ('active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── TABLES ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS intelligence_mcp.market_intelligence (
    intelligence_id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    material_key       VARCHAR(64)  NOT NULL,
    material_label     VARCHAR(160) NOT NULL,
    snapshot_date      DATE         NOT NULL,
    -- Reference prices (CAD/mt unless otherwise noted on the material).
    lme_price          NUMERIC(12,2),
    lme_change_pct     NUMERIC(6,2),
    fastmarkets_price  NUMERIC(12,2),
    fastmarkets_label  VARCHAR(120),
    matex_avg_price    NUMERIC(12,2),
    matex_auction_count INTEGER     NOT NULL DEFAULT 0,
    -- AI-derived signals.
    trend              intelligence_mcp.market_trend         NOT NULL DEFAULT 'stable',
    demand             intelligence_mcp.market_demand        NOT NULL DEFAULT 'medium',
    recommendation     intelligence_mcp.market_recommendation NOT NULL DEFAULT 'hold',
    summary            TEXT,
    reasoning          TEXT,
    price_low          NUMERIC(12,2),
    price_high         NUMERIC(12,2),
    next_event         TEXT,
    news_headlines     TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    raw                JSONB        NOT NULL DEFAULT '{}'::jsonb,
    source             VARCHAR(32)  NOT NULL DEFAULT 'stub', -- 'stub' | 'live' | 'manual'
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (material_key, snapshot_date)
);

CREATE INDEX IF NOT EXISTS market_intelligence_material_recent_idx
    ON intelligence_mcp.market_intelligence (material_key, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS intelligence_mcp.price_recommendations (
    recommendation_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id         UUID,
    user_id            UUID,
    material_key       VARCHAR(64)  NOT NULL,
    quantity           NUMERIC(14,3),
    unit               VARCHAR(16),
    seller_region      VARCHAR(120),
    recommended_price  NUMERIC(12,2) NOT NULL,
    floor_price        NUMERIC(12,2),
    ceiling_price      NUMERIC(12,2),
    rationale          TEXT,
    confidence         NUMERIC(4,3),               -- 0..1
    intelligence_id    UUID REFERENCES intelligence_mcp.market_intelligence(intelligence_id) ON DELETE SET NULL,
    source             VARCHAR(32)  NOT NULL DEFAULT 'stub',
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_recommendations_listing_idx
    ON intelligence_mcp.price_recommendations (listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS price_recommendations_user_idx
    ON intelligence_mcp.price_recommendations (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS intelligence_mcp.listing_metrics (
    listing_id         UUID PRIMARY KEY,
    material_key       VARCHAR(64),
    views_total        INTEGER NOT NULL DEFAULT 0,
    views_24h          INTEGER NOT NULL DEFAULT 0,
    views_change_pct   NUMERIC(6,2),
    watchers           INTEGER NOT NULL DEFAULT 0,
    bid_count          INTEGER NOT NULL DEFAULT 0,
    current_top_bid    NUMERIC(12,2),
    asking_price       NUMERIC(12,2),
    benchmark_avg      NUMERIC(12,2),
    benchmark_delta_pct NUMERIC(6,2),
    forecast_final     NUMERIC(12,2),
    forecast_confidence NUMERIC(4,3),
    ai_status_label    VARCHAR(80),                 -- e.g. "Slightly premium"
    ai_tip             TEXT,
    last_event_at      TIMESTAMPTZ,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intelligence_mcp.price_alerts (
    alert_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID NOT NULL,
    material_key       VARCHAR(64) NOT NULL,
    material_label     VARCHAR(160),
    alert_type         intelligence_mcp.alert_type NOT NULL,
    threshold          NUMERIC(12,2),
    region             VARCHAR(120),
    channels           TEXT[] NOT NULL DEFAULT ARRAY['in_app']::TEXT[],
    status             intelligence_mcp.alert_status NOT NULL DEFAULT 'active',
    last_triggered_at  TIMESTAMPTZ,
    last_known_trend   intelligence_mcp.market_trend,
    last_known_demand  intelligence_mcp.market_demand,
    note               TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS price_alerts_user_idx
    ON intelligence_mcp.price_alerts (user_id, status);
CREATE INDEX IF NOT EXISTS price_alerts_material_idx
    ON intelligence_mcp.price_alerts (material_key, status);

CREATE TABLE IF NOT EXISTS intelligence_mcp.alert_dispatches (
    dispatch_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id           UUID NOT NULL REFERENCES intelligence_mcp.price_alerts(alert_id) ON DELETE CASCADE,
    intelligence_id    UUID REFERENCES intelligence_mcp.market_intelligence(intelligence_id) ON DELETE SET NULL,
    triggered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    snapshot           JSONB NOT NULL DEFAULT '{}'::jsonb,
    channel            VARCHAR(32) NOT NULL,
    delivery_status    VARCHAR(32) NOT NULL DEFAULT 'queued', -- queued | sent | failed | suppressed
    UNIQUE (alert_id, intelligence_id, channel)
);

CREATE INDEX IF NOT EXISTS alert_dispatches_alert_idx
    ON intelligence_mcp.alert_dispatches (alert_id, triggered_at DESC);

-- ─── COMMENTS ─────────────────────────────────────────────────────────────
COMMENT ON SCHEMA intelligence_mcp
  IS 'AI market intelligence: daily snapshots, price recs, listing metrics & alerts.';
COMMENT ON TABLE intelligence_mcp.market_intelligence
  IS 'Daily AI-analysed market snapshot per material. Source col indicates stub vs live data feed.';
COMMENT ON TABLE intelligence_mcp.price_recommendations
  IS 'Cached AI price suggestions surfaced when a seller drafts a listing.';
COMMENT ON TABLE intelligence_mcp.listing_metrics
  IS 'Aggregated per-listing engagement signals refreshed by the analytics pipeline.';
COMMENT ON TABLE intelligence_mcp.price_alerts
  IS 'Buyer-defined alerts. Evaluated by the daily pipeline and any real-time hooks.';
COMMENT ON TABLE intelligence_mcp.alert_dispatches
  IS 'Audit log + idempotency guard for alert notifications.';
