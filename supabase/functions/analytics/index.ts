// Analytics domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/analytics-mcp/src/index.ts.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { isPlatformAdmin } from "../_shared/auth.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "analytics-edge";

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function getDashboardStats(_req: ToolRequest) {
  const supabase = serviceClient();
  const [listingsRes, usersRes, escrowRes, auctionsRes] = await Promise.all([
    supabase.schema("listing_mcp").from("listings").select("listing_id", { count: "exact", head: true }).eq("status", "active"),
    supabase.schema("auth_mcp").from("users").select("user_id", { count: "exact", head: true }),
    supabase.schema("escrow_mcp").from("escrows").select("amount").in("status", ["created", "funds_held"]),
    supabase.schema("auction_mcp").from("auctions").select("auction_id", { count: "exact", head: true }).eq("status", "active"),
  ]);
  const totalEscrow = (escrowRes.data ?? []).reduce(
    (sum: number, row: Record<string, unknown>) => sum + Number(row.amount ?? 0), 0,
  );
  return okEnvelope({
    active_listings: listingsRes.count ?? 0,
    total_users: usersRes.count ?? 0,
    total_escrow_held: totalEscrow,
    active_auctions: auctionsRes.count ?? 0,
    timestamp: now(),
  });
}

async function getConversionFunnel({ args }: ToolRequest) {
  const supabase = serviceClient();
  const periodDays = Number(args.period_days ?? 30);
  const since = new Date(Date.now() - periodDays * 86400000).toISOString();
  const [listingsRes, searchesRes, threadsRes, ordersRes] = await Promise.all([
    supabase.schema("listing_mcp").from("listings").select("listing_id", { count: "exact", head: true }).gte("created_at", since),
    supabase.schema("search_mcp").from("saved_searches").select("search_id", { count: "exact", head: true }).gte("created_at", since),
    supabase.schema("messaging_mcp").from("threads").select("thread_id", { count: "exact", head: true }).gte("created_at", since),
    supabase.schema("orders_mcp").from("orders").select("order_id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  const listings = listingsRes.count ?? 0;
  const searches = searchesRes.count ?? 0;
  const messages = threadsRes.count ?? 0;
  const orders = ordersRes.count ?? 0;
  return okEnvelope({
    period_days: periodDays,
    listings_created: listings,
    searches_performed: searches,
    messages_sent: messages,
    orders_placed: orders,
    search_to_message_rate: searches > 0 ? Math.round((messages / searches) * 10000) / 100 : 0,
    message_to_order_rate: messages > 0 ? Math.round((orders / messages) * 10000) / 100 : 0,
  });
}

// "7d" / "30d" / "90d" → {startIso, endIso, days}. Falls back to an explicit
// start_date/end_date pair when no period is supplied, so old callers keep
// working unchanged.
function resolvePeriod(args: Record<string, unknown>): { startIso: string; endIso: string; days: number } | null {
  const period = String(args.period ?? "");
  if (period) {
    const m = /^(\d+)d$/.exec(period);
    if (!m) return null;
    const days = Math.max(1, Math.min(parseInt(m[1], 10), 365));
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    start.setUTCHours(0, 0, 0, 0);
    return { startIso: start.toISOString(), endIso: end.toISOString(), days };
  }
  const startDate = String(args.start_date ?? "");
  const endDate = String(args.end_date ?? "");
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  start.setUTCHours(0, 0, 0, 0);
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
  return { startIso: start.toISOString(), endIso: end.toISOString(), days };
}

async function getRevenueReport({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  if (!(await isPlatformAdmin(supabase, caller.userId))) {
    return failEnvelope("FORBIDDEN", "Platform admin access required.");
  }
  const range = resolvePeriod(args);
  if (!range) return failEnvelope("VALIDATION_ERROR", "Provide either {period: \"7d|30d|90d\"} or {start_date, end_date}.");
  const { startIso, endIso, days } = range;

  const { data, error } = await supabase
    .schema("payments_mcp").from("transactions")
    .select("transaction_id,amount,commission_amount,tax_amount,transaction_type,created_at")
    .gte("created_at", startIso).lte("created_at", endIso)
    .in("transaction_type", ["purchase", "commission"]);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const totalRevenue = rows.reduce((s, r) => s + Number(r.commission_amount ?? 0), 0);
  const totalTax = rows.reduce((s, r) => s + Number(r.tax_amount ?? 0), 0);
  const totalVolume = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  // Bucket per UTC day so the chart aligns regardless of timezone.
  const bucketStart = new Date(startIso).getTime();
  const series = Array.from({ length: days }, (_, i) => ({
    day: new Date(bucketStart + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    transactions: 0,
    volume: 0,
    commission: 0,
  }));
  for (const r of rows) {
    const t = new Date(String(r.created_at ?? "")).getTime();
    if (!Number.isFinite(t)) continue;
    const idx = Math.floor((t - bucketStart) / (24 * 60 * 60 * 1000));
    if (idx < 0 || idx >= days) continue;
    series[idx].transactions += 1;
    series[idx].volume += Number(r.amount ?? 0);
    series[idx].commission += Number(r.commission_amount ?? 0);
  }
  for (const b of series) {
    b.volume = Math.round(b.volume * 100) / 100;
    b.commission = Math.round(b.commission * 100) / 100;
  }

  return okEnvelope({
    start_date: startIso,
    end_date: endIso,
    days,
    transactions: rows.length,
    volume: Math.round(totalVolume * 100) / 100,
    commission_estimate: Math.round(totalRevenue * 100) / 100,
    total_commission_revenue: Math.round(totalRevenue * 100) / 100,
    total_tax_collected: Math.round(totalTax * 100) / 100,
    transaction_count: rows.length,
    series,
  });
}

async function exportData({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  if (!(await isPlatformAdmin(supabase, caller.userId))) {
    return failEnvelope("FORBIDDEN", "Platform admin access required.");
  }
  const queryType = String(args.query_type ?? "");
  if (!["listings", "transactions", "users", "orders"].includes(queryType)) {
    return failEnvelope("VALIDATION_ERROR", "query_type must be one of: listings, transactions, users, orders.");
  }
  const schemaMap: Record<string, { schema: string; table: string; select: string }> = {
    listings: { schema: "listing_mcp", table: "listings", select: "listing_id,title,status,material_category,price,created_at" },
    transactions: { schema: "payments_mcp", table: "transactions", select: "transaction_id,payer_id,amount,transaction_type,status,created_at" },
    users: { schema: "auth_mcp", table: "users", select: "user_id,email,role,account_status,created_at" },
    orders: { schema: "orders_mcp", table: "orders", select: "order_id,buyer_id,seller_id,total_amount,status,created_at" },
  };
  const cfg = schemaMap[queryType];
  const { data, error } = await supabase.schema(cfg.schema).from(cfg.table).select(cfg.select).limit(1000);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  const exportId = generateId();
  await emitEvent(supabase, SOURCE, "analytics.data.exported", {
    export_id: exportId, query_type: queryType, row_count: (data ?? []).length,
  });
  return okEnvelope({ export_id: exportId, query_type: queryType, row_count: (data ?? []).length, rows: data ?? [] });
}

Deno.serve(serveDomain({
  ping,
  get_dashboard_stats: getDashboardStats,
  get_conversion_funnel: getConversionFunnel,
  get_revenue_report: getRevenueReport,
  export_data: exportData,
}));
