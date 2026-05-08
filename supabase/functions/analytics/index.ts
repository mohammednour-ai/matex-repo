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

async function getRevenueReport({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  if (!(await isPlatformAdmin(supabase, caller.userId))) {
    return failEnvelope("FORBIDDEN", "Platform admin access required.");
  }
  const startDate = String(args.start_date ?? "");
  const endDate = String(args.end_date ?? "");
  if (!startDate || !endDate) return failEnvelope("VALIDATION_ERROR", "start_date and end_date are required.");

  const { data, error } = await supabase
    .schema("payments_mcp").from("transactions")
    .select("transaction_id,amount,commission_amount,tax_amount,transaction_type,created_at")
    .gte("created_at", startDate).lte("created_at", endDate)
    .in("transaction_type", ["purchase", "commission"]);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  const rows = data ?? [];
  const totalRevenue = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.commission_amount ?? 0), 0);
  const totalTax = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.tax_amount ?? 0), 0);
  return okEnvelope({
    start_date: startDate,
    end_date: endDate,
    total_commission_revenue: Math.round(totalRevenue * 100) / 100,
    total_tax_collected: Math.round(totalTax * 100) / 100,
    transaction_count: rows.length,
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
