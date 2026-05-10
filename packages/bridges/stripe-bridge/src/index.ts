import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "stripe-bridge";
const SERVER_VERSION = "0.1.0";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_API = "https://api.stripe.com/v1";
// Pinning the Stripe API version isolates us from server-side default
// upgrades that could silently change PaymentIntent state machine semantics.
// Bump deliberately when validating against newer Stripe behaviour.
// Refs: docs/audit/2026-05-10/p0-1-stripe-elements-plan.md §6 question 1.
const STRIPE_API_VERSION = "2024-11-20.acacia";
const isLive = Boolean(STRIPE_SECRET_KEY);

async function stripePost(
  path: string,
  params: Record<string, string>,
  opts: { idempotencyKey?: string } = {},
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(params).toString();
  const headers: Record<string, string> = {
    "authorization": `Bearer ${STRIPE_SECRET_KEY}`,
    "content-type": "application/x-www-form-urlencoded",
    "stripe-version": STRIPE_API_VERSION,
  };
  // Stripe's Idempotency-Key header dedupes retries for up to 24h. We pass
  // the caller-supplied key (typically the matex transaction_id) so a network
  // retry of the same logical operation returns the original PI rather than
  // creating a second one.
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  const response = await fetch(`${STRIPE_API}${path}`, { method: "POST", headers, body });
  return (await response.json()) as Record<string, unknown>;
}

function ok(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, live: isLive, ...data }) }] };
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "create_payment_intent", description: "Create Stripe PaymentIntent", inputSchema: { type: "object", properties: { amount: { type: "number" }, currency: { type: "string" }, metadata: { type: "object" }, idempotency_key: { type: "string" }, automatic_payment_methods: { type: "boolean" } }, required: ["amount"] } },
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
    const idempotencyKey = args.idempotency_key ? String(args.idempotency_key) : undefined;
    // Default to Stripe's automatic_payment_methods ON so a single
    // PaymentIntent can be confirmed via Card / Apple Pay / Google Pay /
    // Link without separate intents per method.
    const automaticMethods = args.automatic_payment_methods !== false;
    if (isLive) {
      const params: Record<string, string> = { amount: String(amount), currency };
      if (automaticMethods) params["automatic_payment_methods[enabled]"] = "true";
      // Flatten metadata { k: v } → metadata[k]=v, which is Stripe's
      // application/x-www-form-urlencoded convention.
      const metadata = (args.metadata as Record<string, unknown> | undefined) ?? {};
      for (const [k, v] of Object.entries(metadata)) {
        if (v == null) continue;
        params[`metadata[${k}]`] = String(v);
      }
      const result = await stripePost("/payment_intents", params, { idempotencyKey });
      // Surface Stripe's error envelope rather than fabricating a successful
      // response — payments-mcp depends on this to return DB_ERROR upstream.
      if (result.error) {
        const errObj = result.error as Record<string, unknown>;
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: String(errObj.code ?? "STRIPE_ERROR"), message: String(errObj.message ?? "Stripe rejected the request") } }) }] };
      }
      return ok({
        payment_intent_id: result.id,
        client_secret: result.client_secret,
        amount: Number(args.amount),
        currency,
        status: result.status,
      });
    }
    // Stub mode: return a fake but client_secret-shaped string so the
    // downstream Stripe.js confirm path will produce a reasonable error
    // (rather than a TypeError) when no real keys are configured.
    const stubId = `pi_stub_${Date.now()}`;
    return ok({
      payment_intent_id: stubId,
      client_secret: `${stubId}_secret_stub`,
      amount: Number(args.amount),
      currency,
      status: "requires_confirmation",
    });
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
