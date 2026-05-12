import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

// Per-checkpoint Sentry breadcrumb so a captured error elsewhere in the
// request lifetime gets a trail of "what Stripe was doing just before this".
// Category mirrors the mcp.<domain> convention used by callTool's helper.
function stripeBreadcrumb(message: string, data?: Record<string, unknown>, level: Sentry.SeverityLevel = "info"): void {
  try {
    Sentry.addBreadcrumb({ category: "stripe.webhook", message, level, data });
  } catch {
    /* Sentry not loaded — no-op. */
  }
}

/**
 * Stripe webhook endpoint.
 *
 * Reacts to payment_intent.* events from Stripe. Verifies the signature
 * with the Stripe SDK, then drives the durable transaction + escrow state
 * via a single Postgres transaction. The webhook is the source of truth
 * for whether money moved — the client-side stripe.confirmPayment result
 * is a hint that the UI can advance on, but the row in
 * payments_mcp.transactions is only transitioned to status='completed'
 * here.
 *
 * Idempotency: Stripe delivers each event at-least-once, and signs the
 * delivery with a stable event id. Our defence is at the DB layer: every
 * UPDATE has a `WHERE status NOT IN (completed,failed,cancelled)` guard,
 * so a replay against an already-terminal row is a no-op. The same guard
 * applies to escrow transitions.
 *
 * Refs:
 *  - docs/audit/2026-05-10/p0-1-stripe-elements-plan.md (PR 4 of 6)
 *  - .cursor/rules/matex-financial.mdc: escrow state machine
 *    (created → funds_held → released/refunded)
 */

