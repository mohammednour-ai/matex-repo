import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { calculateCommission, generateId, getPlatformConfigNumber, MatexEventBus, now, roundToTwoDecimals , initSentry} from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "payments-mcp";
initSentry(SERVER_NAME);
const SERVER_VERSION = "0.1.0";
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
// Pinned to keep PaymentIntent state-machine semantics stable across Stripe
// dashboard upgrades. Bump deliberately when validating against newer
// Stripe behaviour. Refs: docs/audit/2026-05-10/p0-1-stripe-elements-plan.md §6.
const STRIPE_API_VERSION = "2024-11-20.acacia";

/**
 * Direct Stripe PaymentIntent creation. We don't reach through the
 * stripe-bridge MCP server here for two reasons:
 *  - The bridge runs over stdio and is not exposed as an HTTP service that
 *    payments-mcp can reach. Wiring it as one is a separate (larger) change.
 *  - The Supabase Edge function (Deno) also creates PaymentIntents and can't
 *    import the Node-only bridge. Doing the call inline in both transports
 *    keeps them at exact behavioural parity (CLAUDE.md rule).
 *
 * The `stripe-bridge/src/index.ts` file documents the same contract; if a
 * future PR exposes the bridge over HTTP we can route through it without
 * changing this function's call sites.
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
    // Stub mode: no key configured. Return a fake PI shaped like Stripe's so
    // the surrounding flow can be exercised in dev without real keys. The
    // client_secret is intentionally non-functional — Stripe.js will reject
    // it on confirm, surfacing the missing-key state to the developer.
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

interface Wallet {
  user_id: string;
  balance: number;
  pending_balance: number;
}

interface PaymentMethod {
  method_id: string;
  user_id: string;
  type: string;
  label: string;
  is_default: boolean;
}

const wallets = new Map<string, Wallet>();
const methods = new Map<string, PaymentMethod[]>();
const transactions: Array<Record<string, unknown>> = [];
const eventBus = EVENT_REDIS_URL ? new MatexEventBus({ redisUrl: EVENT_REDIS_URL }) : null;
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ success: true, data });
}

function fail(code: string, message: string): { isError: true; content: Array<{ type: "text"; text: string }> } {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: { code, message } }) }] };
}

async function emitEvent(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!eventBus) return;
  try {
    await eventBus.publish(event, payload, SERVER_NAME);
  } catch {
    // Non-blocking event emission for MVP scaffold.
  }
}

const DEFAULT_COMMISSION_RATE = 0.035;
const DEFAULT_HST_RATE = 0.13;

async function isPlatformAdmin(userId: string): Promise<boolean> {
  if (!supabase || !userId) return false;
  const { data } = await supabase.schema("auth_mcp").from("users").select("is_platform_admin").eq("user_id", userId).maybeSingle();
  return Boolean(data?.is_platform_admin);
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "process_payment", description: "Process buyer payment record. actor_id must equal user_id (the payer).", inputSchema: { type: "object", properties: { actor_id: { type: "string" }, user_id: { type: "string" }, amount: { type: "number" }, method: { type: "string" }, order_id: { type: "string" } }, required: ["actor_id", "user_id", "amount", "method"] } },
    { name: "create_payment_intent", description: "Allocate a Stripe PaymentIntent server-side and record a pending transaction row. Returns client_secret for the browser to confirm. actor_id must equal user_id.", inputSchema: { type: "object", properties: { actor_id: { type: "string" }, user_id: { type: "string" }, amount: { type: "number" }, currency: { type: "string" }, order_id: { type: "string" }, escrow_id: { type: "string" } }, required: ["actor_id", "user_id", "amount", "order_id"] } },
    { name: "get_wallet_balance", description: "Get wallet balances by user. actor_id must equal user_id (or be a platform admin).", inputSchema: { type: "object", properties: { actor_id: { type: "string" }, user_id: { type: "string" } }, required: ["actor_id", "user_id"] } },
    { name: "top_up_wallet", description: "Top up user wallet. actor_id must equal user_id.", inputSchema: { type: "object", properties: { actor_id: { type: "string" }, user_id: { type: "string" }, amount: { type: "number" } }, required: ["actor_id", "user_id", "amount"] } },
    { name: "manage_payment_methods", description: "Add payment method metadata. actor_id must equal user_id.", inputSchema: { type: "object", properties: { actor_id: { type: "string" }, user_id: { type: "string" }, type: { type: "string" }, label: { type: "string" }, set_default: { type: "boolean" } }, required: ["actor_id", "user_id", "type", "label"] } },
    { name: "get_transaction_history", description: "Get recent transactions by user. actor_id must equal user_id (or be a platform admin).", inputSchema: { type: "object", properties: { actor_id: { type: "string" }, user_id: { type: "string" } }, required: ["actor_id", "user_id"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }

  // Tools other than ping require an actor_id; verify it matches the target user_id (or actor is a platform admin).
  const actorId = String(args.actor_id ?? "");
  const targetUserId = String(args.user_id ?? "");
  if (tool === "get_wallet_balance" || tool === "top_up_wallet" || tool === "manage_payment_methods" || tool === "process_payment" || tool === "create_payment_intent" || tool === "get_transaction_history") {
    if (!actorId) return fail("VALIDATION_ERROR", "actor_id is required.");
    if (!targetUserId) return fail("VALIDATION_ERROR", "user_id is required.");
    if (actorId !== targetUserId) {
      const isAdmin = await isPlatformAdmin(actorId);
      // For mutating tools (top_up_wallet, manage_payment_methods, process_payment, create_payment_intent) we require actor === user; admins cannot impersonate.
      if (tool === "top_up_wallet" || tool === "manage_payment_methods" || tool === "process_payment" || tool === "create_payment_intent") {
        return fail("FORBIDDEN", "actor_id must match user_id for this operation.");
      }
      if (!isAdmin) return fail("FORBIDDEN", "actor_id must match user_id (or actor must be a platform admin).");
    }
  }

  if (tool === "get_wallet_balance") {
    const userId = targetUserId;

    if (supabase) {
      const { data, error } = await supabase
        .schema("payments_mcp")
        .from("wallets")
        .select("user_id,balance,pending_balance")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return fail("DB_ERROR", "Database operation failed");
      const wallet = data ?? { user_id: userId, balance: 0, pending_balance: 0 };
      return { content: [{ type: "text", text: ok({ wallet }) }] };
    }

    const wallet = wallets.get(userId) ?? { user_id: userId, balance: 0, pending_balance: 0 };
    return { content: [{ type: "text", text: ok({ wallet }) }] };
  }

  if (tool === "top_up_wallet") {
    const userId = targetUserId;
    const amount = Number(args.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return fail("VALIDATION_ERROR", "amount must be greater than 0.");

    if (supabase) {
      const { data: existing } = await supabase
        .schema("payments_mcp")
        .from("wallets")
        .select("wallet_id,balance,pending_balance")
        .eq("user_id", userId)
        .maybeSingle();

      const nextBalance = roundToTwoDecimals(Number(existing?.balance ?? 0) + amount);
      const transactionId = generateId();
      const createdAt = now();

      // Insert transaction record first so a crash after this point leaves an auditable record.
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
      if (txError) return fail("DB_ERROR", "Database operation failed");

      if (existing?.wallet_id) {
        const { error: updateError } = await supabase
          .schema("payments_mcp")
          .from("wallets")
          .update({ balance: nextBalance, updated_at: now() })
          .eq("wallet_id", existing.wallet_id);
        if (updateError) return fail("DB_ERROR", "Database operation failed");
      } else {
        const { error: insertError } = await supabase.schema("payments_mcp").from("wallets").insert({
          user_id: userId,
          balance: nextBalance,
          pending_balance: 0,
          currency: "CAD",
        });
        if (insertError) return fail("DB_ERROR", "Database operation failed");
      }

      await emitEvent("payments.wallet.topped_up", { user_id: userId, amount, transaction_id: transactionId });
      return {
        content: [
          {
            type: "text",
            text: ok({ transaction_id: transactionId, wallet: { user_id: userId, balance: nextBalance, pending_balance: Number(existing?.pending_balance ?? 0) } }),
          },
        ],
      };
    }

    const wallet = wallets.get(userId) ?? { user_id: userId, balance: 0, pending_balance: 0 };
    wallet.balance = roundToTwoDecimals(wallet.balance + amount);
    wallets.set(userId, wallet);
    const transaction = {
      transaction_id: generateId(),
      user_id: userId,
      amount,
      transaction_type: "wallet_topup",
      status: "completed",
      created_at: now(),
    };
    transactions.push(transaction);
    await emitEvent("payments.wallet.topped_up", { user_id: userId, amount, transaction_id: transaction.transaction_id });
    return { content: [{ type: "text", text: ok({ transaction_id: transaction.transaction_id, wallet }) }] };
  }

  if (tool === "manage_payment_methods") {
    const userId = targetUserId;
    if (!String(args.type ?? "").trim()) return fail("VALIDATION_ERROR", "type is required.");
    if (!String(args.label ?? "").trim()) return fail("VALIDATION_ERROR", "label is required.");

    if (supabase) {
      const setDefault = Boolean(args.set_default);
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
        type: String(args.type ?? "stripe_card"),
        label: String(args.label ?? "Payment Method"),
        is_default: setDefault,
      });
      if (error) return fail("DB_ERROR", "Database operation failed");
      const { data: rows } = await supabase
        .schema("payments_mcp")
        .from("payment_methods")
        .select("method_id,user_id,type,label,is_default")
        .eq("user_id", userId);
      await emitEvent("payments.method.added", { user_id: userId, method_id: methodId, type: String(args.type ?? "stripe_card") });
      return { content: [{ type: "text", text: ok({ method_id: methodId, methods: rows ?? [] }) }] };
    }

    const current = methods.get(userId) ?? [];
    const setDefault = Boolean(args.set_default);
    const method: PaymentMethod = {
      method_id: generateId(),
      user_id: userId,
      type: String(args.type ?? "stripe_card"),
      label: String(args.label ?? "Payment Method"),
      is_default: setDefault,
    };
    const next = setDefault ? current.map((m) => ({ ...m, is_default: false })).concat(method) : current.concat(method);
    methods.set(userId, next);
    await emitEvent("payments.method.added", { user_id: userId, method_id: method.method_id, type: method.type });
    return { content: [{ type: "text", text: ok({ method_id: method.method_id, methods: next }) }] };
  }

  if (tool === "process_payment") {
    const userId = targetUserId;
    const amount = Number(args.amount ?? 0);
    const method = String(args.method ?? "stripe_card");
    if (!Number.isFinite(amount) || amount <= 0) return fail("VALIDATION_ERROR", "amount must be greater than 0.");
    if (!method) return fail("VALIDATION_ERROR", "method is required.");
    const orderId = args.order_id ? String(args.order_id) : undefined;
    const commissionRate = await getPlatformConfigNumber(supabase, "commission_rate", DEFAULT_COMMISSION_RATE, (n) => n > 0 && n < 1);
    const hstRate = await getPlatformConfigNumber(supabase, "tax_rate_hst", DEFAULT_HST_RATE, (n) => n >= 0 && n < 1);
    const commission = calculateCommission(amount, { rate: commissionRate, minimum: 25, cap: 5000 });
    const taxAmount = roundToTwoDecimals(commission * hstRate);

    // Status is now method-aware. Previously every method wrote
    // 'pending_capture', but the Stripe webhook only completes
    // stripe_card transactions — wallet/credit/interac rows were
    // stranded in pending_capture forever.
    //
    //   stripe_card  → pending_capture (Stripe webhook flips to completed)
    //   wallet       → completed       (debits wallet balance atomically)
    //   credit_terms → completed       (records the obligation; credit-mcp
    //                                   tracks the actual net-30 ledger)
    //   credit       → completed       (alias of credit_terms in this code)
    //   interac      → pending         (awaits manual ops confirmation; the
    //                                   UI already tells the buyer to send
    //                                   to payments@matex.ca with the order
    //                                   number as memo)
    let resolvedStatus: string;
    const extraMetadata: Record<string, unknown> = {};
    if (method === "wallet") {
      // Atomic debit via the SQL function added in
      // 20260513000000_payments_debit_wallet_function.sql. Returns null
      // when the wallet is missing OR the balance is insufficient —
      // either way, refuse to record a transaction we can't honour.
      // Requires supabase configured; the in-memory dev fallback does
      // not back the wallets table.
      if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for wallet payments.");
      const debitRes = await supabase.rpc("debit_wallet", { p_user_id: userId, p_amount: amount });
      if (debitRes.error) return fail("DB_ERROR", "Could not debit wallet.");
      if (debitRes.data === null || debitRes.data === undefined) {
        return fail("INSUFFICIENT_BALANCE", "Wallet balance is insufficient for this payment.");
      }
      resolvedStatus = "completed";
      extraMetadata.wallet_balance_after = Number(debitRes.data);
    } else if (method === "credit_terms" || method === "credit") {
      resolvedStatus = "completed";
      extraMetadata.payment_terms = "net_30_credit";
    } else if (method === "interac") {
      resolvedStatus = "pending";
      extraMetadata.awaiting_interac_confirmation = true;
      extraMetadata.deposit_email = "payments@matex.ca";
    } else if (method === "stripe_card") {
      resolvedStatus = "pending_capture";
    } else {
      // Unknown / new method: default to pending so the order machine
      // can't advance on a guess.
      resolvedStatus = "pending";
    }

    const transactionId = generateId();
    const createdAt = now();
    const transaction = {
      transaction_id: transactionId,
      order_id: orderId,
      payer_id: userId,
      amount,
      payment_method: method,
      transaction_type: "purchase",
      status: resolvedStatus,
      commission_amount: commission,
      tax_amount: taxAmount,
      created_at: createdAt,
      escrow_reference: {
        order_id: orderId ?? null,
        escrow_state: "pending_funding",
      },
    };

    if (supabase) {
      const { error } = await supabase.schema("payments_mcp").from("transactions").insert({
        transaction_id: transactionId,
        order_id: orderId ?? null,
        payer_id: userId,
        amount,
        original_amount: amount,
        currency: "CAD",
        payment_method: method,
        transaction_type: "purchase",
        status: resolvedStatus,
        commission_amount: commission,
        tax_amount: taxAmount,
        completed_at: resolvedStatus === "completed" ? createdAt : null,
        metadata: {
          escrow_reference: transaction.escrow_reference,
          hst_rate: hstRate,
          commission_rate: commissionRate,
          ...extraMetadata,
        },
        created_at: createdAt,
        updated_at: createdAt,
      });
      if (error) return fail("DB_ERROR", "Database operation failed");
      await emitEvent("payments.payment.initiated", { user_id: userId, transaction_id: transactionId, order_id: orderId ?? null, amount, status: resolvedStatus, method });
      return { content: [{ type: "text", text: ok({ transaction }) }] };
    }

    transactions.push({ ...transaction });
    await emitEvent("payments.payment.initiated", { user_id: userId, transaction_id: transactionId, order_id: orderId ?? null, amount, status: resolvedStatus, method });
    return { content: [{ type: "text", text: ok({ transaction }) }] };
  }

  if (tool === "create_payment_intent") {
    // Card-only path. Wallet/credit payments stay on process_payment.
    const userId = targetUserId;
    const amount = Number(args.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return fail("VALIDATION_ERROR", "amount must be greater than 0.");
    const orderId = String(args.order_id ?? "");
    if (!orderId) return fail("VALIDATION_ERROR", "order_id is required.");
    const escrowId = args.escrow_id ? String(args.escrow_id) : null;
    const currency = String(args.currency ?? "CAD").toLowerCase();
    if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for create_payment_intent.");

    // Server-allocated transaction_id — used as the Stripe idempotency key
    // so a transient retry of this tool call (same key) returns the original
    // PI rather than creating a second one. Two distinct user-driven retries
    // get distinct keys (because they get distinct transaction_ids), which
    // is the right semantics — the abandoned transaction is reaped later
    // by reconciliation.
    const transactionId = generateId();

    // Insert the durable record first, in pending_capture, with no PI ID
    // yet. If the Stripe call fails we still have an audit trail; if it
    // succeeds we update the row with the PI id below.
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
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");

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
      // Mark the transaction failed so reconciliation doesn't have to. The
      // partial-unique index on stripe_payment_intent_id (NULL allowed)
      // means leaving the row with a NULL PI id is fine.
      await supabase.schema("payments_mcp").from("transactions")
        .update({ status: "failed", metadata: { stripe_error: { code: stripeResult.code, message: stripeResult.message } }, updated_at: now() })
        .eq("transaction_id", transactionId);
      return fail(stripeResult.code, stripeResult.message);
    }

    const updateResult = await supabase.schema("payments_mcp").from("transactions")
      .update({ stripe_payment_intent_id: stripeResult.payment_intent_id, updated_at: now() })
      .eq("transaction_id", transactionId);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("payments.payment_intent.created", {
      user_id: userId,
      transaction_id: transactionId,
      order_id: orderId,
      escrow_id: escrowId,
      payment_intent_id: stripeResult.payment_intent_id,
      amount,
      currency: currency.toUpperCase(),
    });

    return { content: [{ type: "text", text: ok({
      transaction_id: transactionId,
      payment_intent_id: stripeResult.payment_intent_id,
      client_secret: stripeResult.client_secret,
      amount,
      currency: currency.toUpperCase(),
      status: stripeResult.status,
    }) }] };
  }

  if (tool === "get_transaction_history") {
    const userId = targetUserId;

    if (supabase) {
      const { data, error } = await supabase
        .schema("payments_mcp")
        .from("transactions")
        .select("*")
        .eq("payer_id", userId)
        .order("created_at", { ascending: false });
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ transactions: data ?? [], total: (data ?? []).length }) }] };
    }

    const rows = transactions.filter((t) => t.payer_id === userId);
    return { content: [{ type: "text", text: ok({ transactions: rows, total: rows.length }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("payments", Number(process.env.MCP_HTTP_PORT ?? 4106));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
