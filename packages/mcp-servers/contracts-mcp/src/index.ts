import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { callServer, generateId, MatexEventBus, now, sha256 } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "contracts-mcp";
const SERVER_VERSION = "0.1.0";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;

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

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "create_contract", description: "Create a new supply contract", inputSchema: { type: "object", properties: { buyer_id: { type: "string" }, seller_id: { type: "string" }, contract_type: { type: "string" }, material_category: { type: "string" }, quantity_kg: { type: "number" }, price_per_kg: { type: "number" }, currency: { type: "string" }, delivery_frequency: { type: "string" }, start_date: { type: "string" }, end_date: { type: "string" }, terms: { type: "object" } }, required: ["buyer_id", "seller_id", "contract_type", "material_category", "quantity_kg", "price_per_kg"] } },
    { name: "activate_contract", description: "Activate a draft contract after eSign completion", inputSchema: { type: "object", properties: { contract_id: { type: "string" }, esign_document_id: { type: "string" } }, required: ["contract_id"] } },
    { name: "generate_order", description: "Auto-generate an order from an active contract", inputSchema: { type: "object", properties: { contract_id: { type: "string" }, quantity_kg: { type: "number" }, delivery_date: { type: "string" } }, required: ["contract_id"] } },
    { name: "negotiate_terms", description: "Propose changes to contract terms", inputSchema: { type: "object", properties: { contract_id: { type: "string" }, proposed_by: { type: "string" }, proposed_changes: { type: "object" }, message: { type: "string" } }, required: ["contract_id", "proposed_by", "proposed_changes"] } },
    { name: "get_contract", description: "Get contract with orders and negotiations", inputSchema: { type: "object", properties: { contract_id: { type: "string" } }, required: ["contract_id"] } },
    { name: "terminate_contract", description: "Terminate an active contract", inputSchema: { type: "object", properties: { contract_id: { type: "string" }, reason: { type: "string" }, terminated_by: { type: "string" } }, required: ["contract_id", "reason", "terminated_by"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }
  if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for contracts-mcp.");

  if (tool === "create_contract") {
    const buyerId = String(args.buyer_id ?? "");
    const sellerId = String(args.seller_id ?? "");
    const contractType = String(args.contract_type ?? "");
    const materialCategory = String(args.material_category ?? "");
    const quantityKg = Number(args.quantity_kg ?? 0);
    const pricePerKg = Number(args.price_per_kg ?? 0);
    if (!buyerId || !sellerId || !contractType || !materialCategory || quantityKg <= 0 || pricePerKg <= 0) {
      return fail("VALIDATION_ERROR", "buyer_id, seller_id, contract_type, material_category, quantity_kg>0, price_per_kg>0 are required.");
    }

    const contractId = generateId();
    const totalValue = Number((quantityKg * pricePerKg).toFixed(2));
    const termsPayload = (args.terms ?? {}) as Record<string, unknown>;
    const termsHash = sha256(JSON.stringify(termsPayload));
    const insertResult = await supabase.schema("contracts_mcp").from("contracts").insert({
      contract_id: contractId,
      buyer_id: buyerId,
      seller_id: sellerId,
      contract_type: contractType,
      material_category: materialCategory,
      quantity_kg: quantityKg,
      price_per_kg: pricePerKg,
      total_value: totalValue,
      currency: String(args.currency ?? "CAD"),
      delivery_frequency: args.delivery_frequency ? String(args.delivery_frequency) : null,
      start_date: args.start_date ? String(args.start_date) : null,
      end_date: args.end_date ? String(args.end_date) : null,
      terms: termsPayload,
      terms_hash: termsHash,
      status: "draft",
      created_at: now(),
      updated_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", insertResult.error.message);

    await emitEvent("contracts.contract.created", { contract_id: contractId, buyer_id: buyerId, seller_id: sellerId, contract_type: contractType });
    return { content: [{ type: "text", text: ok({ contract_id: contractId, status: "draft", total_value: totalValue }) }] };
  }

  if (tool === "activate_contract") {
    const contractId = String(args.contract_id ?? "");
    if (!contractId) return fail("VALIDATION_ERROR", "contract_id is required.");

    const updateResult = await supabase.schema("contracts_mcp").from("contracts")
      .update({ status: "active", esign_document_id: args.esign_document_id ? String(args.esign_document_id) : null, activated_at: now(), updated_at: now() })
      .eq("contract_id", contractId)
      .eq("status", "draft");
    if (updateResult.error) return fail("DB_ERROR", updateResult.error.message);

    await emitEvent("contracts.contract.activated", { contract_id: contractId });
    return { content: [{ type: "text", text: ok({ contract_id: contractId, status: "active" }) }] };
  }

  if (tool === "generate_order") {
    const contractId = String(args.contract_id ?? "");
    if (!contractId) return fail("VALIDATION_ERROR", "contract_id is required.");

    const contractResult = await supabase.schema("contracts_mcp").from("contracts").select("*").eq("contract_id", contractId).eq("status", "active").maybeSingle();
    if (contractResult.error) return fail("DB_ERROR", contractResult.error.message);
    if (!contractResult.data) return fail("NOT_FOUND", "Active contract not found.");

    const contract = contractResult.data as Record<string, unknown>;
    const orderQuantity = Number(args.quantity_kg ?? contract.quantity_kg ?? 0);
    const pricePerKg = Number(contract.price_per_kg ?? 0);
    const orderAmount = Number((orderQuantity * pricePerKg).toFixed(2));

    const orderId = generateId();
    const insertResult = await supabase.schema("contracts_mcp").from("contract_orders").insert({
      order_id: orderId,
      contract_id: contractId,
      quantity_kg: orderQuantity,
      price_per_kg: pricePerKg,
      order_amount: orderAmount,
      delivery_date: args.delivery_date ? String(args.delivery_date) : null,
      status: "pending_confirmation",
      created_at: now(),
      updated_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", insertResult.error.message);

    await emitEvent("contracts.order.triggered", { contract_id: contractId, order_id: orderId, order_amount: orderAmount });
    return { content: [{ type: "text", text: ok({ order_id: orderId, contract_id: contractId, order_amount: orderAmount, status: "pending_confirmation" }) }] };
  }

  if (tool === "negotiate_terms") {
    const contractId = String(args.contract_id ?? "");
    const proposedBy = String(args._user_id ?? args.proposed_by ?? "");
    const proposedChanges = args.proposed_changes as Record<string, unknown> | undefined;
    if (!contractId || !proposedBy || !proposedChanges) return fail("VALIDATION_ERROR", "contract_id, proposed_by, proposed_changes are required.");

    const { data: contract, error: fetchErr } = await supabase.schema("contracts_mcp").from("contracts").select("buyer_id,seller_id").eq("contract_id", contractId).maybeSingle();
    if (fetchErr) return fail("DB_ERROR", fetchErr.message);
    if (!contract) return fail("NOT_FOUND", "Contract not found.");
    if (String(contract.buyer_id) !== proposedBy && String(contract.seller_id) !== proposedBy) {
      return fail("FORBIDDEN", "Only the buyer or seller can propose changes to this contract.");
    }

    const negotiationId = generateId();
    const insertResult = await supabase.schema("contracts_mcp").from("negotiations").insert({
      negotiation_id: negotiationId,
      contract_id: contractId,
      proposed_by: proposedBy,
      proposed_changes: proposedChanges,
      message: args.message ? String(args.message) : null,
      status: "proposed",
      created_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", insertResult.error.message);

    await emitEvent("contracts.negotiation.proposed", { contract_id: contractId, negotiation_id: negotiationId, proposed_by: proposedBy });
    return { content: [{ type: "text", text: ok({ negotiation_id: negotiationId, contract_id: contractId, status: "proposed" }) }] };
  }

  if (tool === "get_contract") {
    const contractId = String(args.contract_id ?? "");
    if (!contractId) return fail("VALIDATION_ERROR", "contract_id is required.");

    const contractResult = await supabase.schema("contracts_mcp").from("contracts").select("*").eq("contract_id", contractId).maybeSingle();
    if (contractResult.error) return fail("DB_ERROR", contractResult.error.message);
    if (!contractResult.data) return fail("NOT_FOUND", "Contract not found.");

    const ordersResult = await supabase.schema("contracts_mcp").from("contract_orders").select("*").eq("contract_id", contractId).order("created_at", { ascending: false });
    const negotiationsResult = await supabase.schema("contracts_mcp").from("negotiations").select("*").eq("contract_id", contractId).order("created_at", { ascending: false });

    return { content: [{ type: "text", text: ok({ contract: contractResult.data, orders: ordersResult.data ?? [], negotiations: negotiationsResult.data ?? [] }) }] };
  }

  if (tool === "terminate_contract") {
    const contractId = String(args.contract_id ?? "");
    const reason = String(args.reason ?? "");
    const terminatedBy = String(args._user_id ?? args.terminated_by ?? "");
    if (!contractId || !reason || !terminatedBy) return fail("VALIDATION_ERROR", "contract_id, reason, terminated_by are required.");

    const { data: contract, error: fetchErr } = await supabase.schema("contracts_mcp").from("contracts").select("buyer_id,seller_id").eq("contract_id", contractId).maybeSingle();
    if (fetchErr) return fail("DB_ERROR", fetchErr.message);
    if (!contract) return fail("NOT_FOUND", "Contract not found.");
    if (String(contract.buyer_id) !== terminatedBy && String(contract.seller_id) !== terminatedBy) {
      return fail("FORBIDDEN", "Only the buyer or seller can terminate this contract.");
    }

    const updateResult = await supabase.schema("contracts_mcp").from("contracts")
      .update({ status: "terminated", termination_reason: reason, terminated_by: terminatedBy, terminated_at: now(), updated_at: now() })
      .eq("contract_id", contractId)
      .in("status", ["draft", "active"]);
    if (updateResult.error) return fail("DB_ERROR", updateResult.error.message);

    await emitEvent("contracts.contract.terminated", { contract_id: contractId, reason, terminated_by: terminatedBy });
    return { content: [{ type: "text", text: ok({ contract_id: contractId, status: "terminated", reason }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("contracts", Number(process.env.MCP_HTTP_PORT ?? 4114));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
