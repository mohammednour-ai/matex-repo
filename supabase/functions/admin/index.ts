// Admin domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/admin-mcp/src/index.ts.
//
// Every tool except `ping` requires platform admin. We check caller.userId
// (from the verified JWT) against auth_mcp.users.is_platform_admin rather
// than trusting an args._user_id field, since this is the privileged
// surface and a forged arg should not bypass the gate.

import { failEnvelope, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { isPlatformAdmin } from "../_shared/auth.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolHandler, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "admin-edge";

function adminOnly(handler: ToolHandler): ToolHandler {
  return async (req: ToolRequest) => {
    const supabase = serviceClient();
    if (!(await isPlatformAdmin(supabase, req.caller.userId))) {
      return failEnvelope("FORBIDDEN", "Platform admin access required.");
    }
    return handler(req);
  };
}

function pageBounds(args: Record<string, unknown>): { limit: number; offset: number } {
  return {
    limit: Math.min(Number(args.limit ?? 50), 500),
    offset: Math.max(Number(args.offset ?? 0), 0),
  };
}

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function getPlatformOverview() {
  const supabase = serviceClient();
  const [usersRes, listingsRes, ordersRes, escrowRes, disputesRes] = await Promise.all([
    supabase.schema("auth_mcp").from("users").select("user_id", { count: "exact", head: true }),
    supabase.schema("listing_mcp").from("listings").select("listing_id", { count: "exact", head: true }).eq("status", "active"),
    supabase.schema("orders_mcp").from("orders").select("order_id", { count: "exact", head: true }),
    supabase.schema("escrow_mcp").from("escrows").select("held_amount").in("status", ["created", "funds_held"]),
    supabase.schema("dispute_mcp").from("disputes").select("dispute_id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  const totalEscrow = (escrowRes.data ?? []).reduce(
    (sum: number, row: Record<string, unknown>) => sum + Number(row.held_amount ?? 0), 0,
  );
  return okEnvelope({
    total_users: usersRes.count ?? 0,
    active_listings: listingsRes.count ?? 0,
    total_orders: ordersRes.count ?? 0,
    total_escrow_held: Math.round(totalEscrow * 100) / 100,
    open_disputes: disputesRes.count ?? 0,
    timestamp: now(),
  });
}

async function suspendUser({ args }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? "");
  const reason = String(args.reason ?? "");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  if (!reason) return failEnvelope("VALIDATION_ERROR", "reason is required.");
  const user = await supabase.schema("auth_mcp").from("users")
    .select("user_id,account_status").eq("user_id", userId).maybeSingle();
  if (user.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!user.data) return failEnvelope("NOT_FOUND", "User not found.");
  if (user.data.account_status === "suspended") return failEnvelope("ALREADY_SUSPENDED", "User is already suspended.");
  const { error } = await supabase.schema("auth_mcp").from("users")
    .update({ account_status: "suspended", updated_at: now() }).eq("user_id", userId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "admin.user.suspended", { user_id: userId, reason });
  return okEnvelope({ user_id: userId, account_status: "suspended", reason });
}

async function unsuspendUser({ args }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? "");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const user = await supabase.schema("auth_mcp").from("users")
    .select("user_id,account_status").eq("user_id", userId).maybeSingle();
  if (user.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!user.data) return failEnvelope("NOT_FOUND", "User not found.");
  if (user.data.account_status !== "suspended") return failEnvelope("NOT_SUSPENDED", "User is not suspended.");
  const { error } = await supabase.schema("auth_mcp").from("users")
    .update({ account_status: "active", updated_at: now() }).eq("user_id", userId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "admin.user.unsuspended", { user_id: userId });
  return okEnvelope({ user_id: userId, account_status: "active" });
}

async function moderateListing({ args }: ToolRequest) {
  const supabase = serviceClient();
  const listingId = String(args.listing_id ?? "");
  const action = String(args.action ?? "");
  const reason = String(args.reason ?? "");
  if (!listingId) return failEnvelope("VALIDATION_ERROR", "listing_id is required.");
  if (!["remove", "flag"].includes(action)) return failEnvelope("VALIDATION_ERROR", "action must be 'remove' or 'flag'.");
  if (!reason) return failEnvelope("VALIDATION_ERROR", "reason is required.");
  const newStatus = action === "remove" ? "removed" : "flagged";
  const { error } = await supabase.schema("listing_mcp").from("listings")
    .update({ status: newStatus, updated_at: now() }).eq("listing_id", listingId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "admin.listing.moderated", { listing_id: listingId, action, reason });
  return okEnvelope({ listing_id: listingId, action, status: newStatus, reason });
}

async function getAuditTrail({ args }: ToolRequest) {
  const supabase = serviceClient();
  const { limit, offset } = pageBounds(args);
  let query = supabase.schema("log_mcp").from("audit_log")
    .select("log_id,server,category,action,user_id,created_at,output_summary", { count: "exact" })
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (args.user_id) query = query.eq("user_id", String(args.user_id));
  if (args.category) query = query.eq("category", String(args.category));
  const { data, error, count } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ entries: data ?? [], total: count ?? 0, limit, offset });
}

