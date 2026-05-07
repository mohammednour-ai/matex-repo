import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now , initSentry} from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "logistics-mcp";
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

interface CarrierProfile {
  carrier_name: string;
  base_fee: number;
  per_km_rate: number;
  per_kg_rate: number;
  hazmat_surcharge: number;
  speed_kmph: number;
  co2_g_per_tonne_km: number;
  api_env_key?: string;
}

const CARRIER_PROFILES: CarrierProfile[] = [
  { carrier_name: "Day & Ross", base_fee: 95, per_km_rate: 0.42, per_kg_rate: 0.18, hazmat_surcharge: 175, speed_kmph: 950, co2_g_per_tonne_km: 62, api_env_key: "LOGISTICS_DAY_ROSS_API_KEY" },
  { carrier_name: "Manitoulin Transport", base_fee: 110, per_km_rate: 0.38, per_kg_rate: 0.21, hazmat_surcharge: 200, speed_kmph: 900, co2_g_per_tonne_km: 65, api_env_key: "LOGISTICS_MANITOULIN_API_KEY" },
  { carrier_name: "Purolator Freight", base_fee: 120, per_km_rate: 0.46, per_kg_rate: 0.16, hazmat_surcharge: 225, speed_kmph: 1050, co2_g_per_tonne_km: 58, api_env_key: "LOGISTICS_PUROLATOR_API_KEY" },
  { carrier_name: "GoFor Industries", base_fee: 80, per_km_rate: 0.50, per_kg_rate: 0.22, hazmat_surcharge: 0, speed_kmph: 1200, co2_g_per_tonne_km: 72 },
  { carrier_name: "Canada Cartage", base_fee: 130, per_km_rate: 0.36, per_kg_rate: 0.19, hazmat_surcharge: 150, speed_kmph: 850, co2_g_per_tonne_km: 60, api_env_key: "LOGISTICS_CANADA_CARTAGE_API_KEY" },
];

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function readPoint(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const lat = Number(v.lat ?? v.latitude);
  const lng = Number(v.lng ?? v.lon ?? v.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

const DEFAULT_DISTANCE_KM = 750;

function estimateDistanceKm(origin: Record<string, unknown> | undefined, destination: Record<string, unknown> | undefined): number {
  const o = readPoint(origin);
  const d = readPoint(destination);
  if (o && d) {
    const km = haversineKm(o, d);
    return Math.max(km, 25);
  }
  return DEFAULT_DISTANCE_KM;
}

interface ExternalQuote {
  price_cad: number;
  transit_days: number;
  co2_emissions_kg: number;
}

async function fetchExternalCarrierQuote(_profile: CarrierProfile, _payload: { weight_kg: number; distance_km: number; hazmat_class: string }): Promise<ExternalQuote | null> {
  // Real carrier integrations land here when keys are provisioned. Until then we return null
  // and the caller falls back to the deterministic estimator. Each carrier plugs in its own
  // request shape (Day & Ross, Manitoulin, Purolator Freight, etc.) inside this switch.
  return null;
}

function deterministicEstimate(profile: CarrierProfile, weightKg: number, distanceKm: number, hazmatClass: string): ExternalQuote {
  const hazmatFee = hazmatClass && hazmatClass !== "none" ? profile.hazmat_surcharge : 0;
  const rawPrice = profile.base_fee + profile.per_km_rate * distanceKm + profile.per_kg_rate * weightKg + hazmatFee;
  const transitDays = Math.max(1, Math.ceil(distanceKm / profile.speed_kmph));
  const co2Kg = (weightKg / 1000) * distanceKm * (profile.co2_g_per_tonne_km / 1000);
  return {
    price_cad: Number(rawPrice.toFixed(2)),
    transit_days: transitDays,
    co2_emissions_kg: Number(co2Kg.toFixed(2)),
  };
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "get_quotes", description: "Request shipping quotes from multiple carriers", inputSchema: { type: "object", properties: { order_id: { type: "string" }, origin: { type: "object" }, destination: { type: "object" }, weight_kg: { type: "number" }, dimensions: { type: "object" }, hazmat_class: { type: "string" }, requested_by: { type: "string" } }, required: ["order_id", "origin", "destination", "weight_kg", "requested_by"] } },
    { name: "book_shipment", description: "Select a carrier quote and book the shipment", inputSchema: { type: "object", properties: { order_id: { type: "string" }, quote_id: { type: "string" }, carrier_name: { type: "string" }, booked_by: { type: "string" } }, required: ["order_id", "quote_id", "carrier_name", "booked_by"] } },
    { name: "update_tracking", description: "Update shipment status and tracking info", inputSchema: { type: "object", properties: { shipment_id: { type: "string" }, status: { type: "string" }, tracking_number: { type: "string" }, location: { type: "object" }, notes: { type: "string" } }, required: ["shipment_id", "status"] } },
    { name: "get_shipment", description: "Get shipment details with associated quotes", inputSchema: { type: "object", properties: { shipment_id: { type: "string" }, order_id: { type: "string" } }, required: [] } },
    { name: "generate_bol", description: "Generate a Bill of Lading document reference", inputSchema: { type: "object", properties: { shipment_id: { type: "string" } }, required: ["shipment_id"] } },
    { name: "list_shipments", description: "List shipments for a user (resolved via the linked order's buyer/seller). Optional status filter.", inputSchema: { type: "object", properties: { user_id: { type: "string" }, status: { type: "string" }, limit: { type: "number" } }, required: ["user_id"] } },
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
    const hazmatClass = String(args.hazmat_class ?? "none");
    if (!orderId || !origin || !destination || weightKg <= 0 || !requestedBy) return fail("VALIDATION_ERROR", "order_id, origin, destination, weight_kg>0, requested_by are required.");

    const distanceKm = estimateDistanceKm(origin, destination);
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const quotes = await Promise.all(
      CARRIER_PROFILES.map(async (profile) => {
        const apiKey = profile.api_env_key ? process.env[profile.api_env_key] : undefined;
        let quote: ExternalQuote | null = null;
        let isEstimated = true;
        if (apiKey) {
          try {
            quote = await fetchExternalCarrierQuote(profile, { weight_kg: weightKg, distance_km: distanceKm, hazmat_class: hazmatClass });
            if (quote) isEstimated = false;
          } catch (err) {
            console.error(`[logistics-mcp] ${profile.carrier_name} carrier API failed`, err);
          }
        }
        if (!quote) quote = deterministicEstimate(profile, weightKg, distanceKm, hazmatClass);
        return {
          quote_id: generateId(),
          order_id: orderId,
          carrier_name: profile.carrier_name,
          price_cad: quote.price_cad,
          transit_days: quote.transit_days,
          co2_emissions_kg: quote.co2_emissions_kg,
          distance_km: Number(distanceKm.toFixed(1)),
          valid_until: validUntil,
          created_at: now(),
          is_estimated: isEstimated,
          estimated_note: isEstimated ? "Deterministic estimate based on weight, distance and carrier rate card. Contact carrier for binding quote." : undefined,
        };
      }),
    );

    for (const q of quotes) {
      await supabase.schema("logistics_mcp").from("shipping_quotes").insert(q);
    }

    await emitEvent("logistics.quotes.requested", { order_id: orderId, carrier_count: CARRIER_PROFILES.length, distance_km: distanceKm });
    return { content: [{ type: "text", text: ok({ order_id: orderId, distance_km: Number(distanceKm.toFixed(1)), quotes }) }] };
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
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");

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
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");

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
    if (shipmentResult.error) return fail("DB_ERROR", "Database operation failed");
    if (!shipmentResult.data) return fail("NOT_FOUND", "Shipment not found.");

    const lookupOrderId = shipmentResult.data.order_id as string;
    const quotesResult = await supabase.schema("logistics_mcp").from("shipping_quotes").select("*").eq("order_id", lookupOrderId);

    return { content: [{ type: "text", text: ok({ shipment: shipmentResult.data, quotes: quotesResult.data ?? [] }) }] };
  }

  if (tool === "list_shipments") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    const statusFilter = args.status ? String(args.status) : "";
    const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);

    // Resolve the user's orders first; shipments link to orders, not users.
    const ordersResult = await supabase
      .schema("orders_mcp")
      .from("orders")
      .select("order_id")
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
    if (ordersResult.error) return fail("DB_ERROR", "Database operation failed");
    const orderIds = (ordersResult.data ?? []).map((r: Record<string, unknown>) => String(r.order_id));
    if (orderIds.length === 0) {
      return { content: [{ type: "text", text: ok({ shipments: [] }) }] };
    }

    let query = supabase
      .schema("logistics_mcp")
      .from("shipments")
      .select("*")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (statusFilter) query = query.eq("status", statusFilter);
    const { data, error } = await query;
    if (error) return fail("DB_ERROR", "Database operation failed");
    return { content: [{ type: "text", text: ok({ shipments: data ?? [] }) }] };
  }

  if (tool === "generate_bol") {
    const shipmentId = String(args.shipment_id ?? "");
    if (!shipmentId) return fail("VALIDATION_ERROR", "shipment_id is required.");

    const shipmentResult = await supabase.schema("logistics_mcp").from("shipments").select("*").eq("shipment_id", shipmentId).maybeSingle();
    if (shipmentResult.error) return fail("DB_ERROR", "Database operation failed");
    if (!shipmentResult.data) return fail("NOT_FOUND", "Shipment not found.");

    const shipmentStatus = String((shipmentResult.data as Record<string, unknown>).status ?? "");
    if (shipmentStatus !== "booked" && shipmentStatus !== "in_transit") {
      return fail("INVALID_STATE", `BOL can only be generated for shipments in 'booked' or 'in_transit' status. Current: ${shipmentStatus}.`);
    }

    const bolNumber = `BOL-${new Date().getFullYear()}-${shipmentId.substring(0, 8).toUpperCase()}`;
    const updateResult = await supabase.schema("logistics_mcp").from("shipments").update({ bol_number: bolNumber, updated_at: now() }).eq("shipment_id", shipmentId);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");

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
