-- ============================================================================
-- MATEX — Atomic wallet debit RPC for payments.process_payment
--
-- payments_mcp.process_payment used to write every transaction with
-- status='pending_capture' regardless of payment method. The Stripe
-- webhook only handles card transactions, so wallet / credit / interac
-- rows were stranded in pending_capture forever — silent correctness
-- bug at the same severity as P0-1 but never on that list.
--
-- This migration adds the primitive process_payment needs to settle
-- wallet payments atomically: deduct the buyer's wallet balance with a
-- balance-sufficient guard, in a single SQL statement so concurrent
-- calls can't double-spend. Returns the new balance on success or NULL
-- when the wallet either doesn't exist or has insufficient funds —
-- callers branch on NULL to surface INSUFFICIENT_BALANCE.
--
-- The wallets.balance CHECK constraint (>= 0) is a backstop, but the
-- WHERE guard gives us a clean rowCount-derived signal without relying
-- on raising an exception, which is friendlier from JS clients.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.debit_wallet(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, payments_mcp
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'debit amount must be > 0';
  END IF;

  UPDATE payments_mcp.wallets
     SET balance = balance - p_amount,
         updated_at = NOW()
   WHERE user_id = p_user_id
     AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  -- v_new_balance is NULL if either:
  --   1. The user has no wallet row (no UPDATE matched user_id).
  --   2. The user has a wallet but balance < p_amount.
  -- In both cases the caller should treat as INSUFFICIENT_BALANCE.
  RETURN v_new_balance;
END;
$$;

COMMENT ON FUNCTION public.debit_wallet(UUID, NUMERIC) IS
  'Atomic wallet debit. Returns new balance on success, NULL on insufficient funds or missing wallet. Backs payments.process_payment for the wallet payment method.';

GRANT EXECUTE ON FUNCTION public.debit_wallet(UUID, NUMERIC) TO authenticated, service_role;
