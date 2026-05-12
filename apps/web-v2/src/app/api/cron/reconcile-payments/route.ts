import { NextRequest, NextResponse } from "next/server";
import type { Pool } from "pg";
import * as Sentry from "@sentry/nextjs";

function cronBreadcrumb(message: string, data?: Record<string, unknown>, level: Sentry.SeverityLevel = "info"): void {
  try {
    Sentry.addBreadcrumb({ category: "stripe.reconcile", message, level, data });
  } catch {
    /* Sentry not loaded — no-op. */
  }
}

/**
 * Stripe payment reconciliation cron.
 *
 * Scheduled via apps/web-v2/vercel.json. Walks payments_mcp.transactions
 * for rows that have a stripe_payment_intent_id but are still in
 * pending_capture more than RECONCILE_AFTER_MINUTES after creation, queries
 * Stripe for the actual PI status, and applies the same DB transition the
 * webhook would have. This catches:
 *
 *  - Lost webhooks (Stripe couldn't reach us, or we 5xx'd past retries).
 *  - Abandoned card flows where the buyer collected card details, never
 *    confirmed, and the PI eventually auto-cancelled.
 *  - Network partitions where the client saw "succeeded" but the webhook
 *    never landed.
 *
 * Idempotency: same UPDATE-where-status-not-terminal guards as the webhook
 * (apps/web-v2/src/app/api/stripe/webhook/route.ts). A row that was already
 * settled by a webhook between SELECT and UPDATE simply produces rowCount=0
 * and is counted as `already_settled`.
 *
 * Auth: requires Authorization: Bearer ${CRON_SECRET}. Vercel cron passes
 * this automatically when configured per
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
 * For manual ops triggers (curl), the same header works.
 *
 * Refs: docs/audit/2026-05-10/p0-1-stripe-elements-plan.md (PR 6 of 6).
 */

const RECONCILE_AFTER_MINUTES = 15;
const BATCH_LIMIT = 50;

type PendingTransactionRow = {
  transaction_id: string;
  stripe_payment_intent_id: string;
  order_id: string | null;
  escrow_id: string | null;
  amount: string;
};

type StripePaymentIntent = {
  id: string;
  status: string;
  last_payment_error?: { code?: string; message?: string } | null;
};

type ReconcileSummary = {
  scanned: number;
  succeeded: number;
  failed: number;
  still_pending: number;
  already_settled: number;
  errors: number;
  // P1-13b: after reconciliation lands a previously-stuck transaction we
  // also check whether tax.generate_invoice ran on the original client-side
  // checkout. The cron can't re-invoke the tool directly (seller_province /
  // buyer_province aren't on the transaction or orders rows), so we log a
  // missing-invoice signal that ops can sweep for manual backfill.
  invoice_missing: number;
  invoice_already_present: number;
};

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 500 });
  }
  // Accept either `Authorization: Bearer …` (manual / ops invocation) or
  // the `x-vercel-cron` header Vercel attaches to scheduled invocations
  // when CRON_SECRET is set as a "Vercel-managed" secret.
  const auth = req.headers.get("authorization") ?? "";
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const tokenMatches = auth === `Bearer ${cronSecret}`;
  if (!tokenMatches && !isVercelCron) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey) {
    return NextResponse.json({ ok: false, error: "stripe_secret_missing" }, { status: 500 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false, error: "database_url_missing" }, { status: 500 });
  }

  const summary: ReconcileSummary = {
    scanned: 0,
    succeeded: 0,
    failed: 0,
    still_pending: 0,
    already_settled: 0,
    errors: 0,
    invoice_missing: 0,
    invoice_already_present: 0,
  };

  const pg = (await import("pg")).default;
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  try {
    const stale = await pool.query(
      `SELECT transaction_id, stripe_payment_intent_id, order_id, escrow_id, amount::text
         FROM payments_mcp.transactions
        WHERE payment_method = 'stripe_card'
          AND status = 'pending_capture'
          AND stripe_payment_intent_id IS NOT NULL
          AND created_at < NOW() - ($1::text || ' minutes')::interval
        ORDER BY created_at ASC
        LIMIT ${BATCH_LIMIT}`,
      [String(RECONCILE_AFTER_MINUTES)],
    );

    summary.scanned = stale.rows.length;
    cronBreadcrumb("scan", { scanned: summary.scanned, batch_limit: BATCH_LIMIT });

    for (const raw of stale.rows) {
      const row = raw as PendingTransactionRow;
      try {
        const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${row.stripe_payment_intent_id}`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${stripeKey}`,
            "stripe-version": "2024-11-20.acacia",
          },
        });
        if (!piRes.ok) {
          summary.errors += 1;
          continue;
        }
        const pi = (await piRes.json()) as StripePaymentIntent;

        if (pi.status === "succeeded") {
          await applySucceeded(pool, row, pi, summary);
        } else if (
          pi.status === "canceled" ||
          pi.status === "requires_payment_method" ||
          pi.status === "payment_failed"
        ) {
          await applyFailed(pool, row, pi, summary);
        } else {
          // requires_action / requires_confirmation / processing — still
          // in flight. Don't touch the row; another cron tick will pick it
          // up if it stalls.
          summary.still_pending += 1;
        }
      } catch {
        summary.errors += 1;
      }
    }

    cronBreadcrumb("done", { ...summary }, summary.errors > 0 ? "warning" : "info");
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    cronBreadcrumb(
      "fatal",
      { error: e instanceof Error ? e.message : String(e) },
      "error",
    );
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "reconcile_error" },
      { status: 500 },
    );
  } finally {
    await pool.end();
  }
}

