import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "stripe-bridge";
const SERVER_VERSION = "0.1.0";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_API = "https://api.stripe.com/v1";
const isLive = Boolean(STRIPE_SECRET_KEY);

async function stripePost(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(params).toString();
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return (await response.json()) as Record<string, unknown>;
}

function ok(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, live: isLive, ...data }) }] };
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "create_payment_intent", description: "Create Stripe PaymentIntent", inputSchema: { type: "object", properties: { amount: { type: "number" }, currency: { type: "string" } }, required: ["amount"] } },
    { name: "confirm_payment", description: "Confirm Stripe PaymentIntent", inputSchema: { type: "object", properties: { payment_intent_id: { type: "string" } }, required: ["payment_intent_id"] } },
    { name: "create_refund", description: "Create Stripe refund", inputSchema: { type: "object", properties: { payment_intent_id: { type: "string" }, amount: { type: "number" } }, required: ["payment_intent_id"] } },
    { name: "create_transfer", description: "Create Stripe Connect transfer", inputSchema: { type: "object", properties: { destination_account: { type: "string" }, amount: { type: "number" } }, required: ["destination_account", "amount"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return ok({ status: "ok", server: SERVER_NAME, mode: isLive ? "live" : "stub" });
  }

  if (tool === "create_payment_intent") {
    const amount = Math.round(Number(args.amount ?? 0) * 100);
    const currency = String(args.currency ?? "cad");
    if (isLive) {
      const result = await stripePost("/payment_intents", { amount: String(amount), currency });
      return ok({ payment_intent_id: result.id, amount: Number(args.amount), currency, status: result.status });
    }
    return ok({ payment_intent_id: `pi_stub_${Date.now()}`, amount: Number(args.amount), currency, status: "requires_confirmation" });
  }

  if (tool === "confirm_payment") {
    const piId = String(args.payment_intent_id ?? "");
    if (isLive) {
      const result = await stripePost(`/payment_intents/${piId}/confirm`, {});
      return ok({ payment_intent_id: piId, status: result.status });
    }
    return ok({ payment_intent_id: piId, status: "succeeded" });
  }

  if (tool === "create_refund") {
    const piId = String(args.payment_intent_id ?? "");
    if (isLive) {
      const params: Record<string, string> = { payment_intent: piId };
      if (typeof args.amount === "number") params.amount = String(Math.round(args.amount * 100));
      const result = await stripePost("/refunds", params);
      return ok({ refund_id: result.id, payment_intent_id: piId, status: result.status });
    }
    return ok({ refund_id: `re_stub_${Date.now()}`, payment_intent_id: piId, status: "succeeded" });
  }

  if (tool === "create_transfer") {
    const dest = String(args.destination_account ?? "");
    const amount = Math.round(Number(args.amount ?? 0) * 100);
    if (isLive) {
      const result = await stripePost("/transfers", { destination: dest, amount: String(amount), currency: "cad" });
      return ok({ transfer_id: result.id, destination_account: dest, amount: Number(args.amount), status: "paid" });
    }
    return ok({ transfer_id: `tr_stub_${Date.now()}`, destination_account: dest, amount: Number(args.amount), status: "paid" });
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started (${isLive ? "LIVE" : "STUB"} mode)`);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal`, error);
  process.exit(1);
});