async function listListings({ args }: ToolRequest) {
  const supabase = serviceClient();
  const { limit, offset } = pageBounds(args);
  let query = supabase.schema("listing_mcp").from("listings")
    .select("listing_id,seller_id,title,status,asking_price,created_at", { count: "exact" })
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (args.status) query = query.eq("status", String(args.status));
  const { data, error, count } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ listings: data ?? [], total: count ?? 0, limit, offset });
}

async function listUsers({ args }: ToolRequest) {
  const supabase = serviceClient();
  const { limit, offset } = pageBounds(args);
  let query = supabase.schema("auth_mcp").from("users")
    .select("user_id,email,phone,account_status,is_platform_admin,created_at,last_login_at", { count: "exact" })
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (args.account_status) query = query.eq("account_status", String(args.account_status));
  const { data, error, count } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ users: data ?? [], total: count ?? 0, limit, offset });
}

async function listOrdersAdmin({ args }: ToolRequest) {
  const supabase = serviceClient();
  const { limit, offset } = pageBounds(args);
  let query = supabase.schema("orders_mcp").from("orders")
    .select("order_id,buyer_id,seller_id,listing_id,status,original_amount,adjusted_amount,final_amount,quantity,unit,currency,created_at", { count: "exact" })
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (args.status) query = query.eq("status", String(args.status));
  const { data, error, count } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ orders: data ?? [], total: count ?? 0, limit, offset });
}

async function listEscrowsAdmin({ args }: ToolRequest) {
  const supabase = serviceClient();
  const { limit, offset } = pageBounds(args);
  let query = supabase.schema("escrow_mcp").from("escrows")
    .select("escrow_id,order_id,buyer_id,seller_id,original_amount,held_amount,released_amount,refunded_amount,currency,status,created_at", { count: "exact" })
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (args.status) query = query.eq("status", String(args.status));
  const { data, error, count } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ escrows: data ?? [], total: count ?? 0, limit, offset });
}

async function listAuctionsAdmin({ args }: ToolRequest) {
  const supabase = serviceClient();
  const { limit, offset } = pageBounds(args);
  let query = supabase.schema("auction_mcp").from("auctions")
    .select("auction_id,organizer_id,title,status,scheduled_start,actual_start,actual_end,total_lots,lots_sold,created_at", { count: "exact" })
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (args.status) query = query.eq("status", String(args.status));
  const { data, error, count } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ auctions: data ?? [], total: count ?? 0, limit, offset });
}

async function listBidsAdmin({ args }: ToolRequest) {
  const supabase = serviceClient();
  const { limit, offset } = pageBounds(args);
  let query = supabase.schema("bidding_mcp").from("bids")
    .select("bid_id,listing_id,bidder_id,amount,bid_type,status,server_timestamp,created_at", { count: "exact" })
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (args.listing_id) query = query.eq("listing_id", String(args.listing_id));
  if (args.bidder_id) query = query.eq("bidder_id", String(args.bidder_id));
  const { data, error, count } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ bids: data ?? [], total: count ?? 0, limit, offset });
}