type PaymentIntentEvent = {
  id: string;
  status?: string;
  amount?: number;
  amount_received?: number;
  metadata?: Record<string, string | undefined>;
  last_payment_error?: { code?: string; message?: string } | null;
};

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) {
    return NextResponse.json({ ok: false, error: "stripe_webhook_not_configured" }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey) {
    return NextResponse.json({ ok: false, error: "stripe_secret_missing" }, { status: 500 });
  }

  let event: { type: string; id: string; data: { object: PaymentIntentEvent } };
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);
    event = stripe.webhooks.constructEvent(rawBody, sig, secret) as unknown as typeof event;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "webhook_signature_invalid" },
      { status: 400 },
    );
  }

  // Events we don't handle are ack'd with 200 so Stripe doesn't retry them.
  // Currently: succeeded → completed; payment_failed → failed. Other events
  // (canceled, processing, requires_action) are observed via the UI / cron
  // reconciliation; recording them here would create a second source of
  // truth competing with the database.
  stripeBreadcrumb(`event ${event.type}`, { event_id: event.id, pi_id: event.data.object.id });

  if (event.type !== "payment_intent.succeeded" && event.type !== "payment_intent.payment_failed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "database_url_missing" }, { status: 500 });
  }

  const pi = event.data.object;
  const txId = pi.metadata?.transaction_id;
  if (!txId) {
    // No transaction_id means we can't correlate this back to a matex
    // transaction row. Ack so Stripe doesn't retry, but flag the body so
    // it's visible in webhook logs.
    return NextResponse.json({ received: true, warning: "missing_transaction_id_metadata" });
  }

  const pg = (await import("pg")).default;
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (event.type === "payment_intent.succeeded") {
      // Idempotent transition. RETURNING tells us whether this was a real
      // state change (rowCount=1) or a replay/late-arrival (rowCount=0).
      const txResult = await client.query(
        `UPDATE payments_mcp.transactions
           SET status = 'completed',
               completed_at = NOW(),
               updated_at = NOW(),
               stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $3),
               metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
         WHERE transaction_id = $1::uuid
           AND status NOT IN ('completed', 'failed', 'cancelled')
         RETURNING transaction_id, order_id, escrow_id, amount::text`,
        [
          txId,
          JSON.stringify({
            stripe_payment_intent_id: pi.id,
            stripe_event_id: event.id,
            webhook_at: new Date().toISOString(),
          }),
          pi.id,
        ],
      );

      // If 0 rows changed, the event has already been applied. Commit and
      // exit without retrying any downstream state — escrow transitions are
      // also idempotent below but we still want the early-out for clarity
      // (and so a replay doesn't write spurious escrow_timeline entries).
      if (txResult.rowCount === 0) {
        await client.query("COMMIT");
        return NextResponse.json({ received: true, idempotent: true });
      }

      const tx = txResult.rows[0] as { transaction_id: string; order_id: string | null; escrow_id: string | null; amount: string };
      const heldAmount = Number(tx.amount);

      // Find the escrow to transition. Prefer transactions.escrow_id if the
      // caller pre-allocated; otherwise fall back to the (order_id, status='created')
      // row, of which there is at most one (orders have a 1:1 escrow).
      // Either way the UPDATE itself is guarded against double-transition.
      const escrowResult = await client.query(
        `UPDATE escrow_mcp.escrows
           SET status = 'funds_held',
               held_amount = $2,
               stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $3),
               updated_at = NOW()
         WHERE status = 'created'
           AND (escrow_id = $1::uuid OR ($1 IS NULL AND order_id = $4::uuid))
         RETURNING escrow_id`,
        [tx.escrow_id, heldAmount, pi.id, tx.order_id],
      );

      if (escrowResult.rowCount === 1) {
        const escrowRow = escrowResult.rows[0] as { escrow_id: string };
        // Audit the transition. escrow_timeline rows are append-only by
        // convention; the (escrow_id, action='funds_held') pair will only
        // exist once per escrow because the UPDATE above is gated on the
        // 'created' state.
        await client.query(
          `INSERT INTO escrow_mcp.escrow_timeline (escrow_id, action, amount, performed_by, reason, metadata)
           VALUES ($1::uuid, 'funds_held', $2, NULL, 'stripe_webhook', $3::jsonb)`,
          [
            escrowRow.escrow_id,
            heldAmount,
            JSON.stringify({
              source: "stripe_webhook",
              stripe_payment_intent_id: pi.id,
              stripe_event_id: event.id,
              transaction_id: tx.transaction_id,
            }),
          ],
        );
      }
      // Note: rowCount === 0 here means either the escrow doesn't exist yet
      // (checkout flow allocates it AFTER confirmPayment — a race the client
      // usually wins because finalizeAfterPayment runs synchronously and
      // Stripe webhooks land 100–500ms later, but theoretically lossy) or
      // the escrow is already past 'created'. The first case is addressed by
      // a future fix to escrow.create_escrow that consults the linked
      // transaction's status on insert. We commit and let reconciliation
      // notice via the metadata.webhook_at on transactions if needed.
    } else if (event.type === "payment_intent.payment_failed") {
      // Same idempotency guard: only flip pending rows to failed.
      const err = pi.last_payment_error ?? {};
      await client.query(
        `UPDATE payments_mcp.transactions
           SET status = 'failed',
               updated_at = NOW(),
               stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $3),
               metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
         WHERE transaction_id = $1::uuid
           AND status NOT IN ('completed', 'failed', 'cancelled')`,
        [
          txId,
          JSON.stringify({
            stripe_payment_intent_id: pi.id,
            stripe_event_id: event.id,
            webhook_at: new Date().toISOString(),
            stripe_error: { code: err.code ?? null, message: err.message ?? null },
          }),
          pi.id,
        ],
      );
      // No escrow touch on failure — the escrow row, if any, stays in
      // 'created' until the user retries with a fresh PI (which will hit
      // the succeeded path) or admin cancels it.
    }

    await client.query("COMMIT");
    stripeBreadcrumb(`${event.type} applied`, { event_id: event.id, transaction_id: txId });
    return NextResponse.json({ received: true });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already broken; nothing to roll back */
    }
    stripeBreadcrumb(
      `${event.type} rollback`,
      { event_id: event.id, transaction_id: txId, error: e instanceof Error ? e.message : String(e) },
      "error",
    );
    // 5xx so Stripe retries with backoff. Webhook delivery has at-least-once
    // semantics; a failed apply is recoverable on the next attempt.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "webhook_error" },
      { status: 500 },
    );
  } finally {
    client.release();
    await pool.end();
  }
}
