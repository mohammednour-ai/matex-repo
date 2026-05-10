-- ============================================================================
-- MATEX — Year-aware atomic invoice number generation
-- Refs: docs/audit/2026-05-10/report.md (P0-7), .cursor/rules/matex-canadian-compliance.mdc
--
-- The previous design (20260424000000_security_fixes.sql) created a single
-- global sequence `tax_mcp.invoice_seq` and a `public.next_invoice_seq()` RPC
-- wrapping `nextval()`. Two problems:
--
-- 1. Not year-aware. `MTX-YYYY-NNNNNN` per the canadian-compliance rule must
--    reset to 1 each January. A single sequence carries last year's numbers
--    forward, which is wrong on its face and ugly on invoices.
--
-- 2. The application code paired the RPC with a COUNT(*) fallback when the
--    RPC failed. The fallback is racy: two concurrent generations COUNT the
--    same value, both build `MTX-YYYY-(N+1)`, and one INSERT loses to the
--    UNIQUE(invoice_number) constraint with a 500.
--
-- This migration replaces both with a per-year counter table and a single
-- atomic upsert function. Concurrent callers serialise on the row lock that
-- `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` already takes, so no two
-- callers ever see the same `(year, last_seq)` pair.
-- ============================================================================

-- One row per calendar year. last_seq is the most recently issued sequence
-- for that year; the next caller increments it under a row lock.
CREATE TABLE IF NOT EXISTS tax_mcp.invoice_sequences (
  year       INT PRIMARY KEY CHECK (year >= 2024 AND year <= 2999),
  last_seq   BIGINT NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tax_mcp.invoice_sequences IS
  'Per-year monotonic counter backing public.next_invoice_number(). Resets each calendar year by virtue of using the year as the PK.';

-- Atomic year-aware allocator. Returns the fully formatted invoice number
-- (e.g. "MTX-2026-000001"), so callers never assemble the string themselves
-- and there is no opportunity for a client-side fallback to drift.
--
-- Concurrency model: the INSERT ... ON CONFLICT DO UPDATE RETURNING runs as
-- a single statement and acquires a row-level lock for the touched (year)
-- key. Concurrent callers therefore serialise on that key and each one
-- observes a distinct last_seq. No advisory locks or sequences required.
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, tax_mcp
AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM NOW())::INT;
  v_seq  BIGINT;
BEGIN
  INSERT INTO tax_mcp.invoice_sequences AS s (year, last_seq, updated_at)
    VALUES (v_year, 1, NOW())
  ON CONFLICT (year) DO UPDATE
    SET last_seq   = s.last_seq + 1,
        updated_at = NOW()
  RETURNING s.last_seq INTO v_seq;

  -- The schema constrains invoice_number to VARCHAR(20); MTX-YYYY-NNNNNN
  -- (16 chars) fits comfortably even at six-figure annual volume.
  RETURN format('MTX-%s-%s', v_year::text, lpad(v_seq::text, 6, '0'));
END;
$$;

COMMENT ON FUNCTION public.next_invoice_number() IS
  'Atomic year-aware MTX-YYYY-NNNNNN allocator backing tax.generate_invoice. Replaces public.next_invoice_seq() (dropped). See docs/audit/2026-05-10/report.md item P0-7.';

GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO authenticated, service_role;

-- Backfill the 2026 row from the highest existing 2026 invoice so the next
-- caller continues from the right number rather than restarting at 1 and
-- colliding with already-issued invoices. Idempotent — safe to run twice.
INSERT INTO tax_mcp.invoice_sequences (year, last_seq, updated_at)
SELECT
  EXTRACT(YEAR FROM NOW())::INT AS year,
  COALESCE(
    MAX((regexp_replace(invoice_number, '^MTX-\d{4}-', ''))::BIGINT),
    0
  ) AS last_seq,
  NOW()
FROM tax_mcp.invoices
WHERE invoice_number ~ ('^MTX-' || EXTRACT(YEAR FROM NOW())::INT || '-\d+$')
ON CONFLICT (year) DO UPDATE
  SET last_seq = GREATEST(tax_mcp.invoice_sequences.last_seq, EXCLUDED.last_seq);

-- Retire the old non-year-aware path. The new code in tax-mcp / tax edge
-- calls public.next_invoice_number() exclusively; keeping the old RPC alive
-- would be an attractive nuisance for any future caller.
DROP FUNCTION IF EXISTS public.next_invoice_seq();
DROP SEQUENCE IF EXISTS tax_mcp.invoice_seq;
