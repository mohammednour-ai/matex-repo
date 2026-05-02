-- ============================================================================
-- MATEX — Security fixes migration
-- Adds invoice sequence, CRA fields, and other schema changes required by
-- the security audit fixes.
-- ============================================================================

-- Invoice sequence for collision-free MTX-YYYY-NNNNNN numbering.
CREATE SEQUENCE IF NOT EXISTS tax_mcp.invoice_seq START 1;

-- RPC wrapper so Supabase JS client can call nextval via .rpc("next_invoice_seq").
CREATE OR REPLACE FUNCTION next_invoice_seq()
RETURNS BIGINT
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT nextval('tax_mcp.invoice_seq');
$$;

-- CRA-required fields on tax invoices.
ALTER TABLE tax_mcp.invoices
  ADD COLUMN IF NOT EXISTS business_number  TEXT,
  ADD COLUMN IF NOT EXISTS issue_date       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_date         TIMESTAMPTZ;

-- Terms hash on contracts for tamper evidence.
ALTER TABLE contracts_mcp.contracts
  ADD COLUMN IF NOT EXISTS terms_hash TEXT;

-- Resolution deadline on disputes for SLA enforcement.
ALTER TABLE dispute_mcp.disputes
  ADD COLUMN IF NOT EXISTS resolution_deadline TIMESTAMPTZ;

-- Signature hash columns on esign documents (stored inside signatories JSONB — no DDL needed).

-- Optimistic-lock helpers: ensure escrows table has the columns referenced by hold/release.
ALTER TABLE escrow_mcp.escrows
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(15,2);

-- Ensure kyc_levels.current_level has a NOT NULL default so the downgrade check works.
ALTER TABLE kyc_mcp.kyc_levels
  ALTER COLUMN current_level SET DEFAULT 'level_0';

-- KYC review status column for check_kyc_expiry tool.
ALTER TABLE kyc_mcp.kyc_levels
  ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'active';

-- Contract negotiations: 7-day proposal expiry.
ALTER TABLE contracts_mcp.negotiations
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- PEP screenings: change result column to use constrained values.
-- Using a CHECK constraint instead of ENUM to avoid type migration complexity.
ALTER TABLE kyc_mcp.pep_screenings
  ADD CONSTRAINT IF NOT EXISTS pep_result_values
  CHECK (result IN ('clear', 'hit', 'pending_review', 'false_positive'));

-- Platform config table for runtime-configurable values (commission rate etc.).
CREATE TABLE IF NOT EXISTS log_mcp.platform_config (
  config_key   TEXT PRIMARY KEY,
  config_value TEXT NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the default commission rate so payments-mcp can read it.
INSERT INTO log_mcp.platform_config (config_key, config_value)
VALUES ('commission_rate', '0.035')
ON CONFLICT (config_key) DO NOTHING;

-- Profile search vector: update tsvector when bio or display_name changes.
CREATE OR REPLACE FUNCTION profile_mcp.update_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english',
      coalesce(NEW.display_name, '') || ' ' ||
      coalesce(NEW.bio, '') || ' ' ||
      coalesce(NEW.company_name, '')
    );
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_profile_search_vector'
      AND tgrelid = 'profile_mcp.profiles'::regclass
  ) THEN
    CREATE TRIGGER trg_profile_search_vector
    BEFORE INSERT OR UPDATE OF display_name, bio, company_name
    ON profile_mcp.profiles
    FOR EACH ROW EXECUTE FUNCTION profile_mcp.update_search_vector();
  END IF;
END;
$$;
