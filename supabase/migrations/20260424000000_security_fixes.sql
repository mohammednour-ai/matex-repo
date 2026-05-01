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
