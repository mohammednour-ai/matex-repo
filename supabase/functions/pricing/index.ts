// Pricing domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/pricing-mcp/src/index.ts.

import { failEnvelope, generateId, now, okEnvelope, roundToTwoDecimals } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "pricing-edge";

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function captureMarketPrice({ args }: ToolRequest) {
  const supabase = serviceClient();
  const material = String(args.material ?? "");
  const source = String(args.source ?? "manual");
  const price = Number(args.price ?? 0);
  const currency = String(args.currency ?? "USD");
  const unit = String(args.unit ?? "per_tonne");
  if (!material) return failEnvelope("VALIDATION_ERROR", "material is required.");
  if (!Number.isFinite(price) || price <= 0) return failEnvelope("VALIDATION_ERROR", "price must be greater than 0.");
  const priceId = generateId();
  const ts = now();
  const { error } = await supabase.schema("pricing_mcp").from("market_prices").insert({
    price_id: priceId, material, source, price: roundToTwoDecimals(price),
    currency, unit, captured_at: ts, created_at: ts,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "pricing.price.captured", { price_id: priceId, material, source, price });
  return okEnvelope({ price_id: priceId, material, source, price: roundToTwoDecimals(price), currency, unit });
}

async function getMarketPrices({ args }: ToolRequest) {
  const supabase = serviceClient();
  const material = String(args.material ?? "");
  const limit = Number(args.limit ?? 10);
  let query = supabase.schema("pricing_mcp").from("market_prices")
    .select("price_id,material,source,price,currency,unit,captured_at")
    .order("captured_at", { ascending: false }).limit(limit);
  if (material) query = query.eq("material", material);
  const { data, error } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ prices: data ?? [], total: (data ?? []).length });
}

async function calculateMpi({ args }: ToolRequest) {
  const supabase = serviceClient();
  const category = String(args.category ?? "");
  const region = String(args.region ?? "");
  if (!category || !region) return failEnvelope("VALIDATION_ERROR", "category and region are required.");
  const { data: prices } = await supabase.schema("pricing_mcp").from("market_prices")
    .select("price").eq("material", category).order("captured_at", { ascending: false }).limit(30);
  const priceValues = (prices ?? []).map((p: Record<string, unknown>) => Number(p.price ?? 0))
    .filter((v: number) => v > 0).sort((a: number, b: number) => a - b);
  const p50Price = priceValues.length > 0
    ? roundToTwoDecimals(
        priceValues.length % 2 === 0
          ? (priceValues[priceValues.length / 2 - 1]! + priceValues[priceValues.length / 2]!) / 2
          : priceValues[Math.floor(priceValues.length / 2)]!,
      )
    : 0;
  const mpiId = generateId();
  const ts = now();
  const { error } = await supabase.schema("pricing_mcp").from("matex_price_index").insert({
    mpi_id: mpiId, category, region, index_value: p50Price,
    sample_size: priceValues.length, calculated_at: ts, created_at: ts,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "pricing.mpi.calculated", {
    mpi_id: mpiId, category, region, index_value: p50Price,
  });
  return okEnvelope({ mpi_id: mpiId, category, region, index_value: p50Price, sample_size: priceValues.length });
}

async function createPriceAlert({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  const material = String(args.material ?? "");
  const thresholdPrice = Number(args.threshold_price ?? 0);
  const direction = String(args.direction ?? "");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  if (!material) return failEnvelope("VALIDATION_ERROR", "material is required.");
  if (!Number.isFinite(thresholdPrice) || thresholdPrice <= 0) return failEnvelope("VALIDATION_ERROR", "threshold_price must be greater than 0.");
  if (!["above", "below"].includes(direction)) return failEnvelope("VALIDATION_ERROR", "direction must be 'above' or 'below'.");
  const alertId = generateId();
  const { error } = await supabase.schema("pricing_mcp").from("price_alerts").insert({
    alert_id: alertId, user_id: userId, material,
    threshold_price: roundToTwoDecimals(thresholdPrice),
    direction, is_active: true, created_at: now(),
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ alert_id: alertId, user_id: userId, material, threshold_price: roundToTwoDecimals(thresholdPrice), direction });
}

async function getPriceAlerts({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const { data, error } = await supabase.schema("pricing_mcp").from("price_alerts")
    .select("alert_id,user_id,material,threshold_price,direction,is_active,last_triggered_at,created_at")
    .eq("user_id", userId).eq("is_active", true);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ alerts: data ?? [], total: (data ?? []).length });
}

async function checkAlerts(_req: ToolRequest) {
  const supabase = serviceClient();
  const { data: alerts } = await supabase.schema("pricing_mcp").from("price_alerts")
    .select("alert_id,user_id,material,threshold_price,direction").eq("is_active", true);
  const activeAlerts = alerts ?? [];
  if (activeAlerts.length === 0) return okEnvelope({ triggered_count: 0, triggered: [] });
  const uniqueMaterials = [...new Set(activeAlerts.map((a: Record<string, unknown>) => String(a.material)))];
  const { data: latestPrices } = await supabase.schema("pricing_mcp").from("market_prices")
    .select("material,price,captured_at").in("material", uniqueMaterials)
    .order("captured_at", { ascending: false });
  const priceMap = new Map<string, number>();
  for (const row of latestPrices ?? []) {
    const mat = String((row as Record<string, unknown>).material);
    if (!priceMap.has(mat)) priceMap.set(mat, Number((row as Record<string, unknown>).price));
  }
  const triggered: Array<Record<string, unknown>> = [];
  for (const alert of activeAlerts) {
    const a = alert as Record<string, unknown>;
    const material = String(a.material);
    const currentPrice = priceMap.get(material);
    if (currentPrice === undefined) continue;
    const threshold = Number(a.threshold_price);
    const shouldTrigger = (a.direction === "above" && currentPrice >= threshold) || (a.direction === "below" && currentPrice <= threshold);
    if (shouldTrigger) {
      await supabase.schema("pricing_mcp").from("price_alerts")
        .update({ last_triggered_at: now() }).eq("alert_id", a.alert_id);
      triggered.push({
        alert_id: a.alert_id, user_id: a.user_id, material,
        current_price: currentPrice, threshold_price: threshold, direction: a.direction,
      });
      await emitEvent(supabase, SOURCE, "pricing.alert.triggered", {
        alert_id: a.alert_id, user_id: a.user_id, material, current_price: currentPrice,
      });
    }
  }
  return okEnvelope({ triggered_count: triggered.length, triggered });
}

Deno.serve(serveDomain({
  ping,
  capture_market_price: captureMarketPrice,
  get_market_prices: getMarketPrices,
  calculate_mpi: calculateMpi,
  create_price_alert: createPriceAlert,
  get_price_alerts: getPriceAlerts,
  check_alerts: checkAlerts,
}));
