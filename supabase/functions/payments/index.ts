// Payments domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/payments-mcp/src/index.ts (DB branches).
// In-memory fallbacks dropped — DB is source of truth.

import {
  calculateCommission,
  failEnvelope,
  generateId,
  now,
  okEnvelope,
  roundToTwoDecimals,
} from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { isPlatformAdmin } from "../_shared/auth.ts";
import { emitEvent } from "../_shared/events.ts";
import { getPlatformConfigNumber } from "../_shared/config.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "payments-edge";
const DEFAULT_COMMISSION_RATE = 0.035;
const DEFAULT_HST_RATE = 0.13;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
// Pinned to keep PaymentIntent state-machine semantics stable across Stripe
// dashboard upgrades. Bump deliberately when validating against newer
// Stripe behaviour. Refs: docs/audit/2026-05-10/p0-1-stripe-elements-plan.md §6.
const STRIPE_API_VERSION = "2024-11-20.acacia";

type Mutating = "top_up_wallet" | "manage_payment_methods" | "process_payment" | "create_payment_intent";
const MUTATING: Set<Mutating> = new Set(["top_up_wallet", "manage_payment_methods", "process_payment", "create_payment_intent"]);

/**
 * Direct Stripe PaymentIntent creation. Mirrors the same function in
 * packages/mcp-servers/payments-mcp/src/index.ts so both transports have
 * identical wire behaviour. The Deno runtime can't import the Node-only
 * stripe-bridge, so the call lives here instead. Refs: plan §4.
 */
async function stripeCreatePaymentIntent(input: {
  amountCents: number;
  currency: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}): Promise<
  | { ok: true; payment_intent_id: string; client_secret: string; status: string }
  | { ok: false; code: string; message: string }
> {
  if (!STRIPE_SECRET_KEY) {
    const stubId = `pi_stub_${Date.now()}`;
    return {
      ok: true,
      payment_intent_id: stubId,
      client_secret: `${stubId}_secret_stub`,
      status: "requires_confirmation",
    };
  }
  const params = new URLSearchParams();
  params.set("amount", String(input.amountCents));
  params.set("currency", input.currency);
  params.set("automatic_payment_methods[enabled]", "true");
  for (const [k, v] of Object.entries(input.metadata)) {
    if (v == null) continue;
    params.set(`metadata[${k}]`, String(v));
  }
  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": STRIPE_API_VERSION,
      "idempotency-key": input.idempotencyKey,
    },
    body: params.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || json.error) {
    const err = (json.error ?? {}) as Record<string, unknown>;
    return {
      ok: false,
      code: String(err.code ?? "STRIPE_ERROR"),
      message: String(err.message ?? "Stripe rejected the request"),
    };
  }
  return {
    ok: true,
    payment_intent_id: String(json.id),
    client_secret: String(json.client_secret),
    status: String(json.status ?? "requires_confirmation"),
  };
}

async function authorize(
  tool: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; userId: string } | { ok: false; envelope: ReturnType<typeof failEnvelope> }> {
  const supabase = serviceClient();
  const actorId = String(args.actor_id ?? "");
  const userId = String(args.user_id ?? "");
  if (!actorId) return { ok: false, envelope: failEnvelope("VALIDATION_ERROR", "actor_id is required.") };
  if (!userId) return { ok: false, envelope: failEnvelope("VALIDATION_ERROR", "user_id is required.") };
  if (actorId === userId) return { ok: true, userId };
  if (MUTATING.has(tool as Mutating)) {
    return { ok: false, envelope: failEnvelope("FORBIDDEN", "actor_id must match user_id for this operation.") };
  }
  const admin = await isPlatformAdmin(supabase, actorId);
  if (!admin) {
    return {
      ok: false,
      envelope: failEnvelope("FORBIDDEN", "actor_id must match user_id (or actor must be a platform admin)."),
    };
  }
  return { ok: true, userId };
}

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function getWalletBalance({ args }: ToolRequest) {
  const auth = await authorize("get_wallet_balance", args);
  if (!auth.ok) return auth.envelope;
  const supabase = serviceClient();
  const { data, error } = await supabase
    .schema("payments_mcp")
    .from("wallets")
    .select("user_id,balance,pending_balance")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  const wallet = data ?? { user_id: auth.userId, balance: 0, pending_balance: 0 };
  return okEnvelope({ wallet });
}

