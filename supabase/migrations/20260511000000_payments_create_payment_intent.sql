-- ============================================================================
-- MATEX — payments.create_payment_intent supporting indexes
-- Refs: docs/audit/2026-05-10/p0-1-stripe-elements-plan.md (PR 2 of 6)
--
-- The transactions table already has stripe_payment_intent_id (added in
-- 20260423000000_initial_schema.sql:730). What's missing is an index for
-- ops queries / future webhook fallback lookups.
--
-- The webhook route currently looks up by transaction_id (the row's PK,
-- carried in pi.metadata.transaction_id) so the PK index is sufficient
-- for the happy path. This index supports:
--   1. Reverse lookup during reconciliation jobs ("which of our pendings
--      matches this Stripe PI?").
--   2. Constraint-style guarantee that we never have two transaction
--      rows pointing at the same Stripe PaymentIntent — a defence in
--      depth against duplicate POSTs to create_payment_intent.
--
-- UNIQUE WHERE NOT NULL is a partial unique index, so legitimate NULLs
-- (transactions that haven't reached PI allocation yet, e.g. wallet
-- payments) don't collide with each other.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_stripe_pi
  ON payments_mcp.transactions (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

COMMENT ON INDEX payments_mcp.idx_transactions_stripe_pi IS
  'Partial UNIQUE index on stripe_payment_intent_id. Backs payments.create_payment_intent reconciliation and webhook fallback lookups; forbids two transactions pointing at the same Stripe PI. See docs/audit/2026-05-10/p0-1-stripe-elements-plan.md.';
