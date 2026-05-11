-- ============================================================================
-- MATEX — listing flags table
--
-- Backs the new listing.flag_listing tool (P1-4). The /listings/[id] Report
-- button previously had no handler — clicks did nothing. With this table
-- and the new tool, users can flag a listing for moderator review and the
-- platform has a durable record (reporter, reason, notes, status).
--
-- Status lifecycle:
--   pending   — flag just submitted, awaiting moderator review (default)
--   reviewed  — moderator looked at it and took action (e.g. archived the
--               listing, contacted the seller)
--   dismissed — moderator reviewed and judged it not actionable
--
-- Reason values map to the dropdown the buyer sees on /listings/[id]. We
-- keep them as a CHECK constraint rather than a Postgres ENUM so new
-- reasons can be added without an ALTER TYPE migration (the audit's
-- canadian-compliance.mdc rule reserves ENUMs for the financial state
-- machines).
-- ============================================================================

CREATE TABLE IF NOT EXISTS listing_mcp.listing_flags (
  flag_id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id   UUID NOT NULL REFERENCES listing_mcp.listings(listing_id) ON DELETE CASCADE,
  reporter_id  UUID NOT NULL REFERENCES auth_mcp.users(user_id),
  reason       TEXT NOT NULL CHECK (reason IN (
    'inappropriate',
    'duplicate',
    'misleading',
    'spam',
    'illegal_material',
    'other'
  )),
  notes        TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  resolved_by  UUID REFERENCES auth_mcp.users(user_id),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_flags_listing ON listing_mcp.listing_flags(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_flags_status  ON listing_mcp.listing_flags(status);
CREATE INDEX IF NOT EXISTS idx_listing_flags_reporter ON listing_mcp.listing_flags(reporter_id);

COMMENT ON TABLE listing_mcp.listing_flags IS
  'User-submitted reports against listings. Inserts come from listing.flag_listing; moderator review happens in admin tooling (separate UI work).';
