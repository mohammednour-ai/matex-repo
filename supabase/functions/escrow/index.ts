// Escrow domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/escrow-mcp/src/index.ts.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { failEnvelope, generateId, now, okEnvelope, roundToTwoDecimals } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { isPlatformAdmin } from "../_shared/auth.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "escrow-edge";

type EscrowStatus =
  | "created"
  | "funds_held"
  | "partially_released"
  | "released"
  | "frozen"
  | "refunded"
  | "cancelled";

interface EscrowRow {
  escrow_id: string;
  buyer_id: string;
  seller_id: string;
  order_id: string;
  status: EscrowStatus;
  original_amount: number;
  held_amount: number;
  released_amount: number;
  refunded_amount: number;
  release_conditions: Record<string, unknown> | null;
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

async function appendTimeline(
  supabase: SupabaseClient,
  escrowId: string,
  action: string,
  amount: number | null,
  performedBy: string | null,
  reason: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
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

async function evaluateReleaseConditions(
  supabase: SupabaseClient,
  escrow: EscrowRow,
): Promise<{ unmet: string; reason: string } | null> {
  const conditions = (escrow.release_conditions ?? {}) as Record<string, unknown>;
  if (Object.keys(conditions).length === 0) return null;
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
    if (conditions.manual_approved_at === undefined && conditions.manual_approved_by === undefined) {
      return { unmet: "manual_approved", reason: "no manual approval recorded on escrow" };
    }
  }

  if (conditions.order_completed === true) {
    const { data, error } = await supabase
      .schema("orders_mcp")
      .from("orders")
      .select("status")
      .eq("order_id", orderId)
      .maybeSingle();
    if (error) return { unmet: "order_completed", reason: "order lookup failed" };
    const orderStatus = String((data as { status?: string } | null)?.status ?? "");
    if (orderStatus !== "completed" && orderStatus !== "delivered" && orderStatus !== "inspected") {
      return { unmet: "order_completed", reason: `order status is '${orderStatus}'` };
    }
  }

  return null;
}

async function loadEscrow(supabase: SupabaseClient, escrowId: string): Promise<EscrowRow | null> {
  const { data } = await supabase
    .schema("escrow_mcp")
    .from("escrows")
    .select("*")
    .eq("escrow_id", escrowId)
    .maybeSingle();
  return (data as EscrowRow | null) ?? null;
}

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function createEscrow({ args }: ToolRequest) {
  const supabase = serviceClient();
  const orderId = String(args.order_id ?? "");
  const buyerId = String(args.buyer_id ?? "");
  const sellerId = String(args.seller_id ?? "");
  const amount = Number(args.amount ?? 0);
  const currency = String(args.currency ?? "CAD");
  if (!orderId || !buyerId || !sellerId || amount <= 0) {
    return failEnvelope("VALIDATION_ERROR", "order_id, buyer_id, seller_id, amount>0 are required.");
  }
  const escrowId = generateId();
  const createdAt = now();
  const { error } = await supabase.schema("escrow_mcp").from("escrows").insert({
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
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await appendTimeline(supabase, escrowId, "created", amount, null, null, { currency });
  await emitEvent(supabase, SOURCE, "escrow.escrow.created", { escrow_id: escrowId, order_id: orderId, amount });
  return okEnvelope({ escrow_id: escrowId, status: "created" });
}

async function holdFunds({ args }: ToolRequest) {
  const supabase = serviceClient();
  const escrowId = String(args.escrow_id ?? "");
  if (!escrowId) return failEnvelope("VALIDATION_ERROR", "escrow_id is required.");
  const escrow = await loadEscrow(supabase, escrowId);
  if (!escrow) return failEnvelope("NOT_FOUND", "escrow_id not found");
  if (!canTransition(escrow.status, "hold_funds")) {
    return failEnvelope("INVALID_TRANSITION", `Cannot hold_funds from status ${escrow.status}`);
  }
  const amount = Number(args.amount ?? 0);
  if (amount <= 0) return failEnvelope("VALIDATION_ERROR", "amount must be > 0.");
  const heldAmount = roundToTwoDecimals(Number(escrow.held_amount ?? 0) + amount);
  const { error } = await supabase
    .schema("escrow_mcp")
    .from("escrows")
    .update({ status: "funds_held", held_amount: heldAmount, updated_at: now() })
    .eq("escrow_id", escrowId)
    .eq("status", escrow.status);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await appendTimeline(supabase, escrowId, "funds_held", amount, args.performed_by ? String(args.performed_by) : null, null, {});
  await emitEvent(supabase, SOURCE, "escrow.funds.held", { escrow_id: escrowId, amount });
  return okEnvelope({ escrow_id: escrowId, status: "funds_held", held_amount: heldAmount });
}

async function releaseFunds({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const escrowId = String(args.escrow_id ?? "");
  if (!escrowId) return failEnvelope("VALIDATION_ERROR", "escrow_id is required.");
  const escrow = await loadEscrow(supabase, escrowId);
  if (!escrow) return failEnvelope("NOT_FOUND", "escrow_id not found");
  if (!canTransition(escrow.status, "release_funds")) {
    return failEnvelope("INVALID_TRANSITION", `Cannot release_funds from status ${escrow.status}`);
  }
  const amount = Number(args.amount ?? 0);
  if (amount <= 0) return failEnvelope("VALIDATION_ERROR", "amount must be > 0.");
  const performedBy = String(args.performed_by ?? caller.userId);
  if (!performedBy) return failEnvelope("VALIDATION_ERROR", "performed_by is required.");
  const isParty = performedBy === escrow.buyer_id || performedBy === escrow.seller_id;
  const overrideConditions = Boolean(args.override_conditions);
  const isAdmin = !isParty || overrideConditions ? await isPlatformAdmin(supabase, performedBy) : false;
  if (!isParty && !isAdmin) {
    return failEnvelope("FORBIDDEN", "Only the buyer, seller, or a platform admin may release escrow funds.");
  }
  if (overrideConditions && !isAdmin) {
    return failEnvelope("FORBIDDEN", "Only platform admins may override release_conditions.");
  }
  if (!overrideConditions) {
    const unmet = await evaluateReleaseConditions(supabase, escrow);
    if (unmet) {
      return failEnvelope("RELEASE_CONDITIONS_UNMET", `Release condition '${unmet.unmet}' not satisfied: ${unmet.reason}.`);
    }
  }
  const heldAmount = Number(escrow.held_amount ?? 0);
  const releasedAmount = Number(escrow.released_amount ?? 0);
  if (amount > heldAmount) return failEnvelope("VALIDATION_ERROR", "Release amount exceeds held_amount.");
  const nextHeld = roundToTwoDecimals(heldAmount - amount);
  const nextReleased = roundToTwoDecimals(releasedAmount + amount);
  const nextStatus: EscrowStatus = nextHeld <= 0 ? "released" : "partially_released";
  const { error } = await supabase
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
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await appendTimeline(
    supabase,
    escrowId,
    nextStatus === "released" ? "released" : "partial_release",
    amount,
    performedBy,
    args.reason ? String(args.reason) : null,
    { override_conditions: overrideConditions },
  );
  await emitEvent(supabase, SOURCE, "escrow.funds.released", {
    escrow_id: escrowId,
    amount,
    status: nextStatus,
    performed_by: performedBy,
  });
  return okEnvelope({ escrow_id: escrowId, status: nextStatus, held_amount: nextHeld, released_amount: nextReleased });
}

async function freezeEscrow({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const escrowId = String(args.escrow_id ?? "");
  const reason = String(args.reason ?? "");
  const performedBy = String(args.performed_by ?? caller.userId);
  if (!escrowId || !reason || !performedBy) {
    return failEnvelope("VALIDATION_ERROR", "escrow_id, reason, performed_by are required.");
  }
  const escrow = await loadEscrow(supabase, escrowId);
  if (!escrow) return failEnvelope("NOT_FOUND", "escrow_id not found");
  if (!canTransition(escrow.status, "freeze_escrow")) {
    return failEnvelope("INVALID_TRANSITION", `Cannot freeze_escrow from status ${escrow.status}`);
  }
  const isParty = performedBy === escrow.buyer_id || performedBy === escrow.seller_id;
  if (!isParty && !(await isPlatformAdmin(supabase, performedBy))) {
    return failEnvelope("FORBIDDEN", "Only the buyer, seller, or a platform admin may freeze escrow.");
  }
  const { error } = await supabase
    .schema("escrow_mcp")
    .from("escrows")
    .update({ status: "frozen", frozen_reason: reason, frozen_by: performedBy, frozen_at: now(), updated_at: now() })
    .eq("escrow_id", escrowId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await appendTimeline(supabase, escrowId, "frozen", null, performedBy, reason, {});
  await emitEvent(supabase, SOURCE, "escrow.escrow.frozen", { escrow_id: escrowId, reason, performed_by: performedBy });
  return okEnvelope({ escrow_id: escrowId, status: "frozen", reason });
}

async function refundEscrow({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const escrowId = String(args.escrow_id ?? "");
  const amount = Number(args.amount ?? 0);
  const reason = String(args.reason ?? "");
  const performedBy = String(args.performed_by ?? caller.userId);
  if (!escrowId || amount <= 0 || !reason || !performedBy) {
    return failEnvelope("VALIDATION_ERROR", "escrow_id, amount>0, reason, performed_by are required.");
  }
  const escrow = await loadEscrow(supabase, escrowId);
  if (!escrow) return failEnvelope("NOT_FOUND", "escrow_id not found");
  if (!canTransition(escrow.status, "refund_escrow")) {
    return failEnvelope("INVALID_TRANSITION", `Cannot refund_escrow from status ${escrow.status}`);
  }
  const isParty = performedBy === escrow.buyer_id || performedBy === escrow.seller_id;
  if (!isParty && !(await isPlatformAdmin(supabase, performedBy))) {
    return failEnvelope("FORBIDDEN", "Only the buyer, seller, or a platform admin may refund escrow.");
  }
  const heldAmount = Number(escrow.held_amount ?? 0);
  const refundedAmount = Number(escrow.refunded_amount ?? 0);
  const originalAmount = Number(escrow.original_amount ?? 0);
  if (amount > heldAmount) return failEnvelope("VALIDATION_ERROR", "Refund amount exceeds held_amount.");
  if (refundedAmount + amount > originalAmount) {
    return failEnvelope("VALIDATION_ERROR", "Total refunds would exceed original_amount.");
  }
  const nextHeld = roundToTwoDecimals(heldAmount - amount);
  const nextRefunded = roundToTwoDecimals(refundedAmount + amount);
  const { error } = await supabase
    .schema("escrow_mcp")
    .from("escrows")
    .update({
      status: "refunded",
      held_amount: nextHeld,
      refunded_amount: nextRefunded,
      refunded_at: now(),
      updated_at: now(),
    })
    .eq("escrow_id", escrowId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await appendTimeline(supabase, escrowId, "refunded", amount, performedBy, reason, {});
  await emitEvent(supabase, SOURCE, "escrow.funds.refunded", {
    escrow_id: escrowId,
    amount,
    reason,
    performed_by: performedBy,
  });
  return okEnvelope({ escrow_id: escrowId, status: "refunded", held_amount: nextHeld, refunded_amount: nextRefunded });
}

async function setReleaseConditions({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const escrowId = String(args.escrow_id ?? "");
  const performedBy = String(args.performed_by ?? caller.userId);
  const conditions = (args.conditions ?? {}) as Record<string, unknown>;
  if (!escrowId || !performedBy) return failEnvelope("VALIDATION_ERROR", "escrow_id, performed_by are required.");
  if (typeof conditions !== "object" || conditions === null) {
    return failEnvelope("VALIDATION_ERROR", "conditions must be an object.");
  }
  const escrow = await loadEscrow(supabase, escrowId);
  if (!escrow) return failEnvelope("NOT_FOUND", "escrow_id not found");
  const isParty = performedBy === escrow.buyer_id || performedBy === escrow.seller_id;
  if (!isParty && !(await isPlatformAdmin(supabase, performedBy))) {
    return failEnvelope("FORBIDDEN", "Only the buyer, seller, or a platform admin may set release conditions.");
  }
  const { error } = await supabase
    .schema("escrow_mcp")
    .from("escrows")
    .update({ release_conditions: conditions, updated_at: now() })
    .eq("escrow_id", escrowId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await appendTimeline(supabase, escrowId, "conditions_set", null, performedBy, null, { conditions });
  await emitEvent(supabase, SOURCE, "escrow.conditions.set", { escrow_id: escrowId, performed_by: performedBy });
  return okEnvelope({ escrow_id: escrowId, release_conditions: conditions });
}

async function approveReleaseCondition({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const escrowId = String(args.escrow_id ?? "");
  const performedBy = String(args.performed_by ?? caller.userId);
  const condition = String(args.condition ?? "");
  if (!escrowId || !performedBy || !condition) {
    return failEnvelope("VALIDATION_ERROR", "escrow_id, performed_by, condition are required.");
  }
  const escrow = await loadEscrow(supabase, escrowId);
  if (!escrow) return failEnvelope("NOT_FOUND", "escrow_id not found");
  const isParty = performedBy === escrow.buyer_id || performedBy === escrow.seller_id;
  if (!isParty && !(await isPlatformAdmin(supabase, performedBy))) {
    return failEnvelope("FORBIDDEN", "Only the buyer, seller, or a platform admin may approve release conditions.");
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
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await appendTimeline(supabase, escrowId, "condition_approved", null, performedBy, condition, {});
  await emitEvent(supabase, SOURCE, "escrow.condition.approved", {
    escrow_id: escrowId,
    condition,
    performed_by: performedBy,
  });
  return okEnvelope({ escrow_id: escrowId, release_conditions: next });
}

async function getEscrow({ args }: ToolRequest) {
  const supabase = serviceClient();
  const escrowId = String(args.escrow_id ?? "");
  if (!escrowId) return failEnvelope("VALIDATION_ERROR", "escrow_id is required.");
  const escrow = await loadEscrow(supabase, escrowId);
  if (!escrow) return failEnvelope("NOT_FOUND", "escrow_id not found");
  const { data: timeline, error } = await supabase
    .schema("escrow_mcp")
    .from("escrow_timeline")
    .select("*")
    .eq("escrow_id", escrowId)
    .order("created_at", { ascending: true });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ escrow, timeline: timeline ?? [] });
}

async function listEscrows({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const statusFilter = args.status ? String(args.status) : "";
  const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);
  const isAdmin = await isPlatformAdmin(supabase, userId);
  let query = supabase
    .schema("escrow_mcp")
    .from("escrows")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!isAdmin) query = query.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data, error } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ escrows: data ?? [] });
}

Deno.serve(serveDomain({
  ping,
  create_escrow: createEscrow,
  hold_funds: holdFunds,
  release_funds: releaseFunds,
  freeze_escrow: freezeEscrow,
  refund_escrow: refundEscrow,
  set_release_conditions: setReleaseConditions,
  approve_release_condition: approveReleaseCondition,
  get_escrow: getEscrow,
  list_escrows: listEscrows,
}));
