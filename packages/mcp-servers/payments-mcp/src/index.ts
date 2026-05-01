import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { calculateCommission, generateId, MatexEventBus, now, roundToTwoDecimals } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "payments-mcp";
const SERVER_VERSION = "0.1.0";
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

async function getCommissionRate(): Promise<number> {
  if (!supabase) return DEFAULT_COMMISSION_RATE;
  try {
    const { data } = await supabase.schema("log_mcp").from("platform_config").select("config_value").eq("config_key", "commission_rate").maybeSingle();
    if (data?.config_value) {
      const parsed = parseFloat(String(data.config_value));
      if (Number.isFinite(parsed) && parsed > 0 && parsed < 1) return parsed;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_COMMISSION_RATE;
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "process_payment", description: "Process buyer payment record", inputSchema: { type: "object", properties: { user_id: { type: "string" }, amount: { type: "number" }, method: { type: "string" }, order_id: { type: "string" } }, required: ["user_id", "amount", "method"] } },
    { name: "get_wallet_balance", description: "Get wallet balances by user", inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] } },
    { name: "top_up_wallet", description: "Top up user wallet", inputSchema: { type: "object", properties: { user_id: { type: "string" }, amount: { type: "number" } }, required: ["user_id", "amount"] } },
    { name: "manage_payment_methods", description: "Add payment method metadata", inputSchema: { type: "object", properties: { user_id: { type: "string" }, type: { type: "string" }, label: { type: "string" }, set_default: { type: "boolean" } }, required: ["user_id", "type", "label"] } },
    { name: "get_transaction_history", description: "Get recent transactions by user", inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }

  if (tool === "get_wallet_balance") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");

    if (supabase) {
      const { data, error } = await supabase
        .schema("payments_mcp")
        .from("wallets")
        .select("user_id,balance,pending_balance")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return fail("DB_ERROR", error.message);
      const wallet = data ?? { user_id: userId, balance: 0, pending_balance: 0 };
      return { content: [{ type: "text", text: ok({ wallet }) }] };
    }

    const wallet = wallets.get(userId) ?? { user_id: userId, balance: 0, pending_balance: 0 };
    return { content: [{ type: "text", text: ok({ wallet }) }] };
  }

  if (tool === "top_up_wallet") {
    const userId = String(args.user_id ?? "");
    const amount = Number(args.amount ?? 0);
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
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
      if (txError) return fail("DB_ERROR", txError.message);

      if (existing?.wallet_id) {
        const { error: updateError } = await supabase
          .schema("payments_mcp")
          .from("wallets")
          .update({ balance: nextBalance, updated_at: now() })
          .eq("wallet_id", existing.wallet_id);
        if (updateError) return fail("DB_ERROR", updateError.message);
      } else {
        const { error: insertError } = await supabase.schema("payments_mcp").from("wallets").insert({
          user_id: userId,
          balance: nextBalance,
          pending_balance: 0,
          currency: "CAD",
        });
        if (insertError) return fail("DB_ERROR", insertError.message);
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
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
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
      if (error) return fail("DB_ERROR", error.message);
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
    const userId = String(args.user_id ?? "");
    const amount = Number(args.amount ?? 0);
    const method = String(args.method ?? "stripe_card");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    if (!Number.isFinite(amount) || amount <= 0) return fail("VALIDATION_ERROR", "amount must be greater than 0.");
    if (!method) return fail("VALIDATION_ERROR", "method is required.");
    const orderId = args.order_id ? String(args.order_id) : undefined;
    const commissionRate = await getCommissionRate();
    const commission = calculateCommission(amount, { rate: commissionRate, minimum: 25, cap: 5000 });
    const transaction = {
      transaction_id: generateId(),
      order_id: orderId,
      payer_id: userId,
      amount,
      payment_method: method,
      transaction_type: "purchase",
      status: "completed",
      commission_amount: commission,
      tax_amount: roundToTwoDecimals(commission * 0.13),
      created_at: now(),
      escrow_reference: {
        order_id: orderId ?? null,
        escrow_state: "pending_funding",
      },
    };

    if (supabase) {
      const { error } = await supabase.schema("payments_mcp").from("transactions").insert({
        transaction_id: transaction.transaction_id,
        order_id: orderId ?? null,
        payer_id: userId,
        amount,
        original_amount: amount,
        currency: "CAD",
        payment_method: method,
        transaction_type: "purchase",
        status: "pending_capture",
        commission_amount: commission,
        tax_amount: roundToTwoDecimals(commission * 0.13),
        metadata: { escrow_reference: transaction.escrow_reference },
        created_at: transaction.created_at,
        updated_at: transaction.created_at,
      });
      if (error) return fail("DB_ERROR", error.message);
      const pendingTx = { ...transaction, status: "pending_capture" };
      await emitEvent("payments.payment.initiated", { user_id: userId, transaction_id: transaction.transaction_id, order_id: orderId ?? null, amount });
      return { content: [{ type: "text", text: ok({ transaction: pendingTx }) }] };
    }

    const pendingTx = { ...transaction, status: "pending_capture" };
    transactions.push(pendingTx);
    await emitEvent("payments.payment.initiated", { user_id: userId, transaction_id: transaction.transaction_id, order_id: orderId ?? null, amount });
    return { content: [{ type: "text", text: ok({ transaction: pendingTx }) }] };
  }

  if (tool === "get_transaction_history") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");

    if (supabase) {
      const { data, error } = await supabase
        .schema("payments_mcp")
        .from("transactions")
        .select("*")
        .eq("payer_id", userId)
        .order("created_at", { ascending: false });
      if (error) return fail("DB_ERROR", error.message);
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
