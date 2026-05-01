import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "tax-mcp";
const SERVER_VERSION = "0.1.0";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
// CRA Business Number format: 9-digit BN + RT + 4 digit program account
const PLATFORM_BUSINESS_NUMBER = process.env.CRA_BUSINESS_NUMBER ?? "123456789 RT0001";

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

type TaxBreakdown = {
  gst: number;
  hst: number;
  pst: number;
  qst: number;
  total_tax: number;
  tax_type: string;
};

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
  const amountCents = Math.round(amount * 100);
  const gst = Math.round(amountCents * rates.gst) / 100;
  const hst = Math.round(amountCents * rates.hst) / 100;
  const pst = Math.round(amountCents * rates.pst) / 100;
  const qst = Math.round(amountCents * rates.qst) / 100;
  const total_tax = Number((gst + hst + pst + qst).toFixed(2));
  return { gst, hst, pst, qst, total_tax, tax_type: rates.type };
}

function generateInvoiceNumber(year: number, seq: number): string {
  return `MTX-${year}-${String(seq).padStart(6, "0")}`;
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "calculate_tax", description: "Calculate GST/HST/PST/QST based on seller and buyer provinces", inputSchema: { type: "object", properties: { amount: { type: "number" }, seller_province: { type: "string" }, buyer_province: { type: "string" } }, required: ["amount", "seller_province", "buyer_province"] } },
    { name: "generate_invoice", description: "Generate an invoice with sequential MTX-YYYY-NNNNNN number", inputSchema: { type: "object", properties: { order_id: { type: "string" }, seller_id: { type: "string" }, buyer_id: { type: "string" }, seller_province: { type: "string" }, buyer_province: { type: "string" }, subtotal: { type: "number" }, commission_amount: { type: "number" }, line_items: { type: "array" } }, required: ["order_id", "seller_id", "buyer_id", "seller_province", "buyer_province", "subtotal"] } },
    { name: "get_invoice", description: "Get invoice by ID or invoice number", inputSchema: { type: "object", properties: { invoice_id: { type: "string" }, invoice_number: { type: "string" } }, required: [] } },
    { name: "void_invoice", description: "Void an existing invoice", inputSchema: { type: "object", properties: { invoice_id: { type: "string" }, reason: { type: "string" }, voided_by: { type: "string" } }, required: ["invoice_id", "reason", "voided_by"] } },
    { name: "get_remittance_summary", description: "Get tax remittance summary for a period", inputSchema: { type: "object", properties: { period_start: { type: "string" }, period_end: { type: "string" } }, required: ["period_start", "period_end"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }
  if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for tax-mcp.");

  if (tool === "calculate_tax") {
    const amount = Number(args.amount ?? 0);
    const sellerProvince = String(args.seller_province ?? "");
    const buyerProvince = String(args.buyer_province ?? "");
    if (amount <= 0 || !sellerProvince || !buyerProvince) return fail("VALIDATION_ERROR", "amount>0, seller_province, buyer_province are required.");

    const breakdown = calculateProvincialTax(buyerProvince, amount);
    return { content: [{ type: "text", text: ok({ amount, seller_province: sellerProvince, buyer_province: buyerProvince, ...breakdown }) }] };
  }

  if (tool === "generate_invoice") {
    const orderId = String(args.order_id ?? "");
    const sellerId = String(args.seller_id ?? "");
    const buyerId = String(args.buyer_id ?? "");
    const sellerProvince = String(args.seller_province ?? "");
    const buyerProvince = String(args.buyer_province ?? "");
    const subtotal = Number(args.subtotal ?? 0);
    if (!orderId || !sellerId || !buyerId || !sellerProvince || !buyerProvince || subtotal <= 0) {
      return fail("VALIDATION_ERROR", "order_id, seller_id, buyer_id, seller_province, buyer_province, subtotal>0 are required.");
    }

    const taxBreakdown = calculateProvincialTax(buyerProvince, subtotal);
    const commissionAmount = Number(args.commission_amount ?? 0);
    const commissionTax = commissionAmount > 0 ? calculateProvincialTax(buyerProvince, commissionAmount) : { gst: 0, hst: 0, pst: 0, qst: 0, total_tax: 0 };
    const totalAmount = Number((subtotal + taxBreakdown.total_tax).toFixed(2));

    const currentYear = new Date().getFullYear();
    const issueDate = now();
    const dueDate = new Date(Date.now() + 30 * 86400000).toISOString();

    // Use PostgreSQL sequence for collision-free invoice numbering.
    let nextSeq: number;
    const seqResult = await supabase.rpc("next_invoice_seq");
    if (seqResult.error || seqResult.data == null) {
      // Fallback: COUNT + 1 (acceptable only when sequence RPC is unavailable).
      const countResult = await supabase.schema("tax_mcp").from("invoices")
        .select("invoice_number", { count: "exact" })
        .like("invoice_number", `MTX-${currentYear}-%`);
      nextSeq = (countResult.count ?? 0) + 1;
    } else {
      nextSeq = Number(seqResult.data);
    }
    const invoiceNumber = generateInvoiceNumber(currentYear, nextSeq);

    const lineItems = Array.isArray(args.line_items) && args.line_items.length > 0
      ? args.line_items
      : [
          { description: "Materials (subtotal)", amount: subtotal },
          { description: `Tax (${taxBreakdown.tax_type})`, amount: taxBreakdown.total_tax },
          ...(commissionAmount > 0 ? [{ description: "Platform commission", amount: commissionAmount }] : []),
        ];

    const invoiceId = generateId();
    const insertResult = await supabase.schema("tax_mcp").from("invoices").insert({
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
    if (insertResult.error) return fail("DB_ERROR", insertResult.error.message);

    await emitEvent("tax.invoice.issued", { invoice_id: invoiceId, invoice_number: invoiceNumber, order_id: orderId, total_amount: totalAmount });
    return { content: [{ type: "text", text: ok({ invoice_id: invoiceId, invoice_number: invoiceNumber, subtotal, tax: taxBreakdown, total_amount: totalAmount }) }] };
  }

  if (tool === "get_invoice") {
    const invoiceId = args.invoice_id ? String(args.invoice_id) : null;
    const invoiceNumber = args.invoice_number ? String(args.invoice_number) : null;
    if (!invoiceId && !invoiceNumber) return fail("VALIDATION_ERROR", "invoice_id or invoice_number is required.");

    let query = supabase.schema("tax_mcp").from("invoices").select("*");
    if (invoiceId) query = query.eq("invoice_id", invoiceId);
    else if (invoiceNumber) query = query.eq("invoice_number", invoiceNumber);

    const result = await query.maybeSingle();
    if (result.error) return fail("DB_ERROR", result.error.message);
    if (!result.data) return fail("NOT_FOUND", "Invoice not found.");
    return { content: [{ type: "text", text: ok({ invoice: result.data }) }] };
  }

  if (tool === "void_invoice") {
    const invoiceId = String(args.invoice_id ?? "");
    const reason = String(args.reason ?? "");
    const voidedBy = String(args.voided_by ?? "");
    if (!invoiceId || !reason || !voidedBy) return fail("VALIDATION_ERROR", "invoice_id, reason, voided_by are required.");

    const updateResult = await supabase.schema("tax_mcp").from("invoices")
      .update({ status: "voided", void_reason: reason, voided_by: voidedBy, voided_at: now() })
      .eq("invoice_id", invoiceId)
      .eq("status", "issued");
    if (updateResult.error) return fail("DB_ERROR", updateResult.error.message);

    await emitEvent("tax.invoice.voided", { invoice_id: invoiceId, reason });
    return { content: [{ type: "text", text: ok({ invoice_id: invoiceId, status: "voided" }) }] };
  }

  if (tool === "get_remittance_summary") {
    const periodStart = String(args.period_start ?? "");
    const periodEnd = String(args.period_end ?? "");
    if (!periodStart || !periodEnd) return fail("VALIDATION_ERROR", "period_start and period_end are required.");

    const invoicesResult = await supabase.schema("tax_mcp").from("invoices")
      .select("gst_amount,hst_amount,pst_amount,qst_amount,tax_amount,subtotal,total_amount,buyer_province")
      .eq("status", "issued")
      .gte("issued_at", periodStart)
      .lte("issued_at", periodEnd);
    if (invoicesResult.error) return fail("DB_ERROR", invoicesResult.error.message);

    const rows = (invoicesResult.data ?? []) as Array<Record<string, unknown>>;
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

    return { content: [{ type: "text", text: ok(summary) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("tax", Number(process.env.MCP_HTTP_PORT ?? 4116));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
