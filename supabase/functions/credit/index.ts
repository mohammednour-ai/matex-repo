// Credit domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/credit-mcp/src/index.ts.

import { failEnvelope, generateId, now, okEnvelope, roundToTwoDecimals } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "credit-edge";

const CREDIT_TIERS: Record<string, { min: number; max: number; limit: number; terms: string }> = {
  none: { min: 0, max: 499, limit: 0, terms: "100% upfront" },
  basic: { min: 500, max: 599, limit: 25000, terms: "Net 15" },
  standard: { min: 600, max: 699, limit: 100000, terms: "Net 30" },
  premium: { min: 700, max: 799, limit: 500000, terms: "Net 60" },
  enterprise: { min: 800, max: 850, limit: 2000000, terms: "Net 90" },
};

function getTierForScore(score: number): string {
  for (const [tier, range] of Object.entries(CREDIT_TIERS)) {
    if (score >= range.min && score <= range.max) return tier;
  }
  return "none";
}

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function assessCredit({ args }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? "");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const factors = (args.factors ?? {}) as Record<string, number>;
  const weights: Record<string, number> = {
    payment_history: 0.30, volume: 0.20, pis: 0.15, account_age: 0.10, external: 0.15, financial: 0.10,
  };
  let weightedScore = 0;
  for (const [factor, weight] of Object.entries(weights)) {
    const value = Math.min(100, Math.max(0, Number(factors[factor] ?? 50)));
    weightedScore += value * weight;
  }
  const score = Math.round(300 + (weightedScore / 100) * 550);
  const clampedScore = Math.min(850, Math.max(300, score));
  const tier = getTierForScore(clampedScore);
  const tierConfig = CREDIT_TIERS[tier];
  const ts = now();
  const existing = await supabase.schema("credit_mcp").from("credit_facilities")
    .select("facility_id").eq("user_id", userId).maybeSingle();
  if (existing.data?.facility_id) {
    const { error } = await supabase.schema("credit_mcp").from("credit_facilities")
      .update({ credit_score: clampedScore, tier, credit_limit: tierConfig.limit, terms: tierConfig.terms, updated_at: ts })
      .eq("facility_id", existing.data.facility_id);
    if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  } else {
    const { error } = await supabase.schema("credit_mcp").from("credit_facilities").insert({
      facility_id: generateId(), user_id: userId,
      credit_score: clampedScore, tier, credit_limit: tierConfig.limit,
      total_outstanding: 0, available_credit: tierConfig.limit,
      terms: tierConfig.terms, status: "active",
      created_at: ts, updated_at: ts,
    });
    if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  }
  await supabase.schema("credit_mcp").from("credit_score_history").insert({
    history_id: generateId(), user_id: userId,
    score: clampedScore, tier, factors, created_at: ts,
  });
  await emitEvent(supabase, SOURCE, "credit.facility.assessed", { user_id: userId, score: clampedScore, tier });
  return okEnvelope({ user_id: userId, score: clampedScore, tier, credit_limit: tierConfig.limit, terms: tierConfig.terms });
}

async function getCreditFacility({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const { data, error } = await supabase.schema("credit_mcp").from("credit_facilities")
    .select("*").eq("user_id", userId).maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!data) return okEnvelope({ facility: null, message: "No credit facility found." });
  return okEnvelope({ facility: data });
}

