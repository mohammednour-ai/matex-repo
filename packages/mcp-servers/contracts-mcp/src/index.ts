import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { callServer, generateId, MatexEventBus, now, initSentry } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "contracts-mcp";
initSentry(SERVER_NAME);
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
    { name: "create_contract", description: "Create a new draft supply contract (matches contracts_mcp.contracts schema). v1 form ships standing-only; tool accepts the full contract_type enum.", inputSchema: { type: "object", properties: { buyer_id: { type: "string" }, seller_id: { type: "string" }, contract_type: { type: "string", enum: ["standing", "volume", "hybrid", "index_linked", "rfq_framework", "consignment"] }, material_category_id: { type: "string" }, total_volume: { type: "number" }, unit: { type: "string", enum: ["mt", "kg", "g", "troy_oz", "units", "lots", "cubic_yards"] }, base_price: { type: "number", description: "Per-unit price; folded into pricing_model when caller does not supply one" }, currency: { type: "string" }, pricing_model: { type: "object", description: "Override the fixed-price default; carries index_source/premium/floor/ceiling for index_linked contracts" }, quality_specs: { type: "object" }, breach_penalties: { type: "object" }, frequency: { type: "string", enum: ["weekly", "biweekly", "monthly", "quarterly", "on_demand"] }, start_date: { type: "string" }, end_date: { type: "string" }, auto_renew: { type: "boolean" }, renewal_notice_days: { type: "number" } }, required: ["buyer_id", "seller_id", "material_category_id", "total_volume", "unit", "base_price", "start_date", "end_date"] } },
    { name: "activate_contract", description: "Activate a draft contract after eSign completion", inputSchema: { type: "object", properties: { contract_id: { type: "string" }, esign_document_id: { type: "string" } }, required: ["contract_id"] } },
    { name: "generate_order", description: "Schedule a contract order against an active contract. Writes to contracts_mcp.contract_orders with status='scheduled'. Pricing is derived from the contract's pricing_model (v1: fixed only). Accepts quantity (preferred) or legacy quantity_kg; scheduled_date (preferred) or legacy delivery_date.", inputSchema: { type: "object", properties: { contract_id: { type: "string" }, quantity: { type: "number" }, scheduled_date: { type: "string" }, quantity_kg: { type: "number", description: "Deprecated alias for quantity." }, delivery_date: { type: "string", description: "Deprecated alias for scheduled_date." } }, required: ["contract_id"] } },
    { name: "negotiate_terms", description: "Propose changes to contract terms", inputSchema: { type: "object", properties: { contract_id: { type: "string" }, proposed_by: { type: "string" }, proposed_changes: { type: "object" }, message: { type: "string" } }, required: ["contract_id", "proposed_by", "proposed_changes"] } },
    { name: "get_contract", description: "Get contract with orders and negotiations", inputSchema: { type: "object", properties: { contract_id: { type: "string" } }, required: ["contract_id"] } },
    { name: "terminate_contract", description: "Terminate an active contract", inputSchema: { type: "object", properties: { contract_id: { type: "string" }, reason: { type: "string" }, terminated_by: { type: "string" } }, required: ["contract_id", "reason", "terminated_by"] } },
    { name: "evaluate_breach", description: "Evaluate a contract order for breach; computes shortfall and late-delivery penalties using contract.breach_penalties + pricing_model.base_price. Accepts contract_order_id (preferred) or order_id (orders_mcp FK).", inputSchema: { type: "object", properties: { contract_id: { type: "string" }, contract_order_id: { type: "string" }, order_id: { type: "string", description: "Alternative to contract_order_id; orders_mcp.orders FK." } }, required: ["contract_id"] } },
    { name: "collect_penalty", description: "Record and trigger collection of a breach penalty", inputSchema: { type: "object", properties: { contract_id: { type: "string" }, order_id: { type: "string" }, penalty_amount: { type: "number" }, reason: { type: "string" } }, required: ["contract_id", "order_id", "penalty_amount", "reason"] } },
    { name: "list_contracts", description: "List contracts for a user (as buyer or seller). Optional status filter. If no user_id is provided, returns all contracts (admin view).", inputSchema: { type: "object", properties: { user_id: { type: "string" }, status: { type: "string" }, contract_type: { type: "string" }, limit: { type: "number" } } } },
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
    // Schema-aligned input. The previous tool wrote
    // material_category/quantity_kg/price_per_kg/total_value/terms/terms_hash,
    // none of which exist on contracts_mcp.contracts (real columns are
    // material_category_id UUID, total_volume + unit enum, pricing_model
    // JSONB, quality_specs JSONB, breach_penalties JSONB). Every prior
    // create has been silently 422'ing against the real schema.
    //
    // v1 of /contracts/create only exposes contract_type='standing' from
    // the UI; this tool stays permissive and accepts the full enum so
    // chat/API callers can issue index_linked / volume / etc.
    const buyerId = String(args.buyer_id ?? "");
    const sellerId = String(args.seller_id ?? "");
    const contractType = String(args.contract_type ?? "standing");
    const materialCategoryId = String(args.material_category_id ?? "");
    const totalVolume = Number(args.total_volume ?? 0);
    const unit = String(args.unit ?? "");
    const basePrice = Number(args.base_price ?? 0);
    const startDate = String(args.start_date ?? "");
    const endDate = String(args.end_date ?? "");

    if (!buyerId || !sellerId) return fail("VALIDATION_ERROR", "buyer_id and seller_id are required.");
    if (buyerId === sellerId) return fail("VALIDATION_ERROR", "buyer_id and seller_id must differ.");
    if (!materialCategoryId) return fail("VALIDATION_ERROR", "material_category_id is required.");
    if (!(totalVolume > 0)) return fail("VALIDATION_ERROR", "total_volume must be > 0.");
    if (!unit) return fail("VALIDATION_ERROR", "unit is required (e.g. 'mt', 'kg').");
    if (!(basePrice > 0)) return fail("VALIDATION_ERROR", "base_price must be > 0.");
    if (!startDate || !endDate) return fail("VALIDATION_ERROR", "start_date and end_date are required.");
    if (new Date(endDate).getTime() <= new Date(startDate).getTime()) {
      return fail("VALIDATION_ERROR", "end_date must be after start_date.");
    }

    // pricing_model JSONB defaults to a fixed-price model derived from
    // base_price. Callers (chat / API) building an index_linked contract
    // can supply pricing_model directly with type/index_source/premium/
    // floor/ceiling — schema-shaped and additive without a tool change.
    const pricingModel =
      (args.pricing_model as Record<string, unknown> | undefined) ??
      { type: "fixed", base_price: basePrice, currency: String(args.currency ?? "CAD") };

    const qualitySpecs = (args.quality_specs as Record<string, unknown> | undefined) ?? {};
    const breachPenalties = (args.breach_penalties as Record<string, unknown> | undefined) ?? {};

    const frequency = args.frequency ? String(args.frequency) : null;
    const autoRenew = Boolean(args.auto_renew ?? false);
    const renewalNoticeDays = Number(args.renewal_notice_days ?? 30);

    const contractId = generateId();
    const insertResult = await supabase.schema("contracts_mcp").from("contracts").insert({
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
      created_at: now(),
      updated_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("contracts.contract.created", {
      contract_id: contractId,
      buyer_id: buyerId,
      seller_id: sellerId,
      contract_type: contractType,
      total_volume: totalVolume,
      unit,
    });
    return { content: [{ type: "text", text: ok({
      contract_id: contractId,
      status: "draft",
      contract_type: contractType,
      total_volume: totalVolume,
      unit,
      pricing_model: pricingModel,
    }) }] };
  }

  if (tool === "activate_contract") {
    const contractId = String(args.contract_id ?? "");
    if (!contractId) return fail("VALIDATION_ERROR", "contract_id is required.");

    const updateResult = await supabase.schema("contracts_mcp").from("contracts")
      .update({ status: "active", esign_document_id: args.esign_document_id ? String(args.esign_document_id) : null, activated_at: now(), updated_at: now() })
      .eq("contract_id", contractId)
      .eq("status", "draft");
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("contracts.contract.activated", { contract_id: contractId });
    return { content: [{ type: "text", text: ok({ contract_id: contractId, status: "active" }) }] };
  }

  if (tool === "generate_order") {
    // Schema-aligned. The old impl wrote columns that don't exist on
    // contracts_mcp.contract_orders (order_id PK, quantity_kg, price_per_kg,
    // order_amount, delivery_date, status='pending_confirmation') and read
    // contract.quantity_kg / .price_per_kg which also don't exist.
    //
    // Real schema (20260423000000_initial_schema.sql):
    //   contract_orders:
    //     contract_order_id  UUID PK
    //     contract_id        UUID FK
    //     order_id           UUID FK to orders_mcp.orders (nullable —
    //                        populated when the scheduled order is
    //                        materialised as a real order)
    //     scheduled_date     DATE NOT NULL
    //     quantity           DECIMAL(12,2) NOT NULL
    //     calculated_price   DECIMAL(12,2)
    //     status             VARCHAR(20) DEFAULT 'scheduled'
    //                        (scheduled | generated | confirmed | fulfilled | missed)
    //
    // v1 supports pricing_model.type === 'fixed' only. Index-linked
    // (type === 'index' with index_source/premium/floor/ceiling) needs
    // a live price feed + the index-value capture pattern from the
    // schema's index_value/pricing_date columns; out of scope here,
    // returns NOT_IMPLEMENTED so callers don't get a silently-wrong price.
    const contractId = String(args.contract_id ?? "");
    if (!contractId) return fail("VALIDATION_ERROR", "contract_id is required.");

    // Back-compat: accept quantity OR quantity_kg, scheduled_date OR delivery_date.
    const orderQuantity = Number(args.quantity ?? args.quantity_kg ?? 0);
    const scheduledDate = args.scheduled_date
      ? String(args.scheduled_date)
      : args.delivery_date
        ? String(args.delivery_date)
        : "";
    if (!(orderQuantity > 0)) return fail("VALIDATION_ERROR", "quantity must be > 0.");
    if (!scheduledDate) return fail("VALIDATION_ERROR", "scheduled_date is required.");

    const contractResult = await supabase
      .schema("contracts_mcp")
      .from("contracts")
      .select("total_volume,fulfilled_volume,pricing_model,start_date,end_date,unit,status")
      .eq("contract_id", contractId)
      .eq("status", "active")
      .maybeSingle();
    if (contractResult.error) return fail("DB_ERROR", "Database operation failed");
    if (!contractResult.data) return fail("NOT_FOUND", "Active contract not found.");
    const contract = contractResult.data as Record<string, unknown>;

    const totalVolume = Number(contract.total_volume ?? 0);
    const fulfilledVolume = Number(contract.fulfilled_volume ?? 0);
    const remaining = totalVolume - fulfilledVolume;
    if (totalVolume > 0 && orderQuantity > remaining) {
      return fail("VALIDATION_ERROR", `quantity exceeds contract remaining volume (${remaining}).`);
    }
    if (contract.start_date) {
      const sd = new Date(scheduledDate);
      const cs = new Date(String(contract.start_date));
      if (sd < cs) {
        return fail("VALIDATION_ERROR", `scheduled_date (${scheduledDate}) must not be before contract start_date (${contract.start_date}).`);
      }
    }
    if (contract.end_date) {
      const sd = new Date(scheduledDate);
      const ce = new Date(String(contract.end_date));
      if (sd > ce) {
        return fail("VALIDATION_ERROR", `scheduled_date (${scheduledDate}) must not be after contract end_date (${contract.end_date}).`);
      }
    }

    const pricingModel = (contract.pricing_model ?? {}) as Record<string, unknown>;
    const pricingType = String(pricingModel.type ?? "fixed");
    if (pricingType !== "fixed") {
      return fail("NOT_IMPLEMENTED", `pricing_model.type='${pricingType}' is not supported by generate_order yet. v1 ships fixed only.`);
    }
    const basePrice = Number(pricingModel.base_price ?? 0);
    if (!(basePrice > 0)) return fail("VALIDATION_ERROR", "Contract pricing_model.base_price must be > 0.");
    const calculatedPrice = Number((orderQuantity * basePrice).toFixed(2));

    const contractOrderId = generateId();
    const insertResult = await supabase.schema("contracts_mcp").from("contract_orders").insert({
      contract_order_id: contractOrderId,
      contract_id: contractId,
      scheduled_date: scheduledDate,
      quantity: orderQuantity,
      calculated_price: calculatedPrice,
      status: "scheduled",
      created_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("contracts.order.triggered", {
      contract_id: contractId,
      contract_order_id: contractOrderId,
      quantity: orderQuantity,
      calculated_price: calculatedPrice,
      scheduled_date: scheduledDate,
    });
    return { content: [{ type: "text", text: ok({
      contract_order_id: contractOrderId,
      contract_id: contractId,
      quantity: orderQuantity,
      calculated_price: calculatedPrice,
      scheduled_date: scheduledDate,
      status: "scheduled",
    }) }] };
  }

  if (tool === "negotiate_terms") {
    const contractId = String(args.contract_id ?? "");
    const proposedBy = String(args._user_id ?? args.proposed_by ?? "");
    const proposedChanges = args.proposed_changes as Record<string, unknown> | undefined;
    if (!contractId || !proposedBy || !proposedChanges) return fail("VALIDATION_ERROR", "contract_id, proposed_by, proposed_changes are required.");

    const { data: contract, error: fetchErr } = await supabase.schema("contracts_mcp").from("contracts").select("buyer_id,seller_id").eq("contract_id", contractId).maybeSingle();
    if (fetchErr) return fail("DB_ERROR", "Database operation failed");
    if (!contract) return fail("NOT_FOUND", "Contract not found.");
    if (String(contract.buyer_id) !== proposedBy && String(contract.seller_id) !== proposedBy) {
      return fail("FORBIDDEN", "Only the buyer or seller can propose changes to this contract.");
    }

    const negotiationId = generateId();
    const proposalExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    const insertResult = await supabase.schema("contracts_mcp").from("negotiations").insert({
      negotiation_id: negotiationId,
      contract_id: contractId,
      proposed_by: proposedBy,
      proposed_changes: proposedChanges,
      message: args.message ? String(args.message) : null,
      status: "proposed",
      expires_at: proposalExpiresAt,
      created_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("contracts.negotiation.proposed", { contract_id: contractId, negotiation_id: negotiationId, proposed_by: proposedBy });
    return { content: [{ type: "text", text: ok({ negotiation_id: negotiationId, contract_id: contractId, status: "proposed" }) }] };
  }

  if (tool === "get_contract") {
    const contractId = String(args.contract_id ?? "");
    if (!contractId) return fail("VALIDATION_ERROR", "contract_id is required.");

    const contractResult = await supabase.schema("contracts_mcp").from("contracts").select("*").eq("contract_id", contractId).maybeSingle();
    if (contractResult.error) return fail("DB_ERROR", "Database operation failed");
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
    if (fetchErr) return fail("DB_ERROR", "Database operation failed");
    if (!contract) return fail("NOT_FOUND", "Contract not found.");
    if (String(contract.buyer_id) !== terminatedBy && String(contract.seller_id) !== terminatedBy) {
      return fail("FORBIDDEN", "Only the buyer or seller can terminate this contract.");
    }

    const updateResult = await supabase.schema("contracts_mcp").from("contracts")
      .update({ status: "terminated", termination_reason: reason, terminated_by: terminatedBy, terminated_at: now(), updated_at: now() })
      .eq("contract_id", contractId)
      .in("status", ["draft", "active"]);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("contracts.contract.terminated", { contract_id: contractId, reason, terminated_by: terminatedBy });
    return { content: [{ type: "text", text: ok({ contract_id: contractId, status: "terminated", reason }) }] };
  }

  if (tool === "evaluate_breach") {
    // Schema-aligned column reads. The old impl read
    // contracts.quantity_kg / .price_per_kg (don't exist; real columns
    // are total_volume + pricing_model JSONB) and contract_orders.quantity_kg
    // / .delivery_date (real columns: quantity + scheduled_date), so every
    // prior call to this tool either crashed or returned garbage.
    //
    // TODO(p1-1d): The comparison semantics here are conceptually
    // questionable — it compares the WHOLE-contract total_volume to a
    // single contract_order's quantity, which only makes sense when the
    // contract is a one-shot delivery. For multi-delivery contracts the
    // right model is to compare scheduled quantity vs. delivered
    // quantity (from orders_mcp.orders via contract_orders.order_id FK)
    // and to drive penalties off contract_orders.status (missed |
    // fulfilled). Out of scope for the column-rename PR; opening as a
    // separate redesign.
    //
    // We accept both `contract_order_id` (the row PK) and `order_id`
    // (the orders_mcp.orders FK) to identify the contract_order being
    // evaluated. The caller's identifier shape varies by caller.
    const contractId = String(args.contract_id ?? "");
    const contractOrderId = args.contract_order_id ? String(args.contract_order_id) : "";
    const orderId = args.order_id ? String(args.order_id) : "";
    if (!contractId || (!contractOrderId && !orderId)) {
      return fail("VALIDATION_ERROR", "contract_id and either contract_order_id or order_id are required.");
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
    if (contractResult.error) return fail("DB_ERROR", "Database operation failed");
    if (orderResult.error) return fail("DB_ERROR", "Database operation failed");
    if (!contractResult.data) return fail("NOT_FOUND", "Contract not found.");
    if (!orderResult.data) return fail("NOT_FOUND", "Contract order not found.");

    const contract = contractResult.data as Record<string, unknown>;
    const order = orderResult.data as Record<string, unknown>;
    const penaltyConfig = (contract.breach_penalties ?? {}) as Record<string, unknown>;
    const pricingModel = (contract.pricing_model ?? {}) as Record<string, unknown>;

    const orderQty = Number(order.quantity ?? 0);
    const contractQty = Number(contract.total_volume ?? 0);
    // For 'fixed' pricing read base_price from the JSONB; for index_linked
    // a richer derivation belongs here (out of scope, see TODO above).
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
    const isBreach = totalPenalty > 0;

    return {
      content: [{
        type: "text",
        text: ok({
          contract_id: contractId,
          contract_order_id: contractOrderId || null,
          order_id: orderId || null,
          is_breach: isBreach,
          shortfall_quantity: shortfallQty,
          shortfall_unit: String(contract.unit ?? ""),
          shortfall_pct: shortfallPct,
          late_delivery: Boolean(isLateDelivery),
          penalty_amount: penaltyAmount,
          late_penalty: latePenalty,
          total_penalty: totalPenalty,
        }),
      }],
    };
  }

  if (tool === "list_contracts") {
    const userId = args.user_id ? String(args.user_id) : "";
    const statusFilter = args.status ? String(args.status) : "";
    const contractType = args.contract_type ? String(args.contract_type) : "";
    const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);

    let query = supabase
      .schema("contracts_mcp")
      .from("contracts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (userId) query = query.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
    if (statusFilter) query = query.eq("status", statusFilter);
    if (contractType) query = query.eq("contract_type", contractType);

    const { data, error } = await query;
    if (error) return fail("DB_ERROR", "Database operation failed");
    return { content: [{ type: "text", text: ok({ contracts: data ?? [] }) }] };
  }

  if (tool === "collect_penalty") {
    const contractId = String(args.contract_id ?? "");
    const orderId = String(args.order_id ?? "");
    const penaltyAmount = Number(args.penalty_amount ?? 0);
    const reason = String(args.reason ?? "");
    if (!contractId || !orderId) return fail("VALIDATION_ERROR", "contract_id and order_id are required.");
    if (!Number.isFinite(penaltyAmount) || penaltyAmount <= 0) return fail("VALIDATION_ERROR", "penalty_amount must be greater than 0.");
    if (!reason) return fail("VALIDATION_ERROR", "reason is required.");

    const penaltyId = generateId();
    const collectedAt = now();
    const { error } = await supabase.schema("contracts_mcp").from("contract_orders")
      .update({ status: "breach_penalty_levied", updated_at: collectedAt })
      .eq("order_id", orderId)
      .eq("contract_id", contractId);
    if (error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("contracts.penalty.collected", { contract_id: contractId, order_id: orderId, penalty_id: penaltyId, amount: penaltyAmount, reason });
    return {
      content: [{
        type: "text",
        text: ok({ penalty_id: penaltyId, contract_id: contractId, order_id: orderId, amount: penaltyAmount, reason, collected_at: collectedAt }),
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

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("contracts", Number(process.env.MCP_HTTP_PORT ?? 4114));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