async function listTransactions({ args }: ToolRequest) {
  const supabase = serviceClient();
  const { limit, offset } = pageBounds(args);
  let query = supabase.schema("payments_mcp").from("transactions")
    .select("transaction_id,order_id,escrow_id,payer_id,payee_id,amount,currency,payment_method,transaction_type,status,created_at", { count: "exact" })
    .order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  if (args.status) query = query.eq("status", String(args.status));
  if (args.transaction_type) query = query.eq("transaction_type", String(args.transaction_type));
  const { data, error, count } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ transactions: data ?? [], total: count ?? 0, limit, offset });
}

async function listPlatformConfig() {
  const supabase = serviceClient();
  const { data, error } = await supabase.schema("log_mcp").from("platform_config")
    .select("config_key,config_value,updated_at").order("config_key", { ascending: true });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ config: data ?? [] });
}

async function grantPlatformAdmin({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? "");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const user = await supabase.schema("auth_mcp").from("users")
    .select("user_id,is_platform_admin").eq("user_id", userId).maybeSingle();
  if (user.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!user.data) return failEnvelope("NOT_FOUND", "User not found.");
  const { error } = await supabase.schema("auth_mcp").from("users")
    .update({ is_platform_admin: true, updated_at: now() }).eq("user_id", userId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "admin.user.platform_admin_granted", {
    user_id: userId, granted_by: caller.userId,
  });
  return okEnvelope({ user_id: userId, is_platform_admin: true });
}

async function updateOrderStatus({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const orderId = String(args.order_id ?? "");
  const newStatus = String(args.status ?? "");
  if (!orderId) return failEnvelope("VALIDATION_ERROR", "order_id is required.");
  if (!newStatus) return failEnvelope("VALIDATION_ERROR", "status is required.");
  const order = await supabase.schema("orders_mcp").from("orders")
    .select("order_id,status").eq("order_id", orderId).maybeSingle();
  if (order.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!order.data) return failEnvelope("NOT_FOUND", "Order not found.");
  const { error } = await supabase.schema("orders_mcp").from("orders")
    .update({ status: newStatus, updated_at: now() }).eq("order_id", orderId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "admin.order.status_updated", {
    order_id: orderId, previous_status: order.data.status, new_status: newStatus, updated_by: caller.userId,
  });
  return okEnvelope({ order_id: orderId, status: newStatus });
}

async function updatePlatformConfig({ args }: ToolRequest) {
  const supabase = serviceClient();
  const key = String(args.key ?? "");
  const value = String(args.value ?? "");
  if (!key) return failEnvelope("VALIDATION_ERROR", "key is required.");
  await supabase.schema("log_mcp").from("platform_config").upsert(
    { config_key: key, config_value: value, updated_at: now() },
    { onConflict: "config_key" },
  );
  await emitEvent(supabase, SOURCE, "admin.config.changed", { key, value });
  return okEnvelope({ key, value, updated_at: now() });
}

async function getPlatformConfig({ args }: ToolRequest) {
  const supabase = serviceClient();
  const key = String(args.key ?? "");
  if (!key) return failEnvelope("VALIDATION_ERROR", "key is required.");
  const { data } = await supabase.schema("log_mcp").from("platform_config")
    .select("config_value").eq("config_key", key).maybeSingle();
  return okEnvelope({ key, value: data?.config_value ?? null });
}

Deno.serve(serveDomain({
  ping,
  get_platform_overview: adminOnly(getPlatformOverview),
  suspend_user: adminOnly(suspendUser),
  unsuspend_user: adminOnly(unsuspendUser),
  moderate_listing: adminOnly(moderateListing),
  get_audit_trail: adminOnly(getAuditTrail),
  list_listings: adminOnly(listListings),
  list_users: adminOnly(listUsers),
  list_orders: adminOnly(listOrdersAdmin),
  list_escrows: adminOnly(listEscrowsAdmin),
  list_auctions: adminOnly(listAuctionsAdmin),
  list_bids: adminOnly(listBidsAdmin),
  list_transactions: adminOnly(listTransactions),
  list_platform_config: adminOnly(listPlatformConfig),
  grant_platform_admin: adminOnly(grantPlatformAdmin),
  update_order_status: adminOnly(updateOrderStatus),
  update_platform_config: adminOnly(updatePlatformConfig),
  get_platform_config: adminOnly(getPlatformConfig),
}));
