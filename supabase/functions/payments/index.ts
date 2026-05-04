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

type Mutating = "top_up_wallet" | "manage_payment_methods" | "process_payment";
const MUTATING: Set<Mutating> = new Set(["top_up_wallet", "manage_payment_methods", "process_payment"]);

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
  get_wallet_balance: getWalletBalance,
  top_up_wallet: topUpWallet,
  manage_payment_methods: managePaymentMethods,
  get_transaction_history: getTransactionHistory,
}));
