import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { callServer, generateId, MatexEventBus, now } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "logistics-mcp";
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
    { name: "get_quotes", description: "Request shipping quotes from multiple carriers", inputSchema: { type: "object", properties: { order_id: { type: "string" }, origin: { type: "object" }, destination: { type: "object" }, weight_kg: { type: "number" }, dimensions: { type: "object" }, hazmat_class: { type: "string" }, requested_by: { type: "string" } }, required: ["order_id", "origin", "destination", "weight_kg", "requested_by"] } },
    { name: "book_shipment", description: "Select a carrier quote and book the shipment", inputSchema: { type: "object", properties: { order_id: { type: "string" }, quote_id: { type: "string" }, carrier_name: { type: "string" }, booked_by: { type: "string" } }, required: ["order_id", "quote_id", "carrier_name", "booked_by"] } },
    { name: "update_tracking", description: "Update shipment status and tracking info", inputSchema: { type: "object", properties: { shipment_id: { type: "string" }, status: { type: "string" }, tracking_number: { type: "string" }, location: { type: "object" }, notes: { type: "string" } }, required: ["shipment_id", "status"] } },
    { name: "get_shipment", description: "Get shipment details with associated quotes", inputSchema: { type: "object", properties: { shipment_id: { type: "string" }, order_id: { type: "string" } }, required: [] } },
    { name: "generate_bol", description: "Generate a Bill of Lading document reference", inputSchema: { type: "object", properties: { shipment_id: { type: "string" } }, required: ["shipment_id"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }
  if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for logistics-mcp.");

  if (tool === "get_quotes") {
    const orderId = String(args.order_id ?? "");
    const origin = args.origin as Record<string, unknown> | undefined;
    const destination = args.destination as Record<string, unknown> | undefined;
    const weightKg = Number(args.weight_kg ?? 0);
    const requestedBy = String(args.requested_by ?? "");
    if (!orderId || !origin || !destination || weightKg <= 0 || !requestedBy) return fail("VALIDATION_ERROR", "order_id, origin, destination, weight_kg>0, requested_by are required.");

    const carriers = ["Day & Ross", "Manitoulin Transport", "Purolator Freight", "GoFor Industries", "Canada Cartage"];
    // Prices are placeholder estimates until carrier API integration is complete.
    const quotes = carriers.map((carrier) => ({
      quote_id: generateId(),
      order_id: orderId,
      carrier_name: carrier,
      price_cad: Number((Math.random() * 2000 + 200).toFixed(2)),
      transit_days: Math.floor(Math.random() * 5) + 1,
      co2_emissions_kg: Number((weightKg * 0.05 * (Math.random() + 0.5)).toFixed(2)),
      valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      created_at: now(),
      is_estimated: true,
      estimated_note: "Estimated price only. Contact carrier for binding quote.",
    }));

    for (const q of quotes) {
      await supabase.schema("logistics_mcp").from("shipping_quotes").insert(q);
    }

    await emitEvent("logistics.quotes.requested", { order_id: orderId, carrier_count: carriers.length });
    return { content: [{ type: "text", text: ok({ order_id: orderId, quotes }) }] };
  }

  if (tool === "book_shipment") {
    const orderId = String(args.order_id ?? "");
    const quoteId = String(args.quote_id ?? "");
    const carrierName = String(args.carrier_name ?? "");
    const bookedBy = String(args.booked_by ?? "");
    if (!orderId || !quoteId || !carrierName || !bookedBy) return fail("VALIDATION_ERROR", "order_id, quote_id, carrier_name, booked_by are required.");

    const shipmentId = generateId();
    const insertResult = await supabase.schema("logistics_mcp").from("shipments").insert({
      shipment_id: shipmentId,
      order_id: orderId,
      quote_id: quoteId,
      carrier_name: carrierName,
      status: "booked",
      booked_by: bookedBy,
      hazmat_class: args.hazmat_class ? String(args.hazmat_class) : "none",
      created_at: now(),
      updated_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", insertResult.error.message);

    await emitEvent("logistics.shipment.booked", { shipment_id: shipmentId, order_id: orderId, carrier_name: carrierName });
    return { content: [{ type: "text", text: ok({ shipment_id: shipmentId, order_id: orderId, carrier_name: carrierName, status: "booked" }) }] };
  }

  if (tool === "update_tracking") {
    const shipmentId = String(args.shipment_id ?? "");
    const status = String(args.status ?? "");
    if (!shipmentId || !status) return fail("VALIDATION_ERROR", "shipment_id and status are required.");

    const updatePayload: Record<string, unknown> = { status, updated_at: now() };
    if (args.tracking_number) updatePayload.tracking_number = String(args.tracking_number);
    if (args.location) updatePayload.current_location = args.location;
    if (args.notes) updatePayload.notes = String(args.notes);
    if (status === "delivered") updatePayload.delivered_at = now();

    const updateResult = await supabase.schema("logistics_mcp").from("shipments").update(updatePayload).eq("shipment_id", shipmentId);
    if (updateResult.error) return fail("DB_ERROR", updateResult.error.message);

    const eventName = status === "delivered" ? "logistics.shipment.delivered" : status === "picked_up" ? "logistics.shipment.picked_up" : "logistics.shipment.updated";
    await emitEvent(eventName, { shipment_id: shipmentId, status });
    return { content: [{ type: "text", text: ok({ shipment_id: shipmentId, status }) }] };
  }

  if (tool === "get_shipment") {
    const shipmentId = args.shipment_id ? String(args.shipment_id) : null;
    const orderId = args.order_id ? String(args.order_id) : null;
    if (!shipmentId && !orderId) return fail("VALIDATION_ERROR", "shipment_id or order_id is required.");

    let query = supabase.schema("logistics_mcp").from("shipments").select("*");
    if (shipmentId) query = query.eq("shipment_id", shipmentId);
    else if (orderId) query = query.eq("order_id", orderId);

    const shipmentResult = await query.maybeSingle();
    if (shipmentResult.error) return fail("DB_ERROR", shipmentResult.error.message);
    if (!shipmentResult.data) return fail("NOT_FOUND", "Shipment not found.");

    const lookupOrderId = shipmentResult.data.order_id as string;
    const quotesResult = await supabase.schema("logistics_mcp").from("shipping_quotes").select("*").eq("order_id", lookupOrderId);

    return { content: [{ type: "text", text: ok({ shipment: shipmentResult.data, quotes: quotesResult.data ?? [] }) }] };
  }

  if (tool === "generate_bol") {
    const shipmentId = String(args.shipment_id ?? "");
    if (!shipmentId) return fail("VALIDATION_ERROR", "shipment_id is required.");

    const shipmentResult = await supabase.schema("logistics_mcp").from("shipments").select("*").eq("shipment_id", shipmentId).maybeSingle();
    if (shipmentResult.error) return fail("DB_ERROR", shipmentResult.error.message);
    if (!shipmentResult.data) return fail("NOT_FOUND", "Shipment not found.");

    const shipmentStatus = String((shipmentResult.data as Record<string, unknown>).status ?? "");
    if (shipmentStatus !== "booked" && shipmentStatus !== "in_transit") {
      return fail("INVALID_STATE", `BOL can only be generated for shipments in 'booked' or 'in_transit' status. Current: ${shipmentStatus}.`);
    }

    const bolNumber = `BOL-${new Date().getFullYear()}-${shipmentId.substring(0, 8).toUpperCase()}`;
    const updateResult = await supabase.schema("logistics_mcp").from("shipments").update({ bol_number: bolNumber, updated_at: now() }).eq("shipment_id", shipmentId);
    if (updateResult.error) return fail("DB_ERROR", updateResult.error.message);

    await emitEvent("logistics.bol.generated", { shipment_id: shipmentId, bol_number: bolNumber });
    return { content: [{ type: "text", text: ok({ shipment_id: shipmentId, bol_number: bolNumber }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("logistics", Number(process.env.MCP_HTTP_PORT ?? 4113));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
