-- ============================================================================
-- MATEX — Add 'pending_capture' to transaction_status enum
-- Refs: docs/audit/2026-05-10/p0-1-stripe-elements-plan.md (PR 3 of 6)
--
-- Both packages/mcp-servers/payments-mcp/src/index.ts (process_payment,
-- create_payment_intent) and supabase/functions/payments/index.ts have been
-- writing status='pending_capture' on transaction inserts. The enum defined
-- in 20260423000000_initial_schema.sql:59 only contains
--   pending | processing | completed | failed | refunded | adjusted | cancelled
-- so every one of those inserts has been silently failing in production
-- against the real schema (the in-memory dev path masked the failure).
--
-- 'pending_capture' is the correct semantic for "PaymentIntent allocated,
-- waiting for confirmation/webhook". Adding it to the enum is the
-- minimum-blast-radius fix: code stays as-is, future inserts succeed,
-- existing rows (none, because every prior insert failed) are unaffected.
-- ============================================================================

ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'pending_capture';