/**
 * Apply the same transition the succeeded webhook would have applied,
 * inside its own atomic transaction. Uses the same status-guards so a
 * webhook landing concurrently with the cron tick will not double-apply.
 */
async function applySucceeded(
  pool: Pool,
  row: PendingTransactionRow,
  pi: StripePaymentIntent,
  summary: ReconcileSummary,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const txResult = await client.query(
      `UPDATE payments_mcp.transactions
         SET status = 'completed',
             completed_at = NOW(),
             updated_at = NOW(),
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE transaction_id = $1::uuid
         AND status NOT IN ('completed', 'failed', 'cancelled')`,
      [
        row.transaction_id,
        JSON.stringify({
          reconciled_at: new Date().toISOString(),
          reconciled_source: "cron",
          stripe_status_at_reconcile: pi.status,
        }),
      ],
    );
    if (txResult.rowCount === 0) {
      await client.query("COMMIT");
      summary.already_settled += 1;
      return;
    }

    const heldAmount = Number(row.amount);
    const escrowResult = await client.query(
      `UPDATE escrow_mcp.escrows
         SET status = 'funds_held',
             held_amount = $2,
             stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, $3),
             updated_at = NOW()
       WHERE status = 'created'
         AND (escrow_id = $1::uuid OR ($1 IS NULL AND order_id = $4::uuid))
       RETURNING escrow_id`,
      [row.escrow_id, heldAmount, pi.id, row.order_id],
    );

    if (escrowResult.rowCount === 1) {
      const escrowRow = escrowResult.rows[0] as { escrow_id: string };
      await client.query(
        `INSERT INTO escrow_mcp.escrow_timeline (escrow_id, action, amount, performed_by, reason, metadata)
         VALUES ($1::uuid, 'funds_held', $2, NULL, 'reconciliation_cron', $3::jsonb)`,
        [
          escrowRow.escrow_id,
          heldAmount,
          JSON.stringify({
            source: "reconcile_cron",
            stripe_payment_intent_id: pi.id,
            transaction_id: row.transaction_id,
          }),
        ],
      );
    }

    await client.query("COMMIT");
    summary.succeeded += 1;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* connection dead */ }
    summary.errors += 1;
    throw e;
  } finally {
    client.release();
  }

  // Post-commit invoice sweep. tax.generate_invoice is normally called from
  // /checkout right after Stripe confirms; if the page crashed or the user
  // closed the tab before that ran, the order is paid but uninvoiced. The
  // cron can't reissue here (generate_invoice needs seller/buyer provinces
  // that don't live on transactions or orders), so we record a structured
  // missing-invoice event ops can sweep on.
  if (row.order_id) {
    try {
      const invRes = await pool.query(
        `SELECT 1 FROM tax_mcp.invoices WHERE order_id = $1::uuid LIMIT 1`,
        [row.order_id],
      );
      if (invRes.rowCount === 0) {
        summary.invoice_missing += 1;
        console.warn(
          "[reconcile-payments] invoice_missing_after_reconcile",
          JSON.stringify({
            transaction_id: row.transaction_id,
            order_id: row.order_id,
            stripe_payment_intent_id: pi.id,
          }),
        );
      } else {
        summary.invoice_already_present += 1;
      }
    } catch {
      // Non-fatal — invoice check is observational only.
    }
  }
}

/**
 * Apply the same transition the payment_failed webhook would have applied.
 * No escrow touch — if an escrow exists in 'created' it stays there until
 * the buyer retries or admin cancels it.
 */
async function applyFailed(
  pool: Pool,
  row: PendingTransactionRow,
  pi: StripePaymentIntent,
  summary: ReconcileSummary,
): Promise<void> {
  const err = pi.last_payment_error ?? {};
  const result = await pool.query(
    `UPDATE payments_mcp.transactions
       SET status = 'failed',
           updated_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
     WHERE transaction_id = $1::uuid
       AND status NOT IN ('completed', 'failed', 'cancelled')`,
    [
      row.transaction_id,
      JSON.stringify({
        reconciled_at: new Date().toISOString(),
        reconciled_source: "cron",
        stripe_status_at_reconcile: pi.status,
        stripe_error: { code: err.code ?? null, message: err.message ?? null },
      }),
    ],
  );
  if (result.rowCount === 0) {
    summary.already_settled += 1;
  } else {
    summary.failed += 1;
  }
}
