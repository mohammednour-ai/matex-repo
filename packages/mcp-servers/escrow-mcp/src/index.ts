import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { callServer, MatexEventBus, initSentry } from "@matex/utils";
import { generateId, now, roundToTwoDecimals, parsePlatformAdminRow } from "@matex/logic";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "escrow-mcp";
initSentry(SERVER_NAME);
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

async function isPlatformAdmin(userId: string): Promise<boolean> {
  if (!supabase || !userId) return false;
  const { data } = await supabase.schema("auth_mcp").from("users").select("is_platform_admin").eq("user_id", userId).maybeSingle();
  return parsePlatformAdminRow(data);
}

interface EscrowRow {
  buyer_id: string;
  seller_id: string;
  order_id: string;
  release_conditions: Record<string, unknown> | null;
}

/**
 * Evaluate release_conditions on an escrow before releasing funds.
 * Conditions are stored as JSONB on escrow_mcp.escrows.release_conditions, e.g.:
 *   { inspection_approved: true, delivery_confirmed: true, manual_approved: false }
 * For each truthy required condition, we verify it has actually happened by
 * querying the relevant MCP schema. Returns null on success or the unmet
 * condition name + reason on failure.
 */
async function evaluateReleaseConditions(escrow: EscrowRow): Promise<{ unmet: string; reason: string } | null> {
  const conditions = (escrow.release_conditions ?? {}) as Record<string, unknown>;
  if (!supabase || !conditions || Object.keys(conditions).length === 0) return null;
  const orderId = escrow.order_id;

  if (conditions.inspection_approved === true) {
    const { data, error } = await supabase
      .schema("inspection_mcp")
      .from("inspections")
      .select("inspection_id,result,status")
      .eq("order_id", orderId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { unmet: "inspection_approved", reason: "inspection lookup failed" };
    if (!data) return { unmet: "inspection_approved", reason: "no completed inspection found for order" };
    const result = String((data as { result?: string }).result ?? "");
    if (result !== "pass" && result !== "pass_with_deductions") {
      return { unmet: "inspection_approved", reason: `latest inspection result is '${result}'` };
    }
  }

  if (conditions.delivery_confirmed === true) {
    const { data, error } = await supabase
      .schema("logistics_mcp")
      .from("shipments")
      .select("shipment_id,status")
      .eq("order_id", orderId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { unmet: "delivery_confirmed", reason: "shipment lookup failed" };
    if (!data) return { unmet: "delivery_confirmed", reason: "no shipment found for order" };
    if (String((data as { status?: string }).status) !== "delivered") {
      return { unmet: "delivery_confirmed", reason: `shipment status is '${(data as { status?: string }).status}'` };
    }
  }

  if (conditions.manual_approved === true) {
    // Set to true on the JSONB itself once an authorized party signs off.
    if (conditions.manual_approved_at === undefined && conditions.manual_approved_by === undefined) {
      return { unmet: "manual_approved", reason: "no manual approval recorded on escrow" };
    }
  }

  if (conditions.order_completed === true) {
    const { data, error } = await supabase.schema("orders_mcp").from("orders").select("status").eq("order_id", orderId).maybeSingle();
    if (error) return { unmet: "order_completed", reason: "order lookup failed" };
    const orderStatus = String((data as { status?: string } | null)?.status ?? "");
    if (orderStatus !== "completed" && orderStatus !== "delivered" && orderStatus !== "inspected") {
      return { unmet: "order_completed", reason: `order status is '${orderStatus}'` };
    }
  }

  return null;
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "create_escrow", description: "Create escrow record", inputSchema: { type: "object", properties: { order_id: { type: "string" }, buyer_id: { type: "string" }, seller_id: { type: "string" }, amount: { type: "number" }, currency: { type: "string" } }, required: ["order_id", "buyer_id", "seller_id", "amount"] } },
    { name: "hold_funds", description: "Move escrow to funds_held", inputSchema: { type: "object", properties: { escrow_id: { type: "string" }, amount: { type: "number" }, performed_by: { type: "string" } }, required: ["escrow_id", "amount"] } },
    { name: "release_funds", description: "Release escrow funds (full or partial). Caller must be buyer/seller; admins may pass override_conditions.", inputSchema: { type: "object", properties: { escrow_id: { type: "string" }, amount: { type: "number" }, performed_by: { type: "string" }, reason: { type: "string" }, override_conditions: { type: "boolean" } }, required: ["escrow_id", "amount", "performed_by"] } },
    { name: "freeze_escrow", description: "Freeze escrow due to risk/dispute (buyer/seller/admin)", inputSchema: { type: "object", properties: { escrow_id: { type: "string" }, reason: { type: "string" }, performed_by: { type: "string" } }, required: ["escrow_id", "reason", "performed_by"] } },
    { name: "refund_escrow", description: "Refund held escrow amount (buyer/seller/admin)", inputSchema: { type: "object", properties: { escrow_id: { type: "string" }, amount: { type: "number" }, performed_by: { type: "string" }, reason: { type: "string" } }, required: ["escrow_id", "amount", "reason", "performed_by"] } },
    { name: "set_release_conditions", description: "Set/replace the release_conditions JSONB on an escrow. Buyer/seller/admin only.", inputSchema: { type: "object", properties: { escrow_id: { type: "string" }, performed_by: { type: "string" }, conditions: { type: "object" } }, required: ["escrow_id", "performed_by", "conditions"] } },
    { name: "approve_release_condition", description: "Manually approve a release_conditions entry (e.g. manual_approved). Buyer/seller/admin only.", inputSchema: { type: "object", properties: { escrow_id: { type: "string" }, performed_by: { type: "string" }, condition: { type: "string" } }, required: ["escrow_id", "performed_by", "condition"] } },
    { name: "get_escrow", description: "Get escrow + timeline", inputSchema: { type: "object", properties: { escrow_id: { type: "string" } }, required: ["escrow_id"] } },
    { name: "list_escrows", description: "List escrows the caller participates in (as buyer or seller). Admins may list all. Optional status filter.", inputSchema: { type: "object", properties: { user_id: { type: "string" }, status: { type: "string" }, limit: { type: "number" } }, required: ["user_id"] } },
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

  if (tool === "list_escrows") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    const statusFilter = args.status ? String(args.status) : "";
    const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);
    const isAdmin = await isPlatformAdmin(userId);
    let query = supabase.schema("escrow_mcp").from("escrows").select("*").order("created_at", { ascending: false }).limit(limit);
    if (!isAdmin) query = query.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
    if (statusFilter) query = query.eq("status", statusFilter);
    const { data, error } = await query;
    if (error) return fail("DB_ERROR", "Database operation failed");
    return { content: [{ type: "text", text: ok({ escrows: data ?? [] }) }] };
  }

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
    const performedBy = args.performed_by ? String(args.performed_by) : "";
    if (!performedBy) return fail("VALIDATION_ERROR", "performed_by is required.");
    const isParty = performedBy === escrow.buyer_id || performedBy === escrow.seller_id;
    const overrideConditions = Boolean(args.override_conditions);
    const isAdmin = !isParty || overrideConditions ? await isPlatformAdmin(performedBy) : false;
    if (!isParty && !isAdmin) return fail("FORBIDDEN", "Only the buyer, seller, or a platform admin may release escrow funds.");
    if (overrideConditions && !isAdmin) return fail("FORBIDDEN", "Only platform admins may override release_conditions.");

    if (!overrideConditions) {
      const unmet = await evaluateReleaseConditions(escrow as EscrowRow);
      if (unmet) {
        return fail("RELEASE_CONDITIONS_UNMET", `Release condition '${unmet.unmet}' not satisfied: ${unmet.reason}.`);
      }
    }

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
    await appendTimeline(escrowId, nextStatus === "released" ? "released" : "partial_release", amount, performedBy, args.reason ? String(args.reason) : null, { override_conditions: overrideConditions });
    await emitEvent("escrow.funds.released", { escrow_id: escrowId, amount, status: nextStatus, performed_by: performedBy });
    return { content: [{ type: "text", text: ok({ escrow_id: escrowId, status: nextStatus, held_amount: nextHeld, released_amount: nextReleased }) }] };
  }

  if (tool === "freeze_escrow") {
    if (!canTransition(status, tool)) return fail("INVALID_TRANSITION", `Cannot freeze_escrow from status ${status}`);
    const reason = String(args.reason ?? "");
    if (!reason) return fail("VALIDATION_ERROR", "reason is required.");
    const performedBy = args.performed_by ? String(args.performed_by) : "";
    if (!performedBy) return fail("VALIDATION_ERROR", "performed_by is required.");
    const isParty = performedBy === escrow.buyer_id || performedBy === escrow.seller_id;
    if (!isParty && !(await isPlatformAdmin(performedBy))) {
      return fail("FORBIDDEN", "Only the buyer, seller, or a platform admin may freeze escrow.");
    }
    const updateResult = await supabase
      .schema("escrow_mcp")
      .from("escrows")
      .update({ status: "frozen", frozen_reason: reason, frozen_by: performedBy, frozen_at: now(), updated_at: now() })
      .eq("escrow_id", escrowId);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");
    await appendTimeline(escrowId, "frozen", null, performedBy, reason, {});
    await emitEvent("escrow.escrow.frozen", { escrow_id: escrowId, reason, performed_by: performedBy });
    return { content: [{ type: "text", text: ok({ escrow_id: escrowId, status: "frozen", reason }) }] };
  }

  if (tool === "refund_escrow") {
    if (!canTransition(status, tool)) return fail("INVALID_TRANSITION", `Cannot refund_escrow from status ${status}`);
    const amount = Number(args.amount ?? 0);
    const reason = String(args.reason ?? "");
    if (amount <= 0 || !reason) return fail("VALIDATION_ERROR", "amount>0 and reason are required.");
    const performedBy = args.performed_by ? String(args.performed_by) : "";
    if (!performedBy) return fail("VALIDATION_ERROR", "performed_by is required.");
    const isParty = performedBy === escrow.buyer_id || performedBy === escrow.seller_id;
    if (!isParty && !(await isPlatformAdmin(performedBy))) {
      return fail("FORBIDDEN", "Only the buyer, seller, or a platform admin may refund escrow.");
    }
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
    await appendTimeline(escrowId, "refunded", amount, performedBy, reason, {});
    await emitEvent("escrow.funds.refunded", { escrow_id: escrowId, amount, reason, performed_by: performedBy });
    return { content: [{ type: "text", text: ok({ escrow_id: escrowId, status: nextStatus, held_amount: nextHeld, refunded_amount: nextRefunded }) }] };
  }

  if (tool === "set_release_conditions") {
    const performedBy = args.performed_by ? String(args.performed_by) : "";
    const conditions = (args.conditions ?? {}) as Record<string, unknown>;
    if (!performedBy) return fail("VALIDATION_ERROR", "performed_by is required.");
    if (typeof conditions !== "object" || conditions === null) return fail("VALIDATION_ERROR", "conditions must be an object.");
    const isParty = performedBy === escrow.buyer_id || performedBy === escrow.seller_id;
    if (!isParty && !(await isPlatformAdmin(performedBy))) {
      return fail("FORBIDDEN", "Only the buyer, seller, or a platform admin may set release conditions.");
    }
    const { error } = await supabase
      .schema("escrow_mcp")
      .from("escrows")
      .update({ release_conditions: conditions, updated_at: now() })
      .eq("escrow_id", escrowId);
    if (error) return fail("DB_ERROR", "Database operation failed");
    await appendTimeline(escrowId, "conditions_set", null, performedBy, null, { conditions });
    await emitEvent("escrow.conditions.set", { escrow_id: escrowId, performed_by: performedBy });
    return { content: [{ type: "text", text: ok({ escrow_id: escrowId, release_conditions: conditions }) }] };
  }

  if (tool === "approve_release_condition") {
    const performedBy = args.performed_by ? String(args.performed_by) : "";
    const condition = String(args.condition ?? "");
    if (!performedBy || !condition) return fail("VALIDATION_ERROR", "performed_by and condition are required.");
    const isParty = performedBy === escrow.buyer_id || performedBy === escrow.seller_id;
    if (!isParty && !(await isPlatformAdmin(performedBy))) {
      return fail("FORBIDDEN", "Only the buyer, seller, or a platform admin may approve release conditions.");
    }
    const current = (escrow.release_conditions ?? {}) as Record<string, unknown>;
    const next = {
      ...current,
      [condition]: true,
      [`${condition}_at`]: now(),
      [`${condition}_by`]: performedBy,
    };
    const { error } = await supabase
      .schema("escrow_mcp")
      .from("escrows")
      .update({ release_conditions: next, updated_at: now() })
      .eq("escrow_id", escrowId);
    if (error) return fail("DB_ERROR", "Database operation failed");
    await appendTimeline(escrowId, "condition_approved", null, performedBy, condition, {});
    await emitEvent("escrow.condition.approved", { escrow_id: escrowId, condition, performed_by: performedBy });
    return { content: [{ type: "text", text: ok({ escrow_id: escrowId, release_conditions: next }) }] };
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
