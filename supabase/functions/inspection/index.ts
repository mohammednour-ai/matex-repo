// Inspection domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/inspection-mcp/src/index.ts.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "inspection-edge";

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function requestInspection({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const requestedBy = String(args.requested_by ?? caller.userId);
  const inspectionType = String(args.inspection_type ?? "");
  const location = args.location as Record<string, unknown> | undefined;
  if (!requestedBy || !inspectionType || !location) {
    return failEnvelope("VALIDATION_ERROR", "requested_by, inspection_type, location are required.");
  }
  if (args.order_id) {
    const order = await supabase.schema("orders_mcp").from("orders")
      .select("buyer_id,seller_id").eq("order_id", String(args.order_id)).maybeSingle();
    if (order.error) return failEnvelope("DB_ERROR", "Database operation failed");
    if (!order.data) return failEnvelope("NOT_FOUND", "Order not found.");
    if (order.data.buyer_id !== requestedBy && order.data.seller_id !== requestedBy) {
      return failEnvelope("FORBIDDEN", "Requester must be the buyer or seller of the order.");
    }
  } else if (args.listing_id) {
    const listing = await supabase.schema("listing_mcp").from("listings")
      .select("seller_id").eq("listing_id", String(args.listing_id)).maybeSingle();
    if (listing.error) return failEnvelope("DB_ERROR", "Database operation failed");
    if (!listing.data) return failEnvelope("NOT_FOUND", "Listing not found.");
    if (listing.data.seller_id !== requestedBy) return failEnvelope("FORBIDDEN", "Requester must be the listing owner.");
  }
  const inspectionId = generateId();
  const ts = now();
  const { error } = await supabase.schema("inspection_mcp").from("inspections").insert({
    inspection_id: inspectionId,
    listing_id: args.listing_id ? String(args.listing_id) : null,
    order_id: args.order_id ? String(args.order_id) : null,
    requested_by: requestedBy, inspection_type: inspectionType, location,
    scheduled_at: args.scheduled_at ? String(args.scheduled_at) : null,
    status: "requested", result: "pending",
    created_at: ts, updated_at: ts,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "inspection.inspection.requested", {
    inspection_id: inspectionId,
    order_id: args.order_id ? String(args.order_id) : null,
    listing_id: args.listing_id ? String(args.listing_id) : null,
  });
  return okEnvelope({ inspection_id: inspectionId, status: "requested" });
}

async function recordWeight({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const orderId = String(args.order_id ?? "");
  const weightPoint = String(args.weight_point ?? "");
  const weightKg = Number(args.weight_kg ?? 0);
  const recordedBy = String(args.recorded_by ?? caller.userId);
  if (!orderId || !weightPoint || weightKg <= 0 || !recordedBy) {
    return failEnvelope("VALIDATION_ERROR", "order_id, weight_point, weight_kg>0, recorded_by are required.");
  }
  const recordId = generateId();
  const { error } = await supabase.schema("inspection_mcp").from("weight_records").upsert({
    record_id: recordId, order_id: orderId, weight_point: weightPoint, weight_kg: weightKg,
    recorded_by: recordedBy,
    scale_ticket_url: args.scale_ticket_url ? String(args.scale_ticket_url) : null,
    scale_certified: Boolean(args.scale_certified ?? false),
    scale_certificate: args.scale_certificate ? String(args.scale_certificate) : null,
    recorded_at: now(),
  }, { onConflict: "order_id,weight_point" });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "inspection.weight.recorded", {
    order_id: orderId, weight_point: weightPoint, weight_kg: weightKg,
  });
  return okEnvelope({ order_id: orderId, weight_point: weightPoint, weight_kg: weightKg });
}

async function completeInspection({ args }: ToolRequest) {
  const supabase = serviceClient();
  const inspectionId = String(args.inspection_id ?? "");
  const result = String(args.result ?? "");
  if (!inspectionId || !result) return failEnvelope("VALIDATION_ERROR", "inspection_id and result are required.");
  const ts = now();
  const { error } = await supabase.schema("inspection_mcp").from("inspections")
    .update({
      result, status: "completed",
      weight_actual_kg: typeof args.weight_actual_kg === "number" ? Number(args.weight_actual_kg) : null,
      deduction_amount: typeof args.deduction_amount === "number" ? Number(args.deduction_amount) : null,
      notes: args.notes ? String(args.notes) : null,
      completed_at: ts, updated_at: ts,
    })
    .eq("inspection_id", inspectionId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "inspection.inspection.completed", { inspection_id: inspectionId, result });
  return okEnvelope({ inspection_id: inspectionId, status: "completed", result });
}

async function evaluateDiscrepancy({ args }: ToolRequest) {
  const supabase = serviceClient();
  const orderId = String(args.order_id ?? "");
  const expectedWeight = Number(args.expected_weight_kg ?? 0);
  const tolerancePct = Number(args.tolerance_pct ?? 2);
  if (!orderId || expectedWeight <= 0) return failEnvelope("VALIDATION_ERROR", "order_id and expected_weight_kg>0 are required.");

  const weights = await supabase.schema("inspection_mcp").from("weight_records")
    .select("weight_point,weight_kg,recorded_at").eq("order_id", orderId)
    .order("recorded_at", { ascending: false });
  if (weights.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const latest = weights.data?.[0];
  if (!latest) return failEnvelope("NOT_FOUND", "No weight records for order_id.");
  const actualWeight = Number(latest.weight_kg ?? 0);
  const delta = actualWeight - expectedWeight;
  const deltaPct = (delta / expectedWeight) * 100;
  const exceeded = Math.abs(deltaPct) > tolerancePct;
  if (exceeded) {
    await emitEvent(supabase, SOURCE, "inspection.discrepancy.detected", {
      order_id: orderId, expected_weight_kg: expectedWeight, actual_weight_kg: actualWeight,
      delta_pct: Number(deltaPct.toFixed(2)), suggested_control: "freeze_escrow_and_escalate",
    });
  }
  return okEnvelope({
    order_id: orderId, expected_weight_kg: expectedWeight,
    actual_weight_kg: actualWeight, delta_pct: Number(deltaPct.toFixed(2)),
    tolerance_pct: tolerancePct, exceeded_tolerance: exceeded,
  });
}

async function getInspection({ args }: ToolRequest) {
  const supabase = serviceClient();
  const inspectionId = String(args.inspection_id ?? "");
  if (!inspectionId) return failEnvelope("VALIDATION_ERROR", "inspection_id is required.");
  const inspection = await supabase.schema("inspection_mcp").from("inspections").select("*").eq("inspection_id", inspectionId).maybeSingle();
  if (inspection.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!inspection.data) return failEnvelope("NOT_FOUND", "inspection_id not found");
  const orderId = (inspection.data as Record<string, unknown>).order_id as string | null;
  if (orderId) {
    const weights = await supabase.schema("inspection_mcp").from("weight_records").select("*")
      .eq("order_id", orderId).order("recorded_at", { ascending: true });
    if (weights.error) return failEnvelope("DB_ERROR", "Database operation failed");
    return okEnvelope({ inspection: inspection.data, weight_records: weights.data ?? [] });
  }
  return okEnvelope({ inspection: inspection.data, weight_records: [] });
}

async function listInspections({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = args.user_id ? String(args.user_id) : caller.userId;
  const orderId = args.order_id ? String(args.order_id) : "";
  const statusFilter = args.status ? String(args.status) : "";
  const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);
  let query = supabase.schema("inspection_mcp").from("inspections")
    .select("*").order("created_at", { ascending: false }).limit(limit);
  if (orderId) query = query.eq("order_id", orderId);
  else if (userId) query = query.or(`requested_by.eq.${userId},inspector_id.eq.${userId}`);
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data, error } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ inspections: data ?? [] });
}

