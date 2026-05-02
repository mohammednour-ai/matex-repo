import { NextRequest, NextResponse } from "next/server";

/**
 * Stripe webhook endpoint. When STRIPE_WEBHOOK_SECRET is set, verify signatures
 * with the Stripe SDK in production and mark `payments_mcp.transactions` from
 * `payment_intent.succeeded` events. Without secrets, returns 400 so endpoints
 * are not accidentally left open.
 */
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

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);
    const event = stripe.webhooks.constructEvent(rawBody, sig, secret);
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as { id: string; metadata?: { transaction_id?: string } };
      const txId = pi.metadata?.transaction_id;
      if (txId && process.env.DATABASE_URL) {
        const pg = (await import("pg")).default;
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 1 });
        try {
          await pool.query(
            `update payments_mcp.transactions set status = 'completed', metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb where transaction_id = $1::uuid`,
            [txId, JSON.stringify({ stripe_payment_intent_id: pi.id, webhook_at: new Date().toISOString() })],
          );
        } finally {
          await pool.end();
        }
      }
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "webhook_error" },
      { status: 400 },
    );
  }
}
