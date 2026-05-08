// Logistics domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/logistics-mcp/src/index.ts.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "logistics-edge";

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

function toRad(deg: number): number { return (deg * Math.PI) / 180; }

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
  if (o && d) return Math.max(haversineKm(o, d), 25);
  return DEFAULT_DISTANCE_KM;
}

function deterministicEstimate(profile: CarrierProfile, weightKg: number, distanceKm: number, hazmatClass: string) {
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

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function getQuotes({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const orderId = String(args.order_id ?? "");
  const origin = args.origin as Record<string, unknown> | undefined;
  const destination = args.destination as Record<string, unknown> | undefined;
  const weightKg = Number(args.weight_kg ?? 0);
  const requestedBy = String(args.requested_by ?? caller.userId);
  const hazmatClass = String(args.hazmat_class ?? "none");
  if (!orderId || !origin || !destination || weightKg <= 0 || !requestedBy) {
    return failEnvelope("VALIDATION_ERROR", "order_id, origin, destination, weight_kg>0, requested_by are required.");
  }
  const distanceKm = estimateDistanceKm(origin, destination);
  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const quotes = CARRIER_PROFILES.map((profile) => {
    const quote = deterministicEstimate(profile, weightKg, distanceKm, hazmatClass);
    return {
      quote_id: generateId(), order_id: orderId, carrier_name: profile.carrier_name,
      price_cad: quote.price_cad, transit_days: quote.transit_days,
      co2_emissions_kg: quote.co2_emissions_kg,
      distance_km: Number(distanceKm.toFixed(1)),
      valid_until: validUntil, created_at: now(),
      is_estimated: true,
      estimated_note: "Deterministic estimate based on weight, distance and carrier rate card. Contact carrier for binding quote.",
    };
  });

  for (const q of quotes) {
    await supabase.schema("logistics_mcp").from("shipping_quotes").insert(q);
  }
  await emitEvent(supabase, SOURCE, "logistics.quotes.requested", {
    order_id: orderId, carrier_count: CARRIER_PROFILES.length, distance_km: distanceKm,
  });
  return okEnvelope({ order_id: orderId, distance_km: Number(distanceKm.toFixed(1)), quotes });
}

async function bookShipment({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const orderId = String(args.order_id ?? "");
  const quoteId = String(args.quote_id ?? "");
  const carrierName = String(args.carrier_name ?? "");
  const bookedBy = String(args.booked_by ?? caller.userId);
  if (!orderId || !quoteId || !carrierName || !bookedBy) {
    return failEnvelope("VALIDATION_ERROR", "order_id, quote_id, carrier_name, booked_by are required.");
  }
  const shipmentId = generateId();
  const ts = now();
  const { error } = await supabase.schema("logistics_mcp").from("shipments").insert({
    shipment_id: shipmentId, order_id: orderId, quote_id: quoteId,
    carrier_name: carrierName, status: "booked", booked_by: bookedBy,
    hazmat_class: args.hazmat_class ? String(args.hazmat_class) : "none",
    created_at: ts, updated_at: ts,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "logistics.shipment.booked", {
    shipment_id: shipmentId, order_id: orderId, carrier_name: carrierName,
  });
  return okEnvelope({ shipment_id: shipmentId, order_id: orderId, carrier_name: carrierName, status: "booked" });
}

async function updateTracking({ args }: ToolRequest) {
  const supabase = serviceClient();
  const shipmentId = String(args.shipment_id ?? "");
  const status = String(args.status ?? "");
  if (!shipmentId || !status) return failEnvelope("VALIDATION_ERROR", "shipment_id and status are required.");
  const update: Record<string, unknown> = { status, updated_at: now() };
  if (args.tracking_number) update.tracking_number = String(args.tracking_number);
  if (args.location) update.current_location = args.location;
  if (args.notes) update.notes = String(args.notes);
  if (status === "delivered") update.delivered_at = now();
  const { error } = await supabase.schema("logistics_mcp").from("shipments").update(update).eq("shipment_id", shipmentId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  const eventName = status === "delivered" ? "logistics.shipment.delivered"
    : status === "picked_up" ? "logistics.shipment.picked_up"
    : "logistics.shipment.updated";
  await emitEvent(supabase, SOURCE, eventName, { shipment_id: shipmentId, status });
  return okEnvelope({ shipment_id: shipmentId, status });
}

async function getShipment({ args }: ToolRequest) {
  const supabase = serviceClient();
  const shipmentId = args.shipment_id ? String(args.shipment_id) : null;
  const orderId = args.order_id ? String(args.order_id) : null;
  if (!shipmentId && !orderId) return failEnvelope("VALIDATION_ERROR", "shipment_id or order_id is required.");
  let query = supabase.schema("logistics_mcp").from("shipments").select("*");
  if (shipmentId) query = query.eq("shipment_id", shipmentId);
  else if (orderId) query = query.eq("order_id", orderId);
  const { data, error } = await query.maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!data) return failEnvelope("NOT_FOUND", "Shipment not found.");
  const lookupOrderId = (data as Record<string, unknown>).order_id as string;
  const quotes = await supabase.schema("logistics_mcp").from("shipping_quotes").select("*").eq("order_id", lookupOrderId);
  return okEnvelope({ shipment: data, quotes: quotes.data ?? [] });
}

async function listShipments({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const statusFilter = args.status ? String(args.status) : "";
  const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);
  const orders = await supabase.schema("orders_mcp").from("orders")
    .select("order_id").or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
  if (orders.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const orderIds = (orders.data ?? []).map((r: Record<string, unknown>) => String(r.order_id));
  if (orderIds.length === 0) return okEnvelope({ shipments: [] });
  let query = supabase.schema("logistics_mcp").from("shipments")
    .select("*").in("order_id", orderIds)
    .order("created_at", { ascending: false }).limit(limit);
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data, error } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ shipments: data ?? [] });
}

async function generateBol({ args }: ToolRequest) {
  const supabase = serviceClient();
  const shipmentId = String(args.shipment_id ?? "");
  if (!shipmentId) return failEnvelope("VALIDATION_ERROR", "shipment_id is required.");
  const shipment = await supabase.schema("logistics_mcp").from("shipments").select("*").eq("shipment_id", shipmentId).maybeSingle();
  if (shipment.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!shipment.data) return failEnvelope("NOT_FOUND", "Shipment not found.");
  const status = String((shipment.data as Record<string, unknown>).status ?? "");
  if (status !== "booked" && status !== "in_transit") {
    return failEnvelope("INVALID_STATE", `BOL can only be generated for shipments in 'booked' or 'in_transit' status. Current: ${status}.`);
  }
  const bolNumber = `BOL-${new Date().getFullYear()}-${shipmentId.substring(0, 8).toUpperCase()}`;
  const { error } = await supabase.schema("logistics_mcp").from("shipments")
    .update({ bol_number: bolNumber, updated_at: now() }).eq("shipment_id", shipmentId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "logistics.bol.generated", { shipment_id: shipmentId, bol_number: bolNumber });
  return okEnvelope({ shipment_id: shipmentId, bol_number: bolNumber });
}

Deno.serve(serveDomain({
  ping,
  get_quotes: getQuotes,
  book_shipment: bookShipment,
  update_tracking: updateTracking,
  get_shipment: getShipment,
  list_shipments: listShipments,
  generate_bol: generateBol,
}));
