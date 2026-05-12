// Tax domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/tax-mcp/src/index.ts.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { isPlatformAdmin } from "../_shared/auth.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "tax-edge";
const PLATFORM_BUSINESS_NUMBER = Deno.env.get("CRA_BUSINESS_NUMBER") ?? "123456789 RT0001";

interface TaxBreakdown {
  gst: number; hst: number; pst: number; qst: number; total_tax: number; tax_type: string;
}

const PROVINCIAL_TAX_RATES: Record<string, { type: string; gst: number; hst: number; pst: number; qst: number }> = {
  ON: { type: "HST", gst: 0, hst: 0.13, pst: 0, qst: 0 },
  NB: { type: "HST", gst: 0, hst: 0.15, pst: 0, qst: 0 },
  NS: { type: "HST", gst: 0, hst: 0.15, pst: 0, qst: 0 },
  NL: { type: "HST", gst: 0, hst: 0.15, pst: 0, qst: 0 },
  PE: { type: "HST", gst: 0, hst: 0.15, pst: 0, qst: 0 },
  BC: { type: "GST+PST", gst: 0.05, hst: 0, pst: 0.07, qst: 0 },
  AB: { type: "GST", gst: 0.05, hst: 0, pst: 0, qst: 0 },
  SK: { type: "GST", gst: 0.05, hst: 0, pst: 0, qst: 0 },
  MB: { type: "GST", gst: 0.05, hst: 0, pst: 0, qst: 0 },
  QC: { type: "GST+QST", gst: 0.05, hst: 0, pst: 0, qst: 0.09975 },
  NT: { type: "GST", gst: 0.05, hst: 0, pst: 0, qst: 0 },
  NU: { type: "GST", gst: 0.05, hst: 0, pst: 0, qst: 0 },
  YT: { type: "GST", gst: 0.05, hst: 0, pst: 0, qst: 0 },
};

function calculateProvincialTax(buyerProvince: string, amount: number): TaxBreakdown {
  const rates = PROVINCIAL_TAX_RATES[buyerProvince.toUpperCase()];
  if (!rates) {
    const fallbackGst = Math.round(amount * 100 * 0.05) / 100;
    return { gst: fallbackGst, hst: 0, pst: 0, qst: 0, total_tax: fallbackGst, tax_type: "GST" };
  }
  const cents = Math.round(amount * 100);
  const gst = Math.round(cents * rates.gst) / 100;
  const hst = Math.round(cents * rates.hst) / 100;
  const pst = Math.round(cents * rates.pst) / 100;
  const qst = Math.round(cents * rates.qst) / 100;
  const total_tax = Number((gst + hst + pst + qst).toFixed(2));
  return { gst, hst, pst, qst, total_tax, tax_type: rates.type };
}

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function calculateTax({ args }: ToolRequest) {
  const amount = Number(args.amount ?? 0);
  const sellerProvince = String(args.seller_province ?? "");
  const buyerProvince = String(args.buyer_province ?? "");
  if (amount <= 0 || !sellerProvince || !buyerProvince) {
    return failEnvelope("VALIDATION_ERROR", "amount>0, seller_province, buyer_province are required.");
  }
  const breakdown = calculateProvincialTax(buyerProvince, amount);
  return okEnvelope({ amount, seller_province: sellerProvince, buyer_province: buyerProvince, ...breakdown });
}

