-- Event outbox for edge functions. Edge runtime can't hold a Redis connection,
-- so functions INSERT here and a Node relay worker (apps/event-relay) drains
-- onto Redis Streams via MatexEventBus. published_at = null means pending.
CREATE TABLE IF NOT EXISTS log_mcp.event_outbox (
  event_id     UUID PRIMARY KEY,
  source       TEXT NOT NULL,
  event        TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_outbox_pending
  ON log_mcp.event_outbox (created_at)
  WHERE published_at IS NULL;
