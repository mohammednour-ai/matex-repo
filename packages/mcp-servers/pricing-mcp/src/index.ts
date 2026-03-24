import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now, roundToTwoDecimals } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "pricing-mcp";
const SERVER_VERSION = "0.1.0";
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const eventBus = EVENT_REDIS_URL ? new MatexEventBus({ redisUrl: EVENT_REDIS_URL }) : null;
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

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
    // Non-blocking event emission for MVP scaffold.
  }
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "capture_market_price", description: "Insert market price from index source", inputSchema: { type: "object", properties: { material: { type: "string" }, source: { type: "string", description: "lme, fastmarkets, or manual" }, price: { type: "number" }, currency: { type: "string" }, unit: { type: "string", description: "per_tonne, per_lb, per_kg" } }, required: ["material", "source", "price"] } },
    { name: "get_market_prices", description: "Get latest prices by material", inputSchema: { type: "object", properties: { material: { type: "string" }, limit: { type: "number" } } } },
    { name: "calculate_mpi", description: "Compute Matex Price Index for category and region", inputSchema: { type: "object", properties: { category: { type: "string" }, region: { type: "string" } }, required: ["category", "region"] } },
    { name: "create_price_alert", description: "Set threshold price alert for a user", inputSchema: { type: "object", properties: { user_id: { type: "string" }, material: { type: "string" }, threshold_price: { type: "number" }, direction: { type: "string", description: "above or below" } }, required: ["user_id", "material", "threshold_price", "direction"] } },
    { name: "get_price_alerts", description: "List user price alerts", inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] } },
    { name: "check_alerts", description: "Evaluate alerts against current prices and trigger notifications", inputSchema: { type: "object", properties: {} } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }

  if (tool === "capture_market_price") {
    const material = String(args.material ?? "");
    const source = String(args.source ?? "manual");
    const price = Number(args.price ?? 0);
    const currency = String(args.currency ?? "USD");
    const unit = String(args.unit ?? "per_tonne");
    if (!material) return fail("VALIDATION_ERROR", "material is required.");
    if (!Number.isFinite(price) || price <= 0) return fail("VALIDATION_ERROR", "price must be greater than 0.");

    const priceId = generateId();
    const createdAt = now();

    if (supabase) {
      const { error } = await supabase.schema("pricing_mcp").from("market_prices").insert({
        price_id: priceId,
        material,
        source,
        price: roundToTwoDecimals(price),
        currency,
        unit,
        captured_at: createdAt,
        created_at: createdAt,
      });
      if (error) return fail("DB_ERROR", error.message);
      await emitEvent("pricing.price.captured", { price_id: priceId, material, source, price });
      return { content: [{ type: "text", text: ok({ price_id: priceId, material, source, price: roundToTwoDecimals(price), currency, unit }) }] };
    }

    await emitEvent("pricing.price.captured", { price_id: priceId, material, source, price });
    return { content: [{ type: "text", text: ok({ price_id: priceId, material, source, price: roundToTwoDecimals(price), currency, unit }) }] };
  }

  if (tool === "get_market_prices") {
    const material = String(args.material ?? "");
    const limit = Number(args.limit ?? 10);

    if (supabase) {
      let query = supabase
        .schema("pricing_mcp")
        .from("market_prices")
        .select("price_id,material,source,price,currency,unit,captured_at")
        .order("captured_at", { ascending: false })
        .limit(limit);
      if (material) query = query.eq("material", material);
      const { data, error } = await query;
      if (error) return fail("DB_ERROR", error.message);
      return { content: [{ type: "text", text: ok({ prices: data ?? [], total: (data ?? []).length }) }] };
    }

    return { content: [{ type: "text", text: ok({ prices: [], total: 0 }) }] };
  }

  if (tool === "calculate_mpi") {
    const category = String(args.category ?? "");
    const region = String(args.region ?? "");
    if (!category || !region) return fail("VALIDATION_ERROR", "category and region are required.");

    if (supabase) {
      const { data: prices } = await supabase
        .schema("pricing_mcp")
        .from("market_prices")
        .select("price")
        .eq("material", category)
        .order("captured_at", { ascending: false })
        .limit(30);

      const priceValues = (prices ?? []).map((p: Record<string, unknown>) => Number(p.price ?? 0)).filter((v: number) => v > 0);
      const avgPrice = priceValues.length > 0 ? roundToTwoDecimals(priceValues.reduce((a: number, b: number) => a + b, 0) / priceValues.length) : 0;

      const mpiId = generateId();
      const calculatedAt = now();
      const { error } = await supabase.schema("pricing_mcp").from("matex_price_index").insert({
        mpi_id: mpiId,
        category,
        region,
        index_value: avgPrice,
        sample_size: priceValues.length,
        calculated_at: calculatedAt,
        created_at: calculatedAt,
      });
      if (error) return fail("DB_ERROR", error.message);

      await emitEvent("pricing.mpi.calculated", { mpi_id: mpiId, category, region, index_value: avgPrice });
      return { content: [{ type: "text", text: ok({ mpi_id: mpiId, category, region, index_value: avgPrice, sample_size: priceValues.length }) }] };
    }

    return { content: [{ type: "text", text: ok({ mpi_id: generateId(), category, region, index_value: 0, sample_size: 0 }) }] };
  }

  if (tool === "create_price_alert") {
    const userId = String(args.user_id ?? "");
    const material = String(args.material ?? "");
    const thresholdPrice = Number(args.threshold_price ?? 0);
    const direction = String(args.direction ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    if (!material) return fail("VALIDATION_ERROR", "material is required.");
    if (!Number.isFinite(thresholdPrice) || thresholdPrice <= 0) return fail("VALIDATION_ERROR", "threshold_price must be greater than 0.");
    if (!["above", "below"].includes(direction)) return fail("VALIDATION_ERROR", "direction must be 'above' or 'below'.");

    const alertId = generateId();
    const createdAt = now();

    if (supabase) {
      const { error } = await supabase.schema("pricing_mcp").from("price_alerts").insert({
        alert_id: alertId,
        user_id: userId,
        material,
        threshold_price: roundToTwoDecimals(thresholdPrice),
        direction,
        is_active: true,
        created_at: createdAt,
      });
      if (error) return fail("DB_ERROR", error.message);
      return { content: [{ type: "text", text: ok({ alert_id: alertId, user_id: userId, material, threshold_price: roundToTwoDecimals(thresholdPrice), direction }) }] };
    }

    return { content: [{ type: "text", text: ok({ alert_id: alertId, user_id: userId, material, threshold_price: roundToTwoDecimals(thresholdPrice), direction }) }] };
  }

  if (tool === "get_price_alerts") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");

    if (supabase) {
      const { data, error } = await supabase
        .schema("pricing_mcp")
        .from("price_alerts")
        .select("alert_id,user_id,material,threshold_price,direction,is_active,last_triggered_at,created_at")
        .eq("user_id", userId)
        .eq("is_active", true);
      if (error) return fail("DB_ERROR", error.message);
      return { content: [{ type: "text", text: ok({ alerts: data ?? [], total: (data ?? []).length }) }] };
    }

    return { content: [{ type: "text", text: ok({ alerts: [], total: 0 }) }] };
  }

  if (tool === "check_alerts") {
    if (supabase) {
      const { data: alerts } = await supabase
        .schema("pricing_mcp")
        .from("price_alerts")
        .select("alert_id,user_id,material,threshold_price,direction")
        .eq("is_active", true);

      const triggered: Array<Record<string, unknown>> = [];
      for (const alert of alerts ?? []) {
        const { data: latestPrice } = await supabase
          .schema("pricing_mcp")
          .from("market_prices")
          .select("price")
          .eq("material", String(alert.material))
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!latestPrice) continue;
        const currentPrice = Number(latestPrice.price);
        const threshold = Number(alert.threshold_price);
        const shouldTrigger =
          (alert.direction === "above" && currentPrice >= threshold) ||
          (alert.direction === "below" && currentPrice <= threshold);

        if (shouldTrigger) {
          await supabase
            .schema("pricing_mcp")
            .from("price_alerts")
            .update({ last_triggered_at: now() })
            .eq("alert_id", alert.alert_id);
          triggered.push({ alert_id: alert.alert_id, user_id: alert.user_id, material: alert.material, current_price: currentPrice, threshold_price: threshold, direction: alert.direction });
          await emitEvent("pricing.alert.triggered", { alert_id: alert.alert_id, user_id: alert.user_id, material: alert.material, current_price: currentPrice });
        }
      }

      return { content: [{ type: "text", text: ok({ triggered_count: triggered.length, triggered }) }] };
    }

    return { content: [{ type: "text", text: ok({ triggered_count: 0, triggered: [] }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("pricing", Number(process.env.MCP_HTTP_PORT ?? 4119));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