async function drawCredit({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  const amount = Number(args.amount ?? 0);
  const orderId = args.order_id ? String(args.order_id) : null;
  const description = String(args.description ?? "Credit draw");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  if (!Number.isFinite(amount) || amount <= 0) return failEnvelope("VALIDATION_ERROR", "amount must be greater than 0.");
  const facility = await supabase.schema("credit_mcp").from("credit_facilities")
    .select("facility_id,available_credit,total_outstanding,credit_limit,status")
    .eq("user_id", userId).maybeSingle();
  if (facility.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!facility.data) return failEnvelope("NO_FACILITY", "No credit facility found for this user.");
  if (facility.data.status === "frozen") return failEnvelope("FACILITY_FROZEN", "Credit facility is frozen.");
  if (amount > Number(facility.data.available_credit)) {
    return failEnvelope("INSUFFICIENT_CREDIT", `Requested ${amount} exceeds available credit ${facility.data.available_credit}.`);
  }
  const invoiceId = generateId();
  const ts = now();
  const inv = await supabase.schema("credit_mcp").from("credit_invoices").insert({
    invoice_id: invoiceId, facility_id: facility.data.facility_id,
    user_id: userId, order_id: orderId,
    amount: roundToTwoDecimals(amount), description,
    status: "outstanding", created_at: ts,
    due_date: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  if (inv.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const newOutstanding = roundToTwoDecimals(Number(facility.data.total_outstanding) + amount);
  const newAvailable = roundToTwoDecimals(Number(facility.data.credit_limit) - newOutstanding);
  const facUpdate = await supabase.schema("credit_mcp").from("credit_facilities")
    .update({ total_outstanding: newOutstanding, available_credit: newAvailable, updated_at: ts })
    .eq("facility_id", facility.data.facility_id)
    .eq("available_credit", facility.data.available_credit);
  if (facUpdate.error) {
    await supabase.schema("credit_mcp").from("credit_invoices").delete().eq("invoice_id", invoiceId);
    return failEnvelope("CONCURRENCY_CONFLICT", "Credit facility changed concurrently, please retry.");
  }
  await emitEvent(supabase, SOURCE, "credit.draw.created", { user_id: userId, invoice_id: invoiceId, amount });
  return okEnvelope({ invoice_id: invoiceId, amount: roundToTwoDecimals(amount), available_credit: newAvailable });
}

async function recordPayment({ args }: ToolRequest) {
  const supabase = serviceClient();
  const invoiceId = String(args.invoice_id ?? "");
  const amountPaid = Number(args.amount_paid ?? 0);
  if (!invoiceId) return failEnvelope("VALIDATION_ERROR", "invoice_id is required.");
  if (!Number.isFinite(amountPaid) || amountPaid <= 0) return failEnvelope("VALIDATION_ERROR", "amount_paid must be greater than 0.");
  const invoice = await supabase.schema("credit_mcp").from("credit_invoices")
    .select("invoice_id,facility_id,user_id,amount,status").eq("invoice_id", invoiceId).maybeSingle();
  if (invoice.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!invoice.data) return failEnvelope("NOT_FOUND", "Invoice not found.");
  if (invoice.data.status === "paid") return failEnvelope("ALREADY_PAID", "Invoice is already paid.");
  const paidAt = now();
  await supabase.schema("credit_mcp").from("credit_invoices")
    .update({ status: "paid", paid_at: paidAt, amount_paid: roundToTwoDecimals(amountPaid) })
    .eq("invoice_id", invoiceId);
  const facility = await supabase.schema("credit_mcp").from("credit_facilities")
    .select("facility_id,total_outstanding,credit_limit").eq("facility_id", invoice.data.facility_id).maybeSingle();
  if (facility.data) {
    const newOutstanding = roundToTwoDecimals(Math.max(0, Number(facility.data.total_outstanding) - amountPaid));
    const newAvailable = roundToTwoDecimals(Number(facility.data.credit_limit) - newOutstanding);
    await supabase.schema("credit_mcp").from("credit_facilities")
      .update({ total_outstanding: newOutstanding, available_credit: newAvailable, updated_at: paidAt })
      .eq("facility_id", facility.data.facility_id);
  }
  await emitEvent(supabase, SOURCE, "credit.payment.recorded", {
    invoice_id: invoiceId, user_id: invoice.data.user_id, amount_paid: amountPaid,
  });
  return okEnvelope({ invoice_id: invoiceId, status: "paid", amount_paid: roundToTwoDecimals(amountPaid) });
}

async function getCreditHistory({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const { data, error } = await supabase.schema("credit_mcp").from("credit_score_history")
    .select("history_id,user_id,score,tier,factors,created_at")
    .eq("user_id", userId).order("created_at", { ascending: false });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ history: data ?? [], total: (data ?? []).length });
}

async function freezeFacility({ args }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? "");
  const reason = String(args.reason ?? "");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  if (!reason) return failEnvelope("VALIDATION_ERROR", "reason is required.");
  const facility = await supabase.schema("credit_mcp").from("credit_facilities")
    .select("facility_id,status").eq("user_id", userId).maybeSingle();
  if (facility.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!facility.data) return failEnvelope("NOT_FOUND", "No credit facility found.");
  if (facility.data.status === "frozen") return failEnvelope("ALREADY_FROZEN", "Facility is already frozen.");
  const ts = now();
  const { error } = await supabase.schema("credit_mcp").from("credit_facilities")
    .update({ status: "frozen", frozen_at: ts, freeze_reason: reason, updated_at: ts })
    .eq("facility_id", facility.data.facility_id);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "credit.facility.frozen", {
    user_id: userId, facility_id: facility.data.facility_id, reason,
  });
  return okEnvelope({ facility_id: facility.data.facility_id, status: "frozen", reason });
}

Deno.serve(serveDomain({
  ping,
  assess_credit: assessCredit,
  get_credit_facility: getCreditFacility,
  draw_credit: drawCredit,
  record_payment: recordPayment,
  get_credit_history: getCreditHistory,
  freeze_facility: freezeFacility,
}));