async function topUpWallet({ args }: ToolRequest) {
  const auth = await authorize("top_up_wallet", args);
  if (!auth.ok) return auth.envelope;
  const userId = auth.userId;
  const amount = Number(args.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return failEnvelope("VALIDATION_ERROR", "amount must be greater than 0.");
  }
  const supabase = serviceClient();
  const { data: existing } = await supabase
    .schema("payments_mcp")
    .from("wallets")
    .select("wallet_id,balance,pending_balance")
    .eq("user_id", userId)
    .maybeSingle();

  const nextBalance = roundToTwoDecimals(Number(existing?.balance ?? 0) + amount);
  const transactionId = generateId();
  const createdAt = now();

  const { error: txError } = await supabase.schema("payments_mcp").from("transactions").insert({
    transaction_id: transactionId,
    payer_id: userId,
    amount,
    currency: "CAD",
    payment_method: "wallet",
    transaction_type: "wallet_topup",
    status: "completed",
    created_at: createdAt,
    updated_at: createdAt,
    completed_at: createdAt,
  });
  if (txError) return failEnvelope("DB_ERROR", "Database operation failed");

  if (existing?.wallet_id) {
    const { error: updateError } = await supabase
      .schema("payments_mcp")
      .from("wallets")
      .update({ balance: nextBalance, updated_at: now() })
      .eq("wallet_id", existing.wallet_id);
    if (updateError) return failEnvelope("DB_ERROR", "Database operation failed");
  } else {
    const { error: insertError } = await supabase.schema("payments_mcp").from("wallets").insert({
      user_id: userId,
      balance: nextBalance,
      pending_balance: 0,
      currency: "CAD",
    });
    if (insertError) return failEnvelope("DB_ERROR", "Database operation failed");
  }

  await emitEvent(supabase, SOURCE, "payments.wallet.topped_up", {
    user_id: userId,
    amount,
    transaction_id: transactionId,
  });
  return okEnvelope({
    transaction_id: transactionId,
    wallet: {
      user_id: userId,
      balance: nextBalance,
      pending_balance: Number(existing?.pending_balance ?? 0),
    },
  });
}

