import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";

const SERVER_NAME = "accounting-bridge";
const SERVER_VERSION = "0.1.0";

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "sync_invoice", description: "Sync invoice to QuickBooks/Xero (stub)", inputSchema: { type: "object", properties: { invoice_id: { type: "string" }, provider: { type: "string" }, invoice_data: { type: "object" } }, required: ["invoice_id", "invoice_data"] } },
    { name: "sync_payment", description: "Sync payment record to accounting system (stub)", inputSchema: { type: "object", properties: { payment_id: { type: "string" }, provider: { type: "string" }, payment_data: { type: "object" } }, required: ["payment_id", "payment_data"] } },
    { name: "get_account_balance", description: "Get account balance from accounting system (stub)", inputSchema: { type: "object", properties: { account_id: { type: "string" }, provider: { type: "string" } }, required: ["account_id"] } },
    { name: "export_csv", description: "Export transactions as CSV (stub)", inputSchema: { type: "object", properties: { start_date: { type: "string" }, end_date: { type: "string" }, provider: { type: "string" }, account_id: { type: "string" } }, required: ["start_date", "end_date"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: JSON.stringify({ success: true, status: "ok", server: SERVER_NAME, version: SERVER_VERSION }) }] };
  }

  if (tool === "sync_invoice") {
    const invoiceId = String(args.invoice_id ?? "");
    if (!invoiceId) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "invoice_id is required." } }) }] };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          bridge: SERVER_NAME,
          provider: String(args.provider ?? "quickbooks"),
          invoice_id: invoiceId,
          external_id: `qb_inv_${randomUUID().slice(0, 8)}`,
          status: "synced",
          synced_at: new Date().toISOString(),
        }),
      }],
    };
  }

  if (tool === "sync_payment") {
    const paymentId = String(args.payment_id ?? "");
    if (!paymentId) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "payment_id is required." } }) }] };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          bridge: SERVER_NAME,
          provider: String(args.provider ?? "quickbooks"),
          payment_id: paymentId,
          external_id: `qb_pay_${randomUUID().slice(0, 8)}`,
          status: "synced",
          synced_at: new Date().toISOString(),
        }),
      }],
    };
  }

  if (tool === "get_account_balance") {
    const accountId = String(args.account_id ?? "");
    if (!accountId) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "account_id is required." } }) }] };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          bridge: SERVER_NAME,
          provider: String(args.provider ?? "quickbooks"),
          account_id: accountId,
          balance: 125430.75,
          currency: "CAD",
          as_of: new Date().toISOString(),
        }),
      }],
    };
  }

  if (tool === "export_csv") {
    const startDate = String(args.start_date ?? "");
    const endDate = String(args.end_date ?? "");
    if (!startDate || !endDate) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "start_date and end_date are required." } }) }] };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          bridge: SERVER_NAME,
          provider: String(args.provider ?? "quickbooks"),
          export_id: `exp_${randomUUID().slice(0, 8)}`,
          start_date: startDate,
          end_date: endDate,
          row_count: 142,
          download_url: `https://accounting.example.com/exports/exp_${Date.now()}.csv`,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        }),
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

main().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal`, error);
  process.exit(1);
});
