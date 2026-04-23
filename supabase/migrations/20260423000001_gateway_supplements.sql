-- ============================================================================
-- MATEX — Gateway supplement migration
-- Adds columns and tables referenced by the MCP gateway but missing from the
-- initial schema: is_platform_admin, platform_config table, messaging indexes.
-- ============================================================================

-- is_platform_admin flag on users (used by admin tools and JWT claims)
ALTER TABLE auth_mcp.users
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Platform configuration key-value store (used by admin.list/update_platform_config)
CREATE TABLE IF NOT EXISTS log_mcp.platform_config (
    config_key      TEXT PRIMARY KEY,
    config_value    TEXT NOT NULL DEFAULT '',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure KYC level row exists for every user (created on first login)
-- This index speeds up the gateway's KYC gate check.
CREATE INDEX IF NOT EXISTS idx_kyc_levels_user_id ON kyc_mcp.kyc_levels (user_id);

-- Add read_at to messages for unread count tracking
ALTER TABLE messaging_mcp.messages
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Add last_message_at to threads (used by list_threads sort)
ALTER TABLE messaging_mcp.threads
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;

-- Notifications table (if not already created by main schema)
CREATE TABLE IF NOT EXISTS notifications_mcp.notifications (
    notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES auth_mcp.users(user_id) ON DELETE CASCADE,
    title           TEXT NOT NULL DEFAULT '',
    body            TEXT NOT NULL DEFAULT '',
    channel         notification_channel NOT NULL DEFAULT 'in_app',
    priority        notification_priority NOT NULL DEFAULT 'normal',
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications_mcp.notifications (user_id, created_at DESC);

-- Update login timestamp on auth
-- (gateway calls this after successful login)
CREATE OR REPLACE FUNCTION auth_mcp.touch_last_login(p_user_id UUID, p_ip TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE auth_mcp.users
  SET last_login_at = NOW(),
      last_login_ip = p_ip::INET,
      updated_at    = NOW()
  WHERE user_id = p_user_id;
END;
$$;

-- RLS policies for new tables
ALTER TABLE log_mcp.platform_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON log_mcp.platform_config
  USING (false); -- block all; gateway connects via service/superuser role

ALTER TABLE notifications_mcp.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications"
  ON notifications_mcp.notifications FOR SELECT
  USING (user_id = auth.uid());
