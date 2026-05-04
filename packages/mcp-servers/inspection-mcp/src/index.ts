import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now , initSentry} from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "inspection-mcp";
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
    { name: "request_inspection", description: "Request inspection for order/listing", inputSchema: { type: "object", properties: { order_id: { type: "string" }, listing_id: { type: "string" }, requested_by: { type: "string" }, inspection_type: { type: "string" }, location: { type: "object" }, scheduled_at: { type: "string" } }, required: ["requested_by", "inspection_type", "location"] } },
    { name: "record_weight", description: "Record weight checkpoint", inputSchema: { type: "object", properties: { order_id: { type: "string" }, weight_point: { type: "string" }, weight_kg: { type: "number" }, recorded_by: { type: "string" }, scale_ticket_url: { type: "string" }, scale_certified: { type: "boolean" }, scale_certificate: { type: "string" } }, required: ["order_id", "weight_point", "weight_kg", "recorded_by"] } },
    { name: "complete_inspection", description: "Complete inspection and publish result", inputSchema: { type: "object", properties: { inspection_id: { type: "string" }, result: { type: "string" }, weight_actual_kg: { type: "number" }, deduction_amount: { type: "number" }, notes: { type: "string" } }, required: ["inspection_id", "result"] } },
    { name: "evaluate_discrepancy", description: "Compare expected and actual weights", inputSchema: { type: "object", properties: { order_id: { type: "string" }, expected_weight_kg: { type: "number" }, tolerance_pct: { type: "number" } }, required: ["order_id", "expected_weight_kg"] } },
    { name: "get_inspection", description: "Get inspection with related weight records", inputSchema: { type: "object", properties: { inspection_id: { type: "string" } }, required: ["inspection_id"] } },
    { name: "reconcile_weights", description: "Compare W1–W4 weight checkpoints for an order and compute net weight", inputSchema: { type: "object", properties: { order_id: { type: "string" } }, required: ["order_id"] } },
    { name: "list_inspections", description: "List inspections requested by the caller, assigned to them as inspector, or for an order they participate in. Optional status filter.", inputSchema: { type: "object", properties: { user_id: { type: "string" }, order_id: { type: "string" }, status: { type: "string" }, limit: { type: "number" } } } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }
  if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for inspection-mcp.");

  if (tool === "request_inspection") {
    const requestedBy = String(args._user_id ?? args.requested_by ?? "");
    const inspectionType = String(args.inspection_type ?? "");
    const location = args.location as Record<string, unknown> | undefined;
    if (!requestedBy || !inspectionType || !location) return fail("VALIDATION_ERROR", "requested_by, inspection_type, location are required.");

    // Verify requester is the buyer or seller of the associated order or listing owner.
    if (args.order_id) {
      const orderId = String(args.order_id);
      const { data: order, error: orderErr } = await supabase
        .schema("orders_mcp")
        .from("orders")
        .select("buyer_id,seller_id")
        .eq("order_id", orderId)
        .maybeSingle();
      if (orderErr) return fail("DB_ERROR", "Database operation failed");
      if (!order) return fail("NOT_FOUND", "Order not found.");
      if (order.buyer_id !== requestedBy && order.seller_id !== requestedBy) {
        return fail("FORBIDDEN", "Requester must be the buyer or seller of the order.");
      }
    } else if (args.listing_id) {
      const listingId = String(args.listing_id);
      const { data: listing, error: listingErr } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .select("seller_id")
        .eq("listing_id", listingId)
        .maybeSingle();
      if (listingErr) return fail("DB_ERROR", "Database operation failed");
      if (!listing) return fail("NOT_FOUND", "Listing not found.");
      if (listing.seller_id !== requestedBy) {
        return fail("FORBIDDEN", "Requester must be the listing owner.");
      }
    }

    const inspectionId = generateId();
    const insertResult = await supabase.schema("inspection_mcp").from("inspections").insert({
      inspection_id: inspectionId,
      listing_id: args.listing_id ? String(args.listing_id) : null,
      order_id: args.order_id ? String(args.order_id) : null,
      requested_by: requestedBy,
      inspection_type: inspectionType,
      location,
      scheduled_at: args.scheduled_at ? String(args.scheduled_at) : null,
      status: "requested",
      result: "pending",
      created_at: now(),
      updated_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");
    await emitEvent("inspection.inspection.requested", { inspection_id: inspectionId, order_id: args.order_id ? String(args.order_id) : null, listing_id: args.listing_id ? String(args.listing_id) : null });
    return { content: [{ type: "text", text: ok({ inspection_id: inspectionId, status: "requested" }) }] };
  }

  if (tool === "record_weight") {
    const orderId = String(args.order_id ?? "");
    const weightPoint = String(args.weight_point ?? "");
    const weightKg = Number(args.weight_kg ?? 0);
    const recordedBy = String(args.recorded_by ?? "");
    if (!orderId || !weightPoint || weightKg <= 0 || !recordedBy) return fail("VALIDATION_ERROR", "order_id, weight_point, weight_kg>0, recorded_by are required.");
    const recordId = generateId();
    const insertResult = await supabase.schema("inspection_mcp").from("weight_records").upsert({
      record_id: recordId,
      order_id: orderId,
      weight_point: weightPoint,
      weight_kg: weightKg,
      recorded_by: recordedBy,
      scale_ticket_url: args.scale_ticket_url ? String(args.scale_ticket_url) : null,
      scale_certified: Boolean(args.scale_certified ?? false),
      scale_certificate: args.scale_certificate ? String(args.scale_certificate) : null,
      recorded_at: now(),
    }, { onConflict: "order_id,weight_point" });
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");
    await emitEvent("inspection.weight.recorded", { order_id: orderId, weight_point: weightPoint, weight_kg: weightKg });
    return { content: [{ type: "text", text: ok({ order_id: orderId, weight_point: weightPoint, weight_kg: weightKg }) }] };
  }

  if (tool === "complete_inspection") {
    const inspectionId = String(args.inspection_id ?? "");
    const result = String(args.result ?? "");
    if (!inspectionId || !result) return fail("VALIDATION_ERROR", "inspection_id and result are required.");
    const updateResult = await supabase
      .schema("inspection_mcp")
      .from("inspections")
      .update({
        result,
        status: "completed",
        weight_actual_kg: typeof args.weight_actual_kg === "number" ? Number(args.weight_actual_kg) : null,
        deduction_amount: typeof args.deduction_amount === "number" ? Number(args.deduction_amount) : null,
        notes: args.notes ? String(args.notes) : null,
        completed_at: now(),
        updated_at: now(),
      })
      .eq("inspection_id", inspectionId);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");
    await emitEvent("inspection.inspection.completed", { inspection_id: inspectionId, result });
    return { content: [{ type: "text", text: ok({ inspection_id: inspectionId, status: "completed", result }) }] };
  }

  if (tool === "evaluate_discrepancy") {
    const orderId = String(args.order_id ?? "");
    const expectedWeight = Number(args.expected_weight_kg ?? 0);
    const tolerancePct = Number(args.tolerance_pct ?? 2);
    if (!orderId || expectedWeight <= 0) return fail("VALIDATION_ERROR", "order_id and expected_weight_kg>0 are required.");

    const weightsResult = await supabase
      .schema("inspection_mcp")
      .from("weight_records")
      .select("weight_point,weight_kg,recorded_at")
      .eq("order_id", orderId)
      .order("recorded_at", { ascending: false });
    if (weightsResult.error) return fail("DB_ERROR", "Database operation failed");
    const latest = weightsResult.data?.[0];
    if (!latest) return fail("NOT_FOUND", "No weight records for order_id.");
    const actualWeight = Number(latest.weight_kg ?? 0);
    const delta = actualWeight - expectedWeight;
    const deltaPct = (delta / expectedWeight) * 100;
    const exceeded = Math.abs(deltaPct) > tolerancePct;

    if (exceeded) {
      await emitEvent("inspection.discrepancy.detected", {
        order_id: orderId,
        expected_weight_kg: expectedWeight,
        actual_weight_kg: actualWeight,
        delta_pct: Number(deltaPct.toFixed(2)),
        suggested_control: "freeze_escrow_and_escalate",
      });
    }

    return {
      content: [
        {
          type: "text",
          text: ok({
            order_id: orderId,
            expected_weight_kg: expectedWeight,
            actual_weight_kg: actualWeight,
            delta_pct: Number(deltaPct.toFixed(2)),
            tolerance_pct: tolerancePct,
            exceeded_tolerance: exceeded,
          }),
        },
      ],
    };
  }

  if (tool === "get_inspection") {
    const inspectionId = String(args.inspection_id ?? "");
    if (!inspectionId) return fail("VALIDATION_ERROR", "inspection_id is required.");
    const inspection = await supabase.schema("inspection_mcp").from("inspections").select("*").eq("inspection_id", inspectionId).maybeSingle();
    if (inspection.error) return fail("DB_ERROR", "Database operation failed");
    if (!inspection.data) return fail("NOT_FOUND", "inspection_id not found");
    const orderId = inspection.data.order_id as string | null;
    const weights = orderId
      ? await supabase.schema("inspection_mcp").from("weight_records").select("*").eq("order_id", orderId).order("recorded_at", { ascending: true })
      : { data: [], error: null };
    if (weights.error) return fail("DB_ERROR", "Database operation failed");
    return { content: [{ type: "text", text: ok({ inspection: inspection.data, weight_records: weights.data ?? [] }) }] };
  }

  if (tool === "list_inspections") {
    const userId = args.user_id ? String(args.user_id) : "";
    const orderId = args.order_id ? String(args.order_id) : "";
    const statusFilter = args.status ? String(args.status) : "";
    const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);

    let query = supabase
      .schema("inspection_mcp")
      .from("inspections")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (orderId) {
      query = query.eq("order_id", orderId);
    } else if (userId) {
      query = query.or(`requested_by.eq.${userId},inspector_id.eq.${userId}`);
    }
    if (statusFilter) query = query.eq("status", statusFilter);

    const { data, error } = await query;
    if (error) return fail("DB_ERROR", "Database operation failed");
    return { content: [{ type: "text", text: ok({ inspections: data ?? [] }) }] };
  }

  if (tool === "reconcile_weights") {
    const orderId = String(args.order_id ?? "");
    if (!orderId) return fail("VALIDATION_ERROR", "order_id is required.");

    const weightsResult = await supabase
      .schema("inspection_mcp")
      .from("weight_records")
      .select("weight_point,weight_kg,scale_certified,recorded_at")
      .eq("order_id", orderId)
      .order("recorded_at", { ascending: true });
    if (weightsResult.error) return fail("DB_ERROR", "Database operation failed");

    const rows = (weightsResult.data ?? []) as Array<Record<string, unknown>>;
    const byPoint: Record<string, number> = {};
    for (const r of rows) {
      byPoint[String(r.weight_point)] = Number(r.weight_kg ?? 0);
    }

    // W1=origin tare, W2=origin gross, W3=destination gross, W4=destination tare.
    const w1 = byPoint["W1"] ?? null;
    const w2 = byPoint["W2"] ?? null;
    const w3 = byPoint["W3"] ?? null;
    const w4 = byPoint["W4"] ?? null;

    const originNet = w1 !== null && w2 !== null ? Number((w2 - w1).toFixed(3)) : null;
    const destinationNet = w3 !== null && w4 !== null ? Number((w3 - w4).toFixed(3)) : null;
    const discrepancyKg = originNet !== null && destinationNet !== null ? Number((destinationNet - originNet).toFixed(3)) : null;
    const discrepancyPct = originNet && originNet > 0 && discrepancyKg !== null ? Number(((discrepancyKg / originNet) * 100).toFixed(2)) : null;

    await emitEvent("inspection.weights.reconciled", { order_id: orderId, origin_net_kg: originNet, destination_net_kg: destinationNet, discrepancy_kg: discrepancyKg });
    return {
      content: [{
        type: "text",
        text: ok({ order_id: orderId, checkpoints: byPoint, origin_net_kg: originNet, destination_net_kg: destinationNet, discrepancy_kg: discrepancyKg, discrepancy_pct: discrepancyPct }),
      }],
    };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("inspection", Number(process.env.MCP_HTTP_PORT ?? 4111));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
