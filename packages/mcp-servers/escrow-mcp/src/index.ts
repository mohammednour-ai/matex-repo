import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { callServer, generateId, MatexEventBus, now, roundToTwoDecimals } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "escrow-mcp";
const SERVER_VERSION = "0.1.0";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;
const eventBus = EVENT_REDIS_URL ? new MatexEventBus({ redisUrl: EVENT_REDIS_URL }) : null;

type EscrowStatus = "created" | "funds_held" | "partially_released" | "released" | "frozen" | "refunded" | "cancelled";

function ok(data: Record<string, unknown>): string {
  return JSON.stringify({ success: true, data });
}

function fail(code: string, message: string): { isError: true; content: Array<{ type: "text"; text: string }> } {
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: { code, message } }) }] };
}

function canTransition(from: EscrowStatus, action: string): boolean {
  const map: Record<string, EscrowStatus[]> = {
    hold_funds: ["created"],
    release_funds: ["funds_held", "partially_released"],
    freeze_escrow: ["funds_held", "partially_released"],
    refund_escrow: ["funds_held", "partially_released", "frozen"],
  };
  return (map[action] ?? []).includes(from);
}

async function emitEvent(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!eventBus) return;
  try {
    await eventBus.publish(event, payload, SERVER_NAME);
  } catch {
    // non-blocking
  }
}

async function notifyParties(escrowId: string, action: string, amount: number | null): Promise<void> {
  callServer("notifications.send_notification", {
    user_id: escrowId,
    type: `escrow.${action}`,
    title: `Escrow ${action}`,
    body: `Escrow ${escrowId} ${action}${amount ? ` ($${amount})` : ""}`,
    channels: ["in_app"],
    priority: action === "frozen" ? "high" : "normal",
  }).catch(() => {});
}