async function generateInvoice({ args }: ToolRequest) {
  const orderId = String(args.order_id ?? "");
  if (!orderId) {
    return failEnvelope("VALIDATION_ERROR", "order_id is required.");
  }
  const supabase = serviceClient();

  // P1-13c — when callers (now including the reconciliation cron) pass only
  // order_id, look up the rest from orders_mcp.orders and profile_mcp.profiles
  // so the tool doesn't need every caller to assemble the full bundle.
  // Explicit args still win for the legacy /checkout flow that already has
  // the data in hand.
  let sellerId = String(args.seller_id ?? "");
  let buyerId = String(args.buyer_id ?? "");
  let sellerProvince = String(args.seller_province ?? "");
  let buyerProvince = String(args.buyer_province ?? "");
  let subtotal = Number(args.subtotal ?? 0);
  let commissionAmount = Number(args.commission_amount ?? 0);

  const needsOrderLookup =
    !sellerId || !buyerId || subtotal <= 0 || (!args.commission_amount && commissionAmount === 0);
  if (needsOrderLookup) {
    const order = await supabase
      .schema("orders_mcp")
      .from("orders")
      .select("seller_id,buyer_id,original_amount,commission_amount")
      .eq("order_id", orderId)
      .maybeSingle();
    if (order.error) return failEnvelope("DB_ERROR", "Database operation failed");
    if (!order.data) return failEnvelope("NOT_FOUND", "Order not found for invoice generation.");
    const row = order.data as Record<string, unknown>;
    if (!sellerId) sellerId = String(row.seller_id ?? "");
    if (!buyerId) buyerId = String(row.buyer_id ?? "");
    if (subtotal <= 0) subtotal = Number(row.original_amount ?? 0);
    if (!args.commission_amount) commissionAmount = Number(row.commission_amount ?? 0);
  }

  if (!sellerProvince || !buyerProvince) {
    const profiles = await supabase
      .schema("profile_mcp")
      .from("profiles")
      .select("user_id,province")
      .in("user_id", [sellerId, buyerId]);
    if (profiles.error) return failEnvelope("DB_ERROR", "Database operation failed");
    const byUser = new Map<string, string>(
      (profiles.data ?? []).map((p: Record<string, unknown>) => [String(p.user_id), String(p.province ?? "")]),
    );
    if (!sellerProvince) sellerProvince = byUser.get(sellerId) ?? "";
    if (!buyerProvince) buyerProvince = byUser.get(buyerId) ?? "";
  }

  if (!sellerId || !buyerId || !sellerProvince || !buyerProvince || subtotal <= 0) {
    return failEnvelope(
      "VALIDATION_ERROR",
      "Could not assemble invoice — order_id is required, and (seller_province, buyer_province, subtotal) must be supplied or derivable from the order + profile records.",
    );
  }
  const taxBreakdown = calculateProvincialTax(buyerProvince, subtotal);
  const commissionTax = commissionAmount > 0
    ? calculateProvincialTax(buyerProvince, commissionAmount)
    : { gst: 0, hst: 0, pst: 0, qst: 0, total_tax: 0 };
  const totalAmount = Number((subtotal + taxBreakdown.total_tax).toFixed(2));
  const issueDate = now();
  const dueDate = new Date(Date.now() + 30 * 86400000).toISOString();

  // Atomic, year-aware MTX-YYYY-NNNNNN allocation via the new migration.
  // The previous COUNT(*)-based fallback was racy under concurrent checkouts.
  // See supabase/migrations/20260510000000_invoice_number_year_atomic.sql.
  const seqResult = await supabase.rpc("next_invoice_number");
  if (seqResult.error || typeof seqResult.data !== "string" || !seqResult.data) {
    return failEnvelope("DB_ERROR", "Could not allocate invoice number.");
  }
  const invoiceNumber = seqResult.data;

  const lineItems = Array.isArray(args.line_items) && (args.line_items as unknown[]).length > 0
    ? (args.line_items as unknown[])
    : [
        { description: "Materials (subtotal)", amount: subtotal },
        { description: `Tax (${taxBreakdown.tax_type})`, amount: taxBreakdown.total_tax },
        ...(commissionAmount > 0 ? [{ description: "Platform commission", amount: commissionAmount }] : []),
      ];

  const invoiceId = generateId();
  const { error } = await supabase.schema("tax_mcp").from("invoices").insert({
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    order_id: orderId,
    seller_id: sellerId,
    buyer_id: buyerId,
    seller_province: sellerProvince,
    buyer_province: buyerProvince,
    subtotal,
    gst_amount: taxBreakdown.gst,
    hst_amount: taxBreakdown.hst,
    pst_amount: taxBreakdown.pst,
    qst_amount: taxBreakdown.qst,
    tax_amount: taxBreakdown.total_tax,
    tax_type: taxBreakdown.tax_type,
    commission_amount: commissionAmount,
    commission_tax_amount: commissionTax.total_tax,
    total_amount: totalAmount,
    line_items: lineItems,
    status: "issued",
    currency: "CAD",
    business_number: PLATFORM_BUSINESS_NUMBER,
    issue_date: issueDate,
    due_date: dueDate,
    issued_at: issueDate,
    created_at: issueDate,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "tax.invoice.issued", {
    invoice_id: invoiceId, invoice_number: invoiceNumber, order_id: orderId, total_amount: totalAmount,
  });
  return okEnvelope({ invoice_id: invoiceId, invoice_number: invoiceNumber, subtotal, tax: taxBreakdown, total_amount: totalAmount });
}

async function getInvoice({ args }: ToolRequest) {
  const supabase = serviceClient();
  const invoiceId = args.invoice_id ? String(args.invoice_id) : null;
  const invoiceNumber = args.invoice_number ? String(args.invoice_number) : null;
  if (!invoiceId && !invoiceNumber) return failEnvelope("VALIDATION_ERROR", "invoice_id or invoice_number is required.");
  let query = supabase.schema("tax_mcp").from("invoices").select("*");
  if (invoiceId) query = query.eq("invoice_id", invoiceId);
  else if (invoiceNumber) query = query.eq("invoice_number", invoiceNumber);
  const { data, error } = await query.maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!data) return failEnvelope("NOT_FOUND", "Invoice not found.");
  return okEnvelope({ invoice: data });
}

