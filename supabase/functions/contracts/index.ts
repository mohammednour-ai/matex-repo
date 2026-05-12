// Contracts domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/contracts-mcp/src/index.ts.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "contracts-edge";

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function createContract({ args }: ToolRequest) {
  // Schema-aligned. See packages/mcp-servers/contracts-mcp/src/index.ts
  // for the long comment on the columns this replaces.
  const supabase = serviceClient();
  const buyerId = String(args.buyer_id ?? "");
  const sellerId = String(args.seller_id ?? "");
  const contractType = String(args.contract_type ?? "standing");
  const materialCategoryId = String(args.material_category_id ?? "");
  const totalVolume = Number(args.total_volume ?? 0);
  const unit = String(args.unit ?? "");
  const basePrice = Number(args.base_price ?? 0);
  const startDate = String(args.start_date ?? "");
  const endDate = String(args.end_date ?? "");

  if (!buyerId || !sellerId) return failEnvelope("VALIDATION_ERROR", "buyer_id and seller_id are required.");
  if (buyerId === sellerId) return failEnvelope("VALIDATION_ERROR", "buyer_id and seller_id must differ.");
  if (!materialCategoryId) return failEnvelope("VALIDATION_ERROR", "material_category_id is required.");
  if (!(totalVolume > 0)) return failEnvelope("VALIDATION_ERROR", "total_volume must be > 0.");
  if (!unit) return failEnvelope("VALIDATION_ERROR", "unit is required (e.g. 'mt', 'kg').");
  if (!(basePrice > 0)) return failEnvelope("VALIDATION_ERROR", "base_price must be > 0.");
  if (!startDate || !endDate) return failEnvelope("VALIDATION_ERROR", "start_date and end_date are required.");
  if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
    return failEnvelope("VALIDATION_ERROR", "end_date must be after start_date.");
  }

  const pricingModel =
    (args.pricing_model as Record<string, unknown> | undefined) ??
    { type: "fixed", base_price: basePrice, currency: String(args.currency ?? "CAD") };
  const qualitySpecs = (args.quality_specs as Record<string, unknown> | undefined) ?? {};
  const breachPenalties = (args.breach_penalties as Record<string, unknown> | undefined) ?? {};
  const frequency = args.frequency ? String(args.frequency) : null;
  const autoRenew = Boolean(args.auto_renew ?? false);
  const renewalNoticeDays = Number(args.renewal_notice_days ?? 30);

  const contractId = generateId();
  const ts = now();
  const { error } = await supabase.schema("contracts_mcp").from("contracts").insert({
    contract_id: contractId,
    buyer_id: buyerId,
    seller_id: sellerId,
    contract_type: contractType,
    material_category_id: materialCategoryId,
    quality_specs: qualitySpecs,
    pricing_model: pricingModel,
    total_volume: totalVolume,
    unit,
    frequency,
    start_date: startDate,
    end_date: endDate,
    auto_renew: autoRenew,
    renewal_notice_days: renewalNoticeDays,
    breach_penalties: breachPenalties,
    status: "draft",
    created_at: ts,
    updated_at: ts,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "contracts.contract.created", {
    contract_id: contractId,
    buyer_id: buyerId,
    seller_id: sellerId,
    contract_type: contractType,
    total_volume: totalVolume,
    unit,
  });
  return okEnvelope({
    contract_id: contractId,
    status: "draft",
    contract_type: contractType,
    total_volume: totalVolume,
    unit,
    pricing_model: pricingModel,
  });
}

async function activateContract({ args }: ToolRequest) {
  const supabase = serviceClient();
  const contractId = String(args.contract_id ?? "");
  if (!contractId) return failEnvelope("VALIDATION_ERROR", "contract_id is required.");
  const ts = now();
  const { error } = await supabase.schema("contracts_mcp").from("contracts")
    .update({
      status: "active",
      esign_document_id: args.esign_document_id ? String(args.esign_document_id) : null,
      activated_at: ts, updated_at: ts,
    })
    .eq("contract_id", contractId).eq("status", "draft");
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "contracts.contract.activated", { contract_id: contractId });
  return okEnvelope({ contract_id: contractId, status: "active" });
}

