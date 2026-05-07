-- Track which auth_mcp.users rows have been synced to Supabase auth.users
-- so login can decide between Supabase signInWithPassword (real JWT) and the
-- legacy local-hash flow during the migration window.
ALTER TABLE auth_mcp.users
  ADD COLUMN IF NOT EXISTS supabase_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_auth_users_supabase_synced
  ON auth_mcp.users (supabase_synced_at) WHERE supabase_synced_at IS NULL;