async function managePaymentMethods({ args }: ToolRequest) {
  const auth = await authorize("manage_payment_methods", args);
  if (!auth.ok) return auth.envelope;
  const userId = auth.userId;
  const type = String(args.type ?? "").trim();
  const label = String(args.label ?? "").trim();
  if (!type) return failEnvelope("VALIDATION_ERROR", "type is required.");
  if (!label) return failEnvelope("VALIDATION_ERROR", "label is required.");
  const setDefault = Boolean(args.set_default);
  const supabase = serviceClient();
  if (setDefault) {
    await supabase
      .schema("payments_mcp")
      .from("payment_methods")
      .update({ is_default: false })
      .eq("user_id", userId);
  }
  const methodId = generateId();
  const { error } = await supabase.schema("payments_mcp").from("payment_methods").insert({
    method_id: methodId,
    user_id: userId,
    type,
    label,
    is_default: setDefault,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  const { data: rows } = await supabase
    .schema("payments_mcp")
    .from("payment_methods")
    .select("method_id,user_id,type,label,is_default")
    .eq("user_id", userId);
  await emitEvent(supabase, SOURCE, "payments.method.added", {
    user_id: userId,
    method_id: methodId,
    type,
  });
  return okEnvelope({ method_id: methodId, methods: rows ?? [] });
}

async function processPayment({ args }: ToolRequest) {
  const auth = await authorize("process_payment", args);
  if (!auth.ok) return auth.envelope;
  const userId = auth.userId;
  const amount = Number(args.amount ?? 0);
  const method = String(args.method ?? "stripe_card");
  if (!Number.isFinite(amount) || amount <= 0) {
    return failEnvelope("VALIDATION_ERROR", "amount must be greater than 0.");
  }
  if (!method) return failEnvelope("VALIDATION_ERROR", "method is required.");
  const orderId = args.order_id ? String(args.order_id) : undefined;
  const supabase = serviceClient();
  const commissionRate = await getPlatformConfigNumber(
    supabase,
    "commission_rate",
    DEFAULT_COMMISSION_RATE,
    (n) => n > 0 && n < 1,
  );
  const hstRate = await getPlatformConfigNumber(
    supabase,
    "tax_rate_hst",
    DEFAULT_HST_RATE,
    (n) => n >= 0 && n < 1,
  );
  const commission = calculateCommission(amount, { rate: commissionRate, minimum: 25, cap: 5000 });
  const taxAmount = roundToTwoDecimals(commission * hstRate);
  const transactionId = generateId();
  const createdAt = now();
  const escrowReference = { order_id: orderId ?? null, escrow_state: "pending_funding" };

  const { error } = await supabase.schema("payments_mcp").from("transactions").insert({
    transaction_id: transactionId,
    order_id: orderId ?? null,
    payer_id: userId,
    amount,
    original_amount: amount,
    currency: "CAD",
    payment_method: method,
    transaction_type: "purchase",
    status: "pending_capture",
    commission_amount: commission,
    tax_amount: taxAmount,
    metadata: { escrow_reference: escrowReference, hst_rate: hstRate, commission_rate: commissionRate },
    created_at: createdAt,
    updated_at: createdAt,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");

  await emitEvent(supabase, SOURCE, "payments.payment.initiated", {
    user_id: userId,
    transaction_id: transactionId,
    order_id: orderId ?? null,
    amount,
  });
  return okEnvelope({
    transaction: {
      transaction_id: transactionId,
      order_id: orderId,
      payer_id: userId,
      amount,
      payment_method: method,
      transaction_type: "purchase",
      status: "pending_capture",
      commission_amount: commission,
      tax_amount: taxAmount,
      created_at: createdAt,
      escrow_reference: escrowReference,
    },
  });
}

async function createPaymentIntent({ args }: ToolRequest) {
  const auth = await authorize("create_payment_intent", args);
  if (!auth.ok) return auth.envelope;
  const userId = auth.userId;
  const amount = Number(args.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return failEnvelope("VALIDATION_ERROR", "amount must be greater than 0.");
  }
  const orderId = String(args.order_id ?? "");
  if (!orderId) return failEnvelope("VALIDATION_ERROR", "order_id is required.");
  const escrowId = args.escrow_id ? String(args.escrow_id) : null;
  const currency = String(args.currency ?? "CAD").toLowerCase();

  const supabase = serviceClient();
  // Server-allocated transaction_id doubles as the Stripe idempotency key.
  // See plan §4 / payments-mcp.create_payment_intent for the rationale.
  const transactionId = generateId();

  const insertResult = await supabase.schema("payments_mcp").from("transactions").insert({
    transaction_id: transactionId,
    order_id: orderId,
    escrow_id: escrowId,
    payer_id: userId,
    amount,
    original_amount: amount,
    currency: currency.toUpperCase(),
    payment_method: "stripe_card",
    transaction_type: "purchase",
    status: "pending_capture",
    metadata: { source: "create_payment_intent" },
    created_at: now(),
    updated_at: now(),
  });
  if (insertResult.error) return failEnvelope("DB_ERROR", "Database operation failed");

  const stripeResult = await stripeCreatePaymentIntent({
    amountCents: Math.round(amount * 100),
    currency,
    metadata: {
      transaction_id: transactionId,
      order_id: orderId,
      ...(escrowId ? { escrow_id: escrowId } : {}),
      payer_id: userId,
    },
    idempotencyKey: transactionId,
  });
  if (!stripeResult.ok) {
    await supabase.schema("payments_mcp").from("transactions")
      .update({
        status: "failed",
        metadata: { stripe_error: { code: stripeResult.code, message: stripeResult.message } },
        updated_at: now(),
      })
      .eq("transaction_id", transactionId);
    return failEnvelope(stripeResult.code, stripeResult.message);
  }

  const updateResult = await supabase.schema("payments_mcp").from("transactions")
    .update({ stripe_payment_intent_id: stripeResult.payment_intent_id, updated_at: now() })
    .eq("transaction_id", transactionId);
  if (updateResult.error) return failEnvelope("DB_ERROR", "Database operation failed");

  await emitEvent(supabase, SOURCE, "payments.payment_intent.created", {
    user_id: userId,
    transaction_id: transactionId,
    order_id: orderId,
    escrow_id: escrowId,
    payment_intent_id: stripeResult.payment_intent_id,
    amount,
    currency: currency.toUpperCase(),
  });

  return okEnvelope({
    transaction_id: transactionId,
    payment_intent_id: stripeResult.payment_intent_id,
    client_secret: stripeResult.client_secret,
    amount,
    currency: currency.toUpperCase(),
    status: stripeResult.status,
  });
}

async function getTransactionHistory({ args }: ToolRequest) {
  const auth = await authorize("get_transaction_history", args);
  if (!auth.ok) return auth.envelope;
  const supabase = serviceClient();
  const { data, error } = await supabase
    .schema("payments_mcp")
    .from("transactions")
    .select("*")
    .eq("payer_id", auth.userId)
    .order("created_at", { ascending: false });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ transactions: data ?? [], total: (data ?? []).length });
}

Deno.serve(serveDomain({
  ping,
  process_payment: processPayment,
  create_payment_intent: createPaymentIntent,
  get_wallet_balance: getWalletBalance,
  top_up_wallet: topUpWallet,
  manage_payment_methods: managePaymentMethods,
  get_transaction_history: getTransactionHistory,
}));