async function generateOrder({ args }: ToolRequest) {
  const supabase = serviceClient();
  const contractId = String(args.contract_id ?? "");
  if (!contractId) return failEnvelope("VALIDATION_ERROR", "contract_id is required.");

  // Back-compat: accept quantity OR quantity_kg, scheduled_date OR delivery_date.
  const orderQuantity = Number(args.quantity ?? args.quantity_kg ?? 0);
  const scheduledDate = args.scheduled_date
    ? String(args.scheduled_date)
    : args.delivery_date
      ? String(args.delivery_date)
      : "";
  if (!(orderQuantity > 0)) return failEnvelope("VALIDATION_ERROR", "quantity must be > 0.");
  if (!scheduledDate) return failEnvelope("VALIDATION_ERROR", "scheduled_date is required.");

  const contractResult = await supabase
    .schema("contracts_mcp")
    .from("contracts")
    .select("total_volume,fulfilled_volume,pricing_model,start_date,end_date,unit,status")
    .eq("contract_id", contractId)
    .eq("status", "active")
    .maybeSingle();
  if (contractResult.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!contractResult.data) return failEnvelope("NOT_FOUND", "Active contract not found.");
  const contract = contractResult.data as Record<string, unknown>;

  const totalVolume = Number(contract.total_volume ?? 0);
  const fulfilledVolume = Number(contract.fulfilled_volume ?? 0);
  const remaining = totalVolume - fulfilledVolume;
  if (totalVolume > 0 && orderQuantity > remaining) {
    return failEnvelope("VALIDATION_ERROR", `quantity exceeds contract remaining volume (${remaining}).`);
  }
  if (contract.start_date && new Date(scheduledDate) < new Date(String(contract.start_date))) {
    return failEnvelope("VALIDATION_ERROR", `scheduled_date (${scheduledDate}) must not be before contract start_date (${contract.start_date}).`);
  }
  if (contract.end_date && new Date(scheduledDate) > new Date(String(contract.end_date))) {
    return failEnvelope("VALIDATION_ERROR", `scheduled_date (${scheduledDate}) must not be after contract end_date (${contract.end_date}).`);
  }

  const pricingModel = (contract.pricing_model ?? {}) as Record<string, unknown>;
  const pricingType = String(pricingModel.type ?? "fixed");
  if (pricingType !== "fixed") {
    return failEnvelope("NOT_IMPLEMENTED", `pricing_model.type='${pricingType}' is not supported by generate_order yet. v1 ships fixed only.`);
  }
  const basePrice = Number(pricingModel.base_price ?? 0);
  if (!(basePrice > 0)) return failEnvelope("VALIDATION_ERROR", "Contract pricing_model.base_price must be > 0.");
  const calculatedPrice = Number((orderQuantity * basePrice).toFixed(2));

  const contractOrderId = generateId();
  const ts = now();
  const { error } = await supabase.schema("contracts_mcp").from("contract_orders").insert({
    contract_order_id: contractOrderId,
    contract_id: contractId,
    scheduled_date: scheduledDate,
    quantity: orderQuantity,
    calculated_price: calculatedPrice,
    status: "scheduled",
    created_at: ts,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "contracts.order.triggered", {
    contract_id: contractId,
    contract_order_id: contractOrderId,
    quantity: orderQuantity,
    calculated_price: calculatedPrice,
    scheduled_date: scheduledDate,
  });
  return okEnvelope({
    contract_order_id: contractOrderId,
    contract_id: contractId,
    quantity: orderQuantity,
    calculated_price: calculatedPrice,
    scheduled_date: scheduledDate,
    status: "scheduled",
  });
}

async function negotiateTerms({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const contractId = String(args.contract_id ?? "");
  const proposedBy = String(args.proposed_by ?? caller.userId);
  const proposedChanges = args.proposed_changes as Record<string, unknown> | undefined;
  if (!contractId || !proposedBy || !proposedChanges) {
    return failEnvelope("VALIDATION_ERROR", "contract_id, proposed_by, proposed_changes are required.");
  }
  const contract = await supabase.schema("contracts_mcp").from("contracts")
    .select("buyer_id,seller_id").eq("contract_id", contractId).maybeSingle();
  if (contract.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!contract.data) return failEnvelope("NOT_FOUND", "Contract not found.");
  if (String(contract.data.buyer_id) !== proposedBy && String(contract.data.seller_id) !== proposedBy) {
    return failEnvelope("FORBIDDEN", "Only the buyer or seller can propose changes to this contract.");
  }
  const negotiationId = generateId();
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const { error } = await supabase.schema("contracts_mcp").from("negotiations").insert({
    negotiation_id: negotiationId, contract_id: contractId,
    proposed_by: proposedBy, proposed_changes: proposedChanges,
    message: args.message ? String(args.message) : null,
    status: "proposed", expires_at: expiresAt, created_at: now(),
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "contracts.negotiation.proposed", {
    contract_id: contractId, negotiation_id: negotiationId, proposed_by: proposedBy,
  });
  return okEnvelope({ negotiation_id: negotiationId, contract_id: contractId, status: "proposed" });
}

async function getContract({ args }: ToolRequest) {
  const supabase = serviceClient();
  const contractId = String(args.contract_id ?? "");
  if (!contractId) return failEnvelope("VALIDATION_ERROR", "contract_id is required.");
  const contract = await supabase.schema("contracts_mcp").from("contracts").select("*").eq("contract_id", contractId).maybeSingle();
  if (contract.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!contract.data) return failEnvelope("NOT_FOUND", "Contract not found.");
  const orders = await supabase.schema("contracts_mcp").from("contract_orders")
    .select("*").eq("contract_id", contractId).order("created_at", { ascending: false });
  const negotiations = await supabase.schema("contracts_mcp").from("negotiations")
    .select("*").eq("contract_id", contractId).order("created_at", { ascending: false });
  return okEnvelope({ contract: contract.data, orders: orders.data ?? [], negotiations: negotiations.data ?? [] });
}

async function terminateContract({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const contractId = String(args.contract_id ?? "");
  const reason = String(args.reason ?? "");
  const terminatedBy = String(args.terminated_by ?? caller.userId);
  if (!contractId || !reason || !terminatedBy) {
    return failEnvelope("VALIDATION_ERROR", "contract_id, reason, terminated_by are required.");
  }
  const contract = await supabase.schema("contracts_mcp").from("contracts")
    .select("buyer_id,seller_id").eq("contract_id", contractId).maybeSingle();
  if (contract.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!contract.data) return failEnvelope("NOT_FOUND", "Contract not found.");
  if (String(contract.data.buyer_id) !== terminatedBy && String(contract.data.seller_id) !== terminatedBy) {
    return failEnvelope("FORBIDDEN", "Only the buyer or seller can terminate this contract.");
  }
  const ts = now();
  const { error } = await supabase.schema("contracts_mcp").from("contracts")
    .update({
      status: "terminated", termination_reason: reason,
      terminated_by: terminatedBy, terminated_at: ts, updated_at: ts,
    })
    .eq("contract_id", contractId).in("status", ["draft", "active"]);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "contracts.contract.terminated", {
    contract_id: contractId, reason, terminated_by: terminatedBy,
  });
  return okEnvelope({ contract_id: contractId, status: "terminated", reason });
}

async function evaluateBreach({ args }: ToolRequest) {
  // Schema-aligned column reads; see the matching MCP handler in
  // packages/mcp-servers/contracts-mcp/src/index.ts for the TODO on the
  // comparison semantics (we kept them to avoid scope creep; redesign
  // is a separate PR — P1-1d).
  const supabase = serviceClient();
  const contractId = String(args.contract_id ?? "");
  const contractOrderId = args.contract_order_id ? String(args.contract_order_id) : "";
  const orderId = args.order_id ? String(args.order_id) : "";
  if (!contractId || (!contractOrderId && !orderId)) {
    return failEnvelope("VALIDATION_ERROR", "contract_id and either contract_order_id or order_id are required.");
  }

  let orderQuery = supabase
    .schema("contracts_mcp")
    .from("contract_orders")
    .select("quantity,calculated_price,status,scheduled_date")
    .eq("contract_id", contractId);
  if (contractOrderId) {
    orderQuery = orderQuery.eq("contract_order_id", contractOrderId);
  } else {
    orderQuery = orderQuery.eq("order_id", orderId);
  }

  const [contractResult, orderResult] = await Promise.all([
    supabase
      .schema("contracts_mcp")
      .from("contracts")
      .select("total_volume,pricing_model,breach_penalties,status,unit")
      .eq("contract_id", contractId)
      .maybeSingle(),
    orderQuery.maybeSingle(),
  ]);
  if (contractResult.error || orderResult.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!contractResult.data) return failEnvelope("NOT_FOUND", "Contract not found.");
  if (!orderResult.data) return failEnvelope("NOT_FOUND", "Contract order not found.");

  const contract = contractResult.data as Record<string, unknown>;
  const order = orderResult.data as Record<string, unknown>;
  const penaltyConfig = (contract.breach_penalties ?? {}) as Record<string, unknown>;
  const pricingModel = (contract.pricing_model ?? {}) as Record<string, unknown>;

  const orderQty = Number(order.quantity ?? 0);
  const contractQty = Number(contract.total_volume ?? 0);
  const basePrice = Number(pricingModel.base_price ?? 0);

  const shortfallQty = Math.max(0, contractQty - orderQty);
  const shortfallPct = contractQty > 0 ? Number(((shortfallQty / contractQty) * 100).toFixed(2)) : 0;
  const penaltyRate = Number(penaltyConfig.shortfall_rate ?? 0.05);
  const penaltyAmount = shortfallPct > 0 ? Number((shortfallQty * basePrice * penaltyRate).toFixed(2)) : 0;
  const isLateDelivery =
    order.scheduled_date &&
    order.status !== "fulfilled" &&
    new Date(String(order.scheduled_date)) < new Date();
  const latePenalty = isLateDelivery ? Number(penaltyConfig.late_delivery_fee ?? 0) : 0;
  const totalPenalty = Number((penaltyAmount + latePenalty).toFixed(2));
  return okEnvelope({
    contract_id: contractId,
    contract_order_id: contractOrderId || null,
    order_id: orderId || null,
    is_breach: totalPenalty > 0,
    shortfall_quantity: shortfallQty,
    shortfall_unit: String(contract.unit ?? ""),
    shortfall_pct: shortfallPct,
    late_delivery: Boolean(isLateDelivery),
    penalty_amount: penaltyAmount,
    late_penalty: latePenalty,
    total_penalty: totalPenalty,
  });
}

async function listContracts({ args }: ToolRequest) {
  const supabase = serviceClient();
  const userId = args.user_id ? String(args.user_id) : "";
  const statusFilter = args.status ? String(args.status) : "";
  const contractType = args.contract_type ? String(args.contract_type) : "";
  const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);
  let query = supabase.schema("contracts_mcp").from("contracts")
    .select("*").order("created_at", { ascending: false }).limit(limit);
  if (userId) query = query.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
  if (statusFilter) query = query.eq("status", statusFilter);
  if (contractType) query = query.eq("contract_type", contractType);
  const { data, error } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ contracts: data ?? [] });
}