async function reconcileWeights({ args }: ToolRequest) {
  const supabase = serviceClient();
  const orderId = String(args.order_id ?? "");
  if (!orderId) return failEnvelope("VALIDATION_ERROR", "order_id is required.");
  const weights = await supabase.schema("inspection_mcp").from("weight_records")
    .select("weight_point,weight_kg,scale_certified,recorded_at")
    .eq("order_id", orderId).order("recorded_at", { ascending: true });
  if (weights.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const rows = (weights.data ?? []) as Array<Record<string, unknown>>;
  const byPoint: Record<string, number> = {};
  for (const r of rows) byPoint[String(r.weight_point)] = Number(r.weight_kg ?? 0);
  const w1 = byPoint["W1"] ?? null;
  const w2 = byPoint["W2"] ?? null;
  const w3 = byPoint["W3"] ?? null;
  const w4 = byPoint["W4"] ?? null;
  const originNet = w1 !== null && w2 !== null ? Number((w2 - w1).toFixed(3)) : null;
  const destinationNet = w3 !== null && w4 !== null ? Number((w3 - w4).toFixed(3)) : null;
  const discrepancyKg = originNet !== null && destinationNet !== null ? Number((destinationNet - originNet).toFixed(3)) : null;
  const discrepancyPct = originNet && originNet > 0 && discrepancyKg !== null ? Number(((discrepancyKg / originNet) * 100).toFixed(2)) : null;
  await emitEvent(supabase, SOURCE, "inspection.weights.reconciled", {
    order_id: orderId, origin_net_kg: originNet, destination_net_kg: destinationNet, discrepancy_kg: discrepancyKg,
  });
  return okEnvelope({
    order_id: orderId, checkpoints: byPoint,
    origin_net_kg: originNet, destination_net_kg: destinationNet,
    discrepancy_kg: discrepancyKg, discrepancy_pct: discrepancyPct,
  });
}

Deno.serve(serveDomain({
  ping,
  request_inspection: requestInspection,
  record_weight: recordWeight,
  complete_inspection: completeInspection,
  evaluate_discrepancy: evaluateDiscrepancy,
  get_inspection: getInspection,
  list_inspections: listInspections,
  reconcile_weights: reconcileWeights,
}));