async function voidInvoice({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const invoiceId = String(args.invoice_id ?? "");
  const reason = String(args.reason ?? "");
  const voidedBy = String(args.voided_by ?? caller.userId);
  if (!invoiceId || !reason || !voidedBy) {
    return failEnvelope("VALIDATION_ERROR", "invoice_id, reason, voided_by are required.");
  }
  const { error } = await supabase.schema("tax_mcp").from("invoices")
    .update({ status: "voided", void_reason: reason, voided_by: voidedBy, voided_at: now() })
    .eq("invoice_id", invoiceId).eq("status", "issued");
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "tax.invoice.voided", { invoice_id: invoiceId, reason });
  return okEnvelope({ invoice_id: invoiceId, status: "voided" });
}

async function getRemittanceSummary({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  if (!(await isPlatformAdmin(supabase, caller.userId))) {
    return failEnvelope("FORBIDDEN", "Platform admin access required.");
  }
  const periodStart = String(args.period_start ?? "");
  const periodEnd = String(args.period_end ?? "");
  if (!periodStart || !periodEnd) return failEnvelope("VALIDATION_ERROR", "period_start and period_end are required.");

  const { data, error } = await supabase.schema("tax_mcp").from("invoices")
    .select("gst_amount,hst_amount,pst_amount,qst_amount,tax_amount,subtotal,total_amount,buyer_province")
    .eq("status", "issued").gte("issued_at", periodStart).lte("issued_at", periodEnd);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const summary = {
    period_start: periodStart,
    period_end: periodEnd,
    invoice_count: rows.length,
    total_gst: Number(rows.reduce((s, r) => s + Number(r.gst_amount ?? 0), 0).toFixed(2)),
    total_hst: Number(rows.reduce((s, r) => s + Number(r.hst_amount ?? 0), 0).toFixed(2)),
    total_pst: Number(rows.reduce((s, r) => s + Number(r.pst_amount ?? 0), 0).toFixed(2)),
    total_qst: Number(rows.reduce((s, r) => s + Number(r.qst_amount ?? 0), 0).toFixed(2)),
    total_tax_collected: Number(rows.reduce((s, r) => s + Number(r.tax_amount ?? 0), 0).toFixed(2)),
    total_subtotal: Number(rows.reduce((s, r) => s + Number(r.subtotal ?? 0), 0).toFixed(2)),
    total_revenue: Number(rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0).toFixed(2)),
  };
  return okEnvelope(summary);
}

Deno.serve(serveDomain({
  ping,
  calculate_tax: calculateTax,
  generate_invoice: generateInvoice,
  get_invoice: getInvoice,
  void_invoice: voidInvoice,
  get_remittance_summary: getRemittanceSummary,
}));