async function collectPenalty({ args }: ToolRequest) {
  const supabase = serviceClient();
  const contractId = String(args.contract_id ?? "");
  const orderId = String(args.order_id ?? "");
  const penaltyAmount = Number(args.penalty_amount ?? 0);
  const reason = String(args.reason ?? "");
  if (!contractId || !orderId) return failEnvelope("VALIDATION_ERROR", "contract_id and order_id are required.");
  if (!Number.isFinite(penaltyAmount) || penaltyAmount <= 0) return failEnvelope("VALIDATION_ERROR", "penalty_amount must be greater than 0.");
  if (!reason) return failEnvelope("VALIDATION_ERROR", "reason is required.");
  const penaltyId = generateId();
  const collectedAt = now();
  const { error } = await supabase.schema("contracts_mcp").from("contract_orders")
    .update({ status: "breach_penalty_levied", updated_at: collectedAt })
    .eq("order_id", orderId).eq("contract_id", contractId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "contracts.penalty.collected", {
    contract_id: contractId, order_id: orderId, penalty_id: penaltyId, amount: penaltyAmount, reason,
  });
  return okEnvelope({ penalty_id: penaltyId, contract_id: contractId, order_id: orderId, amount: penaltyAmount, reason, collected_at: collectedAt });
}

async function getFulfillmentHistory({ args }: ToolRequest) {
  // Edge counterpart of contracts-mcp's get_fulfillment_history. Replaces
  // the hardcoded 6-month chart on /contracts (P1-2). Buckets are computed
  // client-side in JS rather than via a SQL GROUP BY so we don't need to
  // add an RPC function for what is at most 12 rows of data per contract.
  const contractId = String(args.contract_id ?? "");
  const months = Math.min(Math.max(Number(args.months ?? 6), 1), 12);
  if (!contractId) return failEnvelope("VALIDATION_ERROR", "contract_id is required.");

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - (months - 1), 1);
  const startIso = start.toISOString().slice(0, 10);

  const supabase = serviceClient();
  const { data, error } = await supabase
    .schema("contracts_mcp")
    .from("contract_orders")
    .select("scheduled_date,quantity,status")
    .eq("contract_id", contractId)
    .gte("scheduled_date", startIso)
    .order("scheduled_date", { ascending: true });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");

  type Bucket = { year: number; month: number; scheduled: number; fulfilled: number };
  const buckets: Bucket[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    buckets.push({ year: d.getFullYear(), month: d.getMonth(), scheduled: 0, fulfilled: 0 });
  }
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const d = new Date(String(row.scheduled_date));
    const bucket = buckets.find((b) => b.year === d.getFullYear() && b.month === d.getMonth());
    if (!bucket) continue;
    const qty = Number(row.quantity ?? 0);
    bucket.scheduled += qty;
    if (String(row.status) === "fulfilled") bucket.fulfilled += qty;
  }

  const points = buckets.map((b) => ({
    label: monthLabels[b.month],
    year: b.year,
    scheduled_quantity: Number(b.scheduled.toFixed(2)),
    fulfilled_quantity: Number(b.fulfilled.toFixed(2)),
    pct: b.scheduled > 0 ? Math.round((b.fulfilled / b.scheduled) * 100) : 0,
  }));

  return okEnvelope({ contract_id: contractId, months, points });
}

Deno.serve(serveDomain({
  ping,
  create_contract: createContract,
  activate_contract: activateContract,
  generate_order: generateOrder,
  negotiate_terms: negotiateTerms,
  get_contract: getContract,
  terminate_contract: terminateContract,
  evaluate_breach: evaluateBreach,
  collect_penalty: collectPenalty,
  list_contracts: listContracts,
  get_fulfillment_history: getFulfillmentHistory,
}));