async function appendTimeline(
  escrowId: string,
  action: string,
  amount: number | null,
  performedBy: string | null,
  reason: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (!supabase) return;
  await supabase.schema("escrow_mcp").from("escrow_timeline").insert({
    event_id: generateId(),
    escrow_id: escrowId,
    action,
    amount,
    performed_by: performedBy,
    reason,
    metadata,
    created_at: now(),
  });
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "create_escrow", description: "Create escrow record", inputSchema: { type: "object", properties: { order_id: { type: "string" }, buyer_id: { type: "string" }, seller_id: { type: "string" }, amount: { type: "number" }, currency: { type: "string" } }, required: ["order_id", "buyer_id", "seller_id", "amount"] } },
    { name: "hold_funds", description: "Move escrow to funds_held", inputSchema: { type: "object", properties: { escrow_id: { type: "string" }, amount: { type: "number" }, performed_by: { type: "string" } }, required: ["escrow_id", "amount"] } },
    { name: "release_funds", description: "Release escrow funds (full or partial)", inputSchema: { type: "object", properties: { escrow_id: { type: "string" }, amount: { type: "number" }, performed_by: { type: "string" }, reason: { type: "string" } }, required: ["escrow_id", "amount"] } },
    { name: "freeze_escrow", description: "Freeze escrow due to risk/dispute", inputSchema: { type: "object", properties: { escrow_id: { type: "string" }, reason: { type: "string" }, performed_by: { type: "string" } }, required: ["escrow_id", "reason"] } },
    { name: "refund_escrow", description: "Refund held escrow amount", inputSchema: { type: "object", properties: { escrow_id: { type: "string" }, amount: { type: "number" }, performed_by: { type: "string" }, reason: { type: "string" } }, required: ["escrow_id", "amount", "reason"] } },
    { name: "get_escrow", description: "Get escrow + timeline", inputSchema: { type: "object", properties: { escrow_id: { type: "string" } }, required: ["escrow_id"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }
  if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for escrow-mcp.");

  if (tool === "create_escrow") {
    const orderId = String(args.order_id ?? "");
    const buyerId = String(args.buyer_id ?? "");
    const sellerId = String(args.seller_id ?? "");
    const amount = Number(args.amount ?? 0);
    const currency = String(args.currency ?? "CAD");
    if (!orderId || !buyerId || !sellerId || amount <= 0) return fail("VALIDATION_ERROR", "order_id, buyer_id, seller_id, amount>0 are required.");
    const escrowId = generateId();
    const createdAt = now();
    const createResult = await supabase.schema("escrow_mcp").from("escrows").insert({
      escrow_id: escrowId,
      order_id: orderId,
      buyer_id: buyerId,
      seller_id: sellerId,
      original_amount: amount,
      held_amount: 0,
      released_amount: 0,
      refunded_amount: 0,
      currency,
      status: "created",
      created_at: createdAt,
      updated_at: createdAt,
    });
    if (createResult.error) return fail("DB_ERROR", "Database operation failed");
    await appendTimeline(escrowId, "created", amount, null, null, { currency });
    await emitEvent("escrow.escrow.created", { escrow_id: escrowId, order_id: orderId, amount });
    return { content: [{ type: "text", text: ok({ escrow_id: escrowId, status: "created" }) }] };
  }

  const escrowId = String(args.escrow_id ?? "");
  if (!escrowId) return fail("VALIDATION_ERROR", "escrow_id is required.");

  const escrowResult = await supabase
    .schema("escrow_mcp")
    .from("escrows")
    .select("*")
    .eq("escrow_id", escrowId)
    .maybeSingle();
  if (escrowResult.error) return fail("DB_ERROR", "Database operation failed");
  const escrow = escrowResult.data;
  if (!escrow) return fail("NOT_FOUND", "escrow_id not found");
  const status = String(escrow.status) as EscrowStatus;

  if (tool === "hold_funds") {
    if (!canTransition(status, tool)) return fail("INVALID_TRANSITION", `Cannot hold_funds from status ${status}`);
    const amount = Number(args.amount ?? 0);
    if (amount <= 0) return fail("VALIDATION_ERROR", "amount must be > 0.");
    const heldAmount = roundToTwoDecimals(Number(escrow.held_amount ?? 0) + amount);
    const updateResult = await supabase
      .schema("escrow_mcp")
      .from("escrows")
      .update({ status: "funds_held", held_amount: heldAmount, updated_at: now() })
      .eq("escrow_id", escrowId)
      .eq("status", status);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");
    await appendTimeline(escrowId, "funds_held", amount, args.performed_by ? String(args.performed_by) : null, null, {});
    await emitEvent("escrow.funds.held", { escrow_id: escrowId, amount });
    return { content: [{ type: "text", text: ok({ escrow_id: escrowId, status: "funds_held", held_amount: heldAmount }) }] };
  }

  if (tool === "release_funds") {
    if (!canTransition(status, tool)) return fail("INVALID_TRANSITION", `Cannot release_funds from status ${status}`);
    const amount = Number(args.amount ?? 0);
    if (amount <= 0) return fail("VALIDATION_ERROR", "amount must be > 0.");
    const heldAmount = Number(escrow.held_amount ?? 0);
    const releasedAmount = Number(escrow.released_amount ?? 0);
    if (amount > heldAmount) return fail("VALIDATION_ERROR", "Release amount exceeds held_amount.");
    const nextHeld = roundToTwoDecimals(heldAmount - amount);
    const nextReleased = roundToTwoDecimals(releasedAmount + amount);
    const nextStatus: EscrowStatus = nextHeld <= 0 ? "released" : "partially_released";
    const updateResult = await supabase
      .schema("escrow_mcp")
      .from("escrows")
      .update({
        status: nextStatus,
        held_amount: nextHeld,
        released_amount: nextReleased,
        released_at: nextStatus === "released" ? now() : null,
        updated_at: now(),
      })
      .eq("escrow_id", escrowId)
      .eq("held_amount", escrow.held_amount);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");
    await appendTimeline(escrowId, nextStatus === "released" ? "released" : "partial_release", amount, args.performed_by ? String(args.performed_by) : null, args.reason ? String(args.reason) : null, {});
    await emitEvent("escrow.funds.released", { escrow_id: escrowId, amount, status: nextStatus, performed_by: args.performed_by ? String(args.performed_by) : null });
    return { content: [{ type: "text", text: ok({ escrow_id: escrowId, status: nextStatus, held_amount: nextHeld, released_amount: nextReleased }) }] };
  }

  if (tool === "freeze_escrow") {
    if (!canTransition(status, tool)) return fail("INVALID_TRANSITION", `Cannot freeze_escrow from status ${status}`);
    const reason = String(args.reason ?? "");
    if (!reason) return fail("VALIDATION_ERROR", "reason is required.");
    const updateResult = await supabase
      .schema("escrow_mcp")
      .from("escrows")
      .update({ status: "frozen", frozen_reason: reason, frozen_by: args.performed_by ? String(args.performed_by) : null, frozen_at: now(), updated_at: now() })
      .eq("escrow_id", escrowId);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");
    await appendTimeline(escrowId, "frozen", null, args.performed_by ? String(args.performed_by) : null, reason, {});
    await emitEvent("escrow.escrow.frozen", { escrow_id: escrowId, reason });
    return { content: [{ type: "text", text: ok({ escrow_id: escrowId, status: "frozen", reason }) }] };
  }

  if (tool === "refund_escrow") {
    if (!canTransition(status, tool)) return fail("INVALID_TRANSITION", `Cannot refund_escrow from status ${status}`);
    const amount = Number(args.amount ?? 0);
    const reason = String(args.reason ?? "");
    if (amount <= 0 || !reason) return fail("VALIDATION_ERROR", "amount>0 and reason are required.");
    const heldAmount = Number(escrow.held_amount ?? 0);
    const refundedAmount = Number(escrow.refunded_amount ?? 0);
    const originalAmount = Number(escrow.original_amount ?? 0);
    if (amount > heldAmount) return fail("VALIDATION_ERROR", "Refund amount exceeds held_amount.");
    if (refundedAmount + amount > originalAmount) return fail("VALIDATION_ERROR", "Total refunds would exceed original_amount.");
    const nextHeld = roundToTwoDecimals(heldAmount - amount);
    const nextRefunded = roundToTwoDecimals(refundedAmount + amount);
    const nextStatus: EscrowStatus = "refunded";
    const updateResult = await supabase
      .schema("escrow_mcp")
      .from("escrows")
      .update({
        status: nextStatus,
        held_amount: nextHeld,
        refunded_amount: nextRefunded,
        refunded_at: now(),
        updated_at: now(),
      })
      .eq("escrow_id", escrowId);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");
    await appendTimeline(escrowId, "refunded", amount, args.performed_by ? String(args.performed_by) : null, reason, {});
    await emitEvent("escrow.funds.refunded", { escrow_id: escrowId, amount, reason });
    return { content: [{ type: "text", text: ok({ escrow_id: escrowId, status: nextStatus, held_amount: nextHeld, refunded_amount: nextRefunded }) }] };
  }

  if (tool === "get_escrow") {
    const timeline = await supabase
      .schema("escrow_mcp")
      .from("escrow_timeline")
      .select("*")
      .eq("escrow_id", escrowId)
      .order("created_at", { ascending: true });
    if (timeline.error) return fail("DB_ERROR", "Database operation failed");
    return { content: [{ type: "text", text: ok({ escrow, timeline: timeline.data ?? [] }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("escrow", Number(process.env.MCP_HTTP_PORT ?? 4108));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
