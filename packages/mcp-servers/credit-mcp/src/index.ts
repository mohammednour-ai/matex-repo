import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now, roundToTwoDecimals , initSentry} from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "credit-mcp";
initSentry(SERVER_NAME);
const SERVER_VERSION = "0.1.0";
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CREDIT_TIERS: Record<string, { min: number; max: number; limit: number; terms: string }> = {
  none: { min: 0, max: 499, limit: 0, terms: "100% upfront" },
  basic: { min: 500, max: 599, limit: 25000, terms: "Net 15" },
  standard: { min: 600, max: 699, limit: 100000, terms: "Net 30" },
  premium: { min: 700, max: 799, limit: 500000, terms: "Net 60" },
  enterprise: { min: 800, max: 850, limit: 2000000, terms: "Net 90" },
};

function getTierForScore(score: number): string {
  for (const [tier, range] of Object.entries(CREDIT_TIERS)) {
    if (score >= range.min && score <= range.max) return tier;
  }
  return "none";
}

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

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "assess_credit", description: "Create or update credit facility with score assessment", inputSchema: { type: "object", properties: { user_id: { type: "string" }, factors: { type: "object", description: "Scoring factors: payment_history, volume, pis, account_age, external, financial (each 0-100)" } }, required: ["user_id", "factors"] } },
    { name: "get_credit_facility", description: "Get user credit facility status", inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] } },
    { name: "draw_credit", description: "Create credit invoice (draw against facility)", inputSchema: { type: "object", properties: { user_id: { type: "string" }, amount: { type: "number" }, order_id: { type: "string" }, description: { type: "string" } }, required: ["user_id", "amount"] } },
    { name: "record_payment", description: "Mark credit invoice as paid", inputSchema: { type: "object", properties: { invoice_id: { type: "string" }, amount_paid: { type: "number" } }, required: ["invoice_id", "amount_paid"] } },
    { name: "get_credit_history", description: "Get credit score history for user", inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] } },
    { name: "freeze_facility", description: "Freeze credit facility (overdue or compliance)", inputSchema: { type: "object", properties: { user_id: { type: "string" }, reason: { type: "string" } }, required: ["user_id", "reason"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }

  if (tool === "assess_credit") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    const factors = (args.factors ?? {}) as Record<string, number>;

    const weights: Record<string, number> = { payment_history: 0.30, volume: 0.20, pis: 0.15, account_age: 0.10, external: 0.15, financial: 0.10 };
    let weightedScore = 0;
    for (const [factor, weight] of Object.entries(weights)) {
      const value = Math.min(100, Math.max(0, Number(factors[factor] ?? 50)));
      weightedScore += value * weight;
    }
    const score = Math.round(300 + (weightedScore / 100) * 550);
    const clampedScore = Math.min(850, Math.max(300, score));
    const tier = getTierForScore(clampedScore);
    const tierConfig = CREDIT_TIERS[tier];

    const facilityId = generateId();
    const createdAt = now();

    if (supabase) {
      const { data: existing } = await supabase
        .schema("credit_mcp")
        .from("credit_facilities")
        .select("facility_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing?.facility_id) {
        const { error } = await supabase
          .schema("credit_mcp")
          .from("credit_facilities")
          .update({ credit_score: clampedScore, tier, credit_limit: tierConfig.limit, terms: tierConfig.terms, updated_at: createdAt })
          .eq("facility_id", existing.facility_id);
        if (error) return fail("DB_ERROR", "Database operation failed");
      } else {
        const { error } = await supabase.schema("credit_mcp").from("credit_facilities").insert({
          facility_id: facilityId,
          user_id: userId,
          credit_score: clampedScore,
          tier,
          credit_limit: tierConfig.limit,
          total_outstanding: 0,
          available_credit: tierConfig.limit,
          terms: tierConfig.terms,
          status: "active",
          created_at: createdAt,
          updated_at: createdAt,
        });
        if (error) return fail("DB_ERROR", "Database operation failed");
      }

      const historyId = generateId();
      await supabase.schema("credit_mcp").from("credit_score_history").insert({
        history_id: historyId,
        user_id: userId,
        score: clampedScore,
        tier,
        factors,
        created_at: createdAt,
      });

      await emitEvent("credit.facility.assessed", { user_id: userId, score: clampedScore, tier });
      return { content: [{ type: "text", text: ok({ user_id: userId, score: clampedScore, tier, credit_limit: tierConfig.limit, terms: tierConfig.terms }) }] };
    }

    await emitEvent("credit.facility.assessed", { user_id: userId, score: clampedScore, tier });
    return { content: [{ type: "text", text: ok({ user_id: userId, score: clampedScore, tier, credit_limit: tierConfig.limit, terms: tierConfig.terms }) }] };
  }

  if (tool === "get_credit_facility") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");

    if (supabase) {
      const { data, error } = await supabase
        .schema("credit_mcp")
        .from("credit_facilities")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return fail("DB_ERROR", "Database operation failed");
      if (!data) return { content: [{ type: "text", text: ok({ facility: null, message: "No credit facility found." }) }] };
      return { content: [{ type: "text", text: ok({ facility: data }) }] };
    }

    return { content: [{ type: "text", text: ok({ facility: null, message: "No credit facility found." }) }] };
  }

  if (tool === "draw_credit") {
    const userId = String(args.user_id ?? "");
    const amount = Number(args.amount ?? 0);
    const orderId = args.order_id ? String(args.order_id) : null;
    const description = String(args.description ?? "Credit draw");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    if (!Number.isFinite(amount) || amount <= 0) return fail("VALIDATION_ERROR", "amount must be greater than 0.");

    if (supabase) {
      const { data: facility, error: facError } = await supabase
        .schema("credit_mcp")
        .from("credit_facilities")
        .select("facility_id,available_credit,total_outstanding,credit_limit,status")
        .eq("user_id", userId)
        .maybeSingle();
      if (facError) return fail("DB_ERROR", "Database operation failed");
      if (!facility) return fail("NO_FACILITY", "No credit facility found for this user.");
      if (facility.status === "frozen") return fail("FACILITY_FROZEN", "Credit facility is frozen.");
      if (amount > Number(facility.available_credit)) return fail("INSUFFICIENT_CREDIT", `Requested ${amount} exceeds available credit ${facility.available_credit}.`);

      const invoiceId = generateId();
      const createdAt = now();
      const { error: invError } = await supabase.schema("credit_mcp").from("credit_invoices").insert({
        invoice_id: invoiceId,
        facility_id: facility.facility_id,
        user_id: userId,
        order_id: orderId,
        amount: roundToTwoDecimals(amount),
        description,
        status: "outstanding",
        created_at: createdAt,
        due_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      });
      if (invError) return fail("DB_ERROR", "Database operation failed");

      const newOutstanding = roundToTwoDecimals(Number(facility.total_outstanding) + amount);
      const newAvailable = roundToTwoDecimals(Number(facility.credit_limit) - newOutstanding);
      const { error: facUpdateError } = await supabase
        .schema("credit_mcp")
        .from("credit_facilities")
        .update({ total_outstanding: newOutstanding, available_credit: newAvailable, updated_at: createdAt })
        .eq("facility_id", facility.facility_id)
        .eq("available_credit", facility.available_credit);
      if (facUpdateError) {
        await supabase.schema("credit_mcp").from("credit_invoices").delete().eq("invoice_id", invoiceId);
        return fail("CONCURRENCY_CONFLICT", "Credit facility changed concurrently, please retry.");
      }

      await emitEvent("credit.draw.created", { user_id: userId, invoice_id: invoiceId, amount });
      return { content: [{ type: "text", text: ok({ invoice_id: invoiceId, amount: roundToTwoDecimals(amount), available_credit: newAvailable }) }] };
    }

    const invoiceId = generateId();
    await emitEvent("credit.draw.created", { user_id: userId, invoice_id: invoiceId, amount });
    return { content: [{ type: "text", text: ok({ invoice_id: invoiceId, amount: roundToTwoDecimals(amount), available_credit: 0 }) }] };
  }

  if (tool === "record_payment") {
    const invoiceId = String(args.invoice_id ?? "");
    const amountPaid = Number(args.amount_paid ?? 0);
    if (!invoiceId) return fail("VALIDATION_ERROR", "invoice_id is required.");
    if (!Number.isFinite(amountPaid) || amountPaid <= 0) return fail("VALIDATION_ERROR", "amount_paid must be greater than 0.");

    if (supabase) {
      const { data: invoice, error: invError } = await supabase
        .schema("credit_mcp")
        .from("credit_invoices")
        .select("invoice_id,facility_id,user_id,amount,status")
        .eq("invoice_id", invoiceId)
        .maybeSingle();
      if (invError) return fail("DB_ERROR", "Database operation failed");
      if (!invoice) return fail("NOT_FOUND", "Invoice not found.");
      if (invoice.status === "paid") return fail("ALREADY_PAID", "Invoice is already paid.");

      const paidAt = now();
      await supabase
        .schema("credit_mcp")
        .from("credit_invoices")
        .update({ status: "paid", paid_at: paidAt, amount_paid: roundToTwoDecimals(amountPaid) })
        .eq("invoice_id", invoiceId);

      const { data: facility } = await supabase
        .schema("credit_mcp")
        .from("credit_facilities")
        .select("facility_id,total_outstanding,credit_limit")
        .eq("facility_id", invoice.facility_id)
        .maybeSingle();

      if (facility) {
        const newOutstanding = roundToTwoDecimals(Math.max(0, Number(facility.total_outstanding) - amountPaid));
        const newAvailable = roundToTwoDecimals(Number(facility.credit_limit) - newOutstanding);
        await supabase
          .schema("credit_mcp")
          .from("credit_facilities")
          .update({ total_outstanding: newOutstanding, available_credit: newAvailable, updated_at: paidAt })
          .eq("facility_id", facility.facility_id);
      }

      await emitEvent("credit.payment.recorded", { invoice_id: invoiceId, user_id: invoice.user_id, amount_paid: amountPaid });
      return { content: [{ type: "text", text: ok({ invoice_id: invoiceId, status: "paid", amount_paid: roundToTwoDecimals(amountPaid) }) }] };
    }

    await emitEvent("credit.payment.recorded", { invoice_id: invoiceId, amount_paid: amountPaid });
    return { content: [{ type: "text", text: ok({ invoice_id: invoiceId, status: "paid", amount_paid: roundToTwoDecimals(amountPaid) }) }] };
  }

  if (tool === "get_credit_history") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");

    if (supabase) {
      const { data, error } = await supabase
        .schema("credit_mcp")
        .from("credit_score_history")
        .select("history_id,user_id,score,tier,factors,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ history: data ?? [], total: (data ?? []).length }) }] };
    }

    return { content: [{ type: "text", text: ok({ history: [], total: 0 }) }] };
  }

  if (tool === "freeze_facility") {
    const userId = String(args.user_id ?? "");
    const reason = String(args.reason ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    if (!reason) return fail("VALIDATION_ERROR", "reason is required.");

    if (supabase) {
      const { data: facility, error: facError } = await supabase
        .schema("credit_mcp")
        .from("credit_facilities")
        .select("facility_id,status")
        .eq("user_id", userId)
        .maybeSingle();
      if (facError) return fail("DB_ERROR", "Database operation failed");
      if (!facility) return fail("NOT_FOUND", "No credit facility found.");
      if (facility.status === "frozen") return fail("ALREADY_FROZEN", "Facility is already frozen.");

      const frozenAt = now();
      const { error } = await supabase
        .schema("credit_mcp")
        .from("credit_facilities")
        .update({ status: "frozen", frozen_at: frozenAt, freeze_reason: reason, updated_at: frozenAt })
        .eq("facility_id", facility.facility_id);
      if (error) return fail("DB_ERROR", "Database operation failed");

      await emitEvent("credit.facility.frozen", { user_id: userId, facility_id: facility.facility_id, reason });
      return { content: [{ type: "text", text: ok({ facility_id: facility.facility_id, status: "frozen", reason }) }] };
    }

    await emitEvent("credit.facility.frozen", { user_id: userId, reason });
    return { content: [{ type: "text", text: ok({ user_id: userId, status: "frozen", reason }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("credit", Number(process.env.MCP_HTTP_PORT ?? 4120));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
