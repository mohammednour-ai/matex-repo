import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { getPlatformConfigNumber, initSentry, MatexEventBus } from "@matex/utils";
import { calculateCommission, generateId, now, roundToTwoDecimals } from "@matex/logic";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "orders-mcp";
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

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "disputed"]);
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled", "disputed"],
  shipped: ["delivered", "disputed"],
  delivered: ["inspected", "completed", "disputed"],
  inspected: ["completed", "disputed"],
  disputed: ["completed", "cancelled"],
};

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
    // non-blocking
  }
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_order",
      description: "Create an order from a listing (optionally referencing a winning bid or contract).",
      inputSchema: {
        type: "object",
        properties: {
          listing_id: { type: "string" },
          buyer_id: { type: "string" },
          seller_id: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          original_amount: { type: "number" },
          bid_id: { type: "string" },
          contract_id: { type: "string" },
          payment_method: { type: "string" },
          down_payment_pct: { type: "number" },
          inspection_window_hours: { type: "number" },
          weight_tolerance_pct: { type: "number" },
          notes: { type: "string" },
        },
        required: ["listing_id", "buyer_id", "seller_id", "quantity", "unit", "original_amount"],
      },
    },
    {
      name: "get_order",
      description: "Get an order by id.",
      inputSchema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] },
    },
    {
      name: "list_orders",
      description: "List orders filtered by buyer or seller, with optional status filter and pagination.",
      inputSchema: {
        type: "object",
        properties: {
          buyer_id: { type: "string" },
          seller_id: { type: "string" },
          status: { type: "string" },
          limit: { type: "number" },
          offset: { type: "number" },
        },
      },
    },
    {
      name: "update_order_status",
      description: "Transition an order between lifecycle states (pending → confirmed → shipped → delivered → inspected → completed). Caller must be buyer or seller.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          actor_id: { type: "string" },
          status: { type: "string" },
          adjusted_amount: { type: "number" },
          final_amount: { type: "number" },
          notes: { type: "string" },
        },
        required: ["order_id", "actor_id", "status"],
      },
    },
    {
      name: "cancel_order",
      description: "Cancel an order. Only the buyer or seller may cancel, and only before shipped.",
      inputSchema: {
        type: "object",
        properties: { order_id: { type: "string" }, actor_id: { type: "string" }, reason: { type: "string" } },
        required: ["order_id", "actor_id", "reason"],
      },
    },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }
  if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for orders-mcp.");

  if (tool === "create_order") {
    const listingId = String(args.listing_id ?? "");
    const buyerId = String(args.buyer_id ?? "");
    const sellerId = String(args.seller_id ?? "");
    const quantity = Number(args.quantity ?? 0);
    const unit = String(args.unit ?? "");
    const originalAmount = Number(args.original_amount ?? 0);
    if (!listingId || !buyerId || !sellerId || !unit) return fail("VALIDATION_ERROR", "listing_id, buyer_id, seller_id, unit are required.");
    if (quantity <= 0) return fail("VALIDATION_ERROR", "quantity must be > 0.");
    if (originalAmount <= 0) return fail("VALIDATION_ERROR", "original_amount must be > 0.");
    if (buyerId === sellerId) return fail("VALIDATION_ERROR", "buyer_id and seller_id must differ.");

    // Ensure listing exists, is active, and belongs to the declared seller.
    const listingResult = await supabase
      .schema("listing_mcp")
      .from("listings")
      .select("listing_id,seller_id,status,unit")
      .eq("listing_id", listingId)
      .maybeSingle();
    if (listingResult.error) return fail("DB_ERROR", "Database operation failed");
    if (!listingResult.data) return fail("NOT_FOUND", "Listing not found.");
    if (listingResult.data.seller_id !== sellerId) return fail("FORBIDDEN", "seller_id does not match listing owner.");
    if (listingResult.data.status !== "active") return fail("INVALID_STATE", `Listing is not active (status: ${listingResult.data.status}).`);

    const commissionRate = await getPlatformConfigNumber(supabase, "commission_rate", 0.035, (n) => n > 0 && n < 1);
    const commissionAmount = calculateCommission(originalAmount, { rate: commissionRate, minimum: 25, cap: 5000 });

    const orderId = generateId();
    const createdAt = now();
    const insertResult = await supabase.schema("orders_mcp").from("orders").insert({
      order_id: orderId,
      listing_id: listingId,
      buyer_id: buyerId,
      seller_id: sellerId,
      bid_id: args.bid_id ? String(args.bid_id) : null,
      contract_id: args.contract_id ? String(args.contract_id) : null,
      original_amount: originalAmount,
      quantity,
      unit,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      currency: "CAD",
      payment_method: args.payment_method ? String(args.payment_method) : null,
      down_payment_pct: args.down_payment_pct !== undefined ? Number(args.down_payment_pct) : null,
      inspection_window_hours: args.inspection_window_hours !== undefined ? Number(args.inspection_window_hours) : 72,
      weight_tolerance_pct: args.weight_tolerance_pct !== undefined ? Number(args.weight_tolerance_pct) : 2.0,
      status: "pending",
      notes: args.notes ? String(args.notes) : null,
      created_at: createdAt,
      updated_at: createdAt,
    });
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("orders.order.created", {
      order_id: orderId,
      listing_id: listingId,
      buyer_id: buyerId,
      seller_id: sellerId,
      original_amount: originalAmount,
      commission_amount: commissionAmount,
    });
    return {
      content: [
        {
          type: "text",
          text: ok({
            order_id: orderId,
            status: "pending",
            commission_rate: commissionRate,
            commission_amount: commissionAmount,
          }),
        },
      ],
    };
  }

  if (tool === "get_order") {
    const orderId = String(args.order_id ?? "");
    if (!orderId) return fail("VALIDATION_ERROR", "order_id is required.");
    const { data, error } = await supabase.schema("orders_mcp").from("orders").select("*").eq("order_id", orderId).maybeSingle();
    if (error) return fail("DB_ERROR", "Database operation failed");
    if (!data) return fail("NOT_FOUND", "Order not found.");
    return { content: [{ type: "text", text: ok({ order: data }) }] };
  }

  if (tool === "list_orders") {
    const buyerId = args.buyer_id ? String(args.buyer_id) : null;
    const sellerId = args.seller_id ? String(args.seller_id) : null;
    const statusFilter = args.status ? String(args.status) : null;
    const limit = Math.min(Number(args.limit ?? 50), 100);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    if (!buyerId && !sellerId) return fail("VALIDATION_ERROR", "buyer_id or seller_id is required.");

    let query = supabase
      .schema("orders_mcp")
      .from("orders")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (buyerId) query = query.eq("buyer_id", buyerId);
    if (sellerId) query = query.eq("seller_id", sellerId);
    if (statusFilter) query = query.eq("status", statusFilter);
    const { data, error, count } = await query;
    if (error) return fail("DB_ERROR", "Database operation failed");
    return { content: [{ type: "text", text: ok({ orders: data ?? [], total: count ?? 0, limit, offset }) }] };
  }

  if (tool === "update_order_status") {
    const orderId = String(args.order_id ?? "");
    const actorId = String(args.actor_id ?? "");
    const nextStatus = String(args.status ?? "");
    if (!orderId || !actorId || !nextStatus) return fail("VALIDATION_ERROR", "order_id, actor_id, status are required.");

    const orderResult = await supabase
      .schema("orders_mcp")
      .from("orders")
      .select("buyer_id,seller_id,status")
      .eq("order_id", orderId)
      .maybeSingle();
    if (orderResult.error) return fail("DB_ERROR", "Database operation failed");
    if (!orderResult.data) return fail("NOT_FOUND", "Order not found.");
    const { buyer_id, seller_id, status: currentStatus } = orderResult.data as { buyer_id: string; seller_id: string; status: string };
    if (actorId !== buyer_id && actorId !== seller_id) return fail("FORBIDDEN", "Only the buyer or seller may update this order.");
    if (TERMINAL_STATUSES.has(currentStatus)) return fail("INVALID_STATE", `Order is in terminal status: ${currentStatus}.`);
    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(nextStatus)) {
      return fail("INVALID_TRANSITION", `Cannot transition from '${currentStatus}' to '${nextStatus}'.`);
    }

    const update: Record<string, unknown> = { status: nextStatus, updated_at: now() };
    if (nextStatus === "confirmed") update.confirmed_at = now();
    if (nextStatus === "shipped") update.shipped_at = now();
    if (nextStatus === "delivered") update.delivered_at = now();
    if (nextStatus === "completed") update.completed_at = now();
    if (args.adjusted_amount !== undefined) update.adjusted_amount = roundToTwoDecimals(Number(args.adjusted_amount));
    if (args.final_amount !== undefined) update.final_amount = roundToTwoDecimals(Number(args.final_amount));
    if (args.notes !== undefined) update.notes = String(args.notes);

    // Optimistic concurrency: only update if status hasn't changed since we read it.
    const updateResult = await supabase
      .schema("orders_mcp")
      .from("orders")
      .update(update)
      .eq("order_id", orderId)
      .eq("status", currentStatus);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent(`orders.order.${nextStatus}`, { order_id: orderId, actor_id: actorId, from: currentStatus, to: nextStatus });
    return { content: [{ type: "text", text: ok({ order_id: orderId, status: nextStatus, previous_status: currentStatus }) }] };
  }

  if (tool === "cancel_order") {
    const orderId = String(args.order_id ?? "");
    const actorId = String(args.actor_id ?? "");
    const reason = String(args.reason ?? "");
    if (!orderId || !actorId || !reason) return fail("VALIDATION_ERROR", "order_id, actor_id, reason are required.");

    const orderResult = await supabase
      .schema("orders_mcp")
      .from("orders")
      .select("buyer_id,seller_id,status")
      .eq("order_id", orderId)
      .maybeSingle();
    if (orderResult.error) return fail("DB_ERROR", "Database operation failed");
    if (!orderResult.data) return fail("NOT_FOUND", "Order not found.");
    const { buyer_id, seller_id, status: currentStatus } = orderResult.data as { buyer_id: string; seller_id: string; status: string };
    if (actorId !== buyer_id && actorId !== seller_id) return fail("FORBIDDEN", "Only the buyer or seller may cancel this order.");
    if (currentStatus !== "pending" && currentStatus !== "confirmed") {
      return fail("INVALID_STATE", `Cannot cancel order in status '${currentStatus}'. Use disputes once shipped.`);
    }

    const updateResult = await supabase
      .schema("orders_mcp")
      .from("orders")
      .update({ status: "cancelled", notes: reason, updated_at: now() })
      .eq("order_id", orderId)
      .eq("status", currentStatus);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("orders.order.cancelled", { order_id: orderId, actor_id: actorId, reason });
    return { content: [{ type: "text", text: ok({ order_id: orderId, status: "cancelled", reason }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("orders", Number(process.env.MCP_HTTP_PORT ?? 4123));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
