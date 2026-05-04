import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now , initSentry} from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "admin-mcp";
initSentry(SERVER_NAME);
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
    { name: "get_platform_overview", description: "Aggregated stats across all schemas", inputSchema: { type: "object", properties: {} } },
    { name: "suspend_user", description: "Set user account_status to suspended", inputSchema: { type: "object", properties: { user_id: { type: "string" }, reason: { type: "string" } }, required: ["user_id", "reason"] } },
    { name: "unsuspend_user", description: "Reactivate a suspended user account", inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] } },
    { name: "moderate_listing", description: "Remove or flag a listing", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, action: { type: "string", description: "remove or flag" }, reason: { type: "string" } }, required: ["listing_id", "action", "reason"] } },
    { name: "get_audit_trail", description: "Get recent audit log entries", inputSchema: { type: "object", properties: { limit: { type: "number" }, offset: { type: "number" }, user_id: { type: "string" }, category: { type: "string" } } } },
    { name: "list_listings", description: "List all listings with pagination", inputSchema: { type: "object", properties: { limit: { type: "number" }, offset: { type: "number" }, status: { type: "string" } } } },
    { name: "list_users", description: "List all users with pagination (admin)", inputSchema: { type: "object", properties: { limit: { type: "number" }, offset: { type: "number" }, account_status: { type: "string" } } } },
    { name: "list_orders", description: "List all orders with pagination (admin)", inputSchema: { type: "object", properties: { limit: { type: "number" }, offset: { type: "number" }, status: { type: "string" } } } },
    { name: "list_escrows", description: "List all escrows with pagination (admin)", inputSchema: { type: "object", properties: { limit: { type: "number" }, offset: { type: "number" }, status: { type: "string" } } } },
    { name: "list_auctions", description: "List all auctions with pagination (admin)", inputSchema: { type: "object", properties: { limit: { type: "number" }, offset: { type: "number" }, status: { type: "string" } } } },
    { name: "list_bids", description: "List recent bids with pagination (admin)", inputSchema: { type: "object", properties: { limit: { type: "number" }, offset: { type: "number" }, listing_id: { type: "string" }, bidder_id: { type: "string" } } } },
    { name: "list_transactions", description: "List recent payments transactions (admin)", inputSchema: { type: "object", properties: { limit: { type: "number" }, offset: { type: "number" }, status: { type: "string" }, transaction_type: { type: "string" } } } },
    { name: "list_platform_config", description: "List all platform configuration keys", inputSchema: { type: "object", properties: {} } },
    { name: "grant_platform_admin", description: "Grant platform admin to a user", inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] } },
    { name: "update_order_status", description: "Admin override for order status", inputSchema: { type: "object", properties: { order_id: { type: "string" }, status: { type: "string" } }, required: ["order_id", "status"] } },
    { name: "update_platform_config", description: "Set a platform configuration key-value pair", inputSchema: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["key", "value"] } },
    { name: "get_platform_config", description: "Get a platform configuration value by key", inputSchema: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

async function assertPlatformAdmin(args: Record<string, unknown>): Promise<{ isError: true; content: Array<{ type: "text"; text: string }> } | null> {
  const userId = String(args._user_id ?? "");
  if (!userId) return fail("UNAUTHORIZED", "Authentication required.");
  if (!supabase) return null; // dev mode: skip guard when no DB
  const { data, error } = await supabase
    .schema("auth_mcp")
    .from("users")
    .select("is_platform_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return fail("DB_ERROR", "Database operation failed");
  if (!data?.is_platform_admin) return fail("FORBIDDEN", "Platform admin access required.");
  return null;
}

async function dbGetConfig(key: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.schema("log_mcp").from("platform_config").select("config_value").eq("config_key", key).maybeSingle();
  return data?.config_value ?? null;
}

async function dbSetConfig(key: string, value: string): Promise<void> {
  if (!supabase) return;
  await supabase.schema("log_mcp").from("platform_config").upsert({ config_key: key, config_value: value, updated_at: now() }, { onConflict: "config_key" });
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }

  const adminErr = await assertPlatformAdmin(args);
  if (adminErr) return adminErr;

  if (tool === "get_platform_overview") {
    if (supabase) {
      const [usersRes, listingsRes, ordersRes, escrowRes, disputesRes] = await Promise.all([
        supabase.schema("auth_mcp").from("users").select("user_id", { count: "exact", head: true }),
        supabase.schema("listing_mcp").from("listings").select("listing_id", { count: "exact", head: true }).eq("status", "active"),
        supabase.schema("orders_mcp").from("orders").select("order_id", { count: "exact", head: true }),
        supabase.schema("escrow_mcp").from("escrows").select("held_amount").in("status", ["created", "funds_held"]),
        supabase.schema("dispute_mcp").from("disputes").select("dispute_id", { count: "exact", head: true }).eq("status", "open"),
      ]);

      const totalEscrow = (escrowRes.data ?? []).reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.held_amount ?? 0), 0);

      return {
        content: [{
          type: "text",
          text: ok({
            total_users: usersRes.count ?? 0,
            active_listings: listingsRes.count ?? 0,
            total_orders: ordersRes.count ?? 0,
            total_escrow_held: Math.round(totalEscrow * 100) / 100,
            open_disputes: disputesRes.count ?? 0,
            timestamp: now(),
          }),
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: ok({ total_users: 0, active_listings: 0, total_orders: 0, total_escrow_held: 0, open_disputes: 0, timestamp: now() }),
      }],
    };
  }

  if (tool === "suspend_user") {
    const userId = String(args.user_id ?? "");
    const reason = String(args.reason ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    if (!reason) return fail("VALIDATION_ERROR", "reason is required.");

    if (supabase) {
      const { data: user, error: fetchError } = await supabase
        .schema("auth_mcp")
        .from("users")
        .select("user_id,account_status")
        .eq("user_id", userId)
        .maybeSingle();
      if (fetchError) return fail("DB_ERROR", "Database operation failed");
      if (!user) return fail("NOT_FOUND", "User not found.");
      if (user.account_status === "suspended") return fail("ALREADY_SUSPENDED", "User is already suspended.");

      const { error } = await supabase
        .schema("auth_mcp")
        .from("users")
        .update({ account_status: "suspended", updated_at: now() })
        .eq("user_id", userId);
      if (error) return fail("DB_ERROR", "Database operation failed");

      await emitEvent("admin.user.suspended", { user_id: userId, reason });
      return { content: [{ type: "text", text: ok({ user_id: userId, account_status: "suspended", reason }) }] };
    }

    await emitEvent("admin.user.suspended", { user_id: userId, reason });
    return { content: [{ type: "text", text: ok({ user_id: userId, account_status: "suspended", reason }) }] };
  }

  if (tool === "unsuspend_user") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");

    if (supabase) {
      const { data: user, error: fetchError } = await supabase
        .schema("auth_mcp")
        .from("users")
        .select("user_id,account_status")
        .eq("user_id", userId)
        .maybeSingle();
      if (fetchError) return fail("DB_ERROR", "Database operation failed");
      if (!user) return fail("NOT_FOUND", "User not found.");
      if (user.account_status !== "suspended") return fail("NOT_SUSPENDED", "User is not suspended.");

      const { error } = await supabase
        .schema("auth_mcp")
        .from("users")
        .update({ account_status: "active", updated_at: now() })
        .eq("user_id", userId);
      if (error) return fail("DB_ERROR", "Database operation failed");

      await emitEvent("admin.user.unsuspended", { user_id: userId });
      return { content: [{ type: "text", text: ok({ user_id: userId, account_status: "active" }) }] };
    }

    await emitEvent("admin.user.unsuspended", { user_id: userId });
    return { content: [{ type: "text", text: ok({ user_id: userId, account_status: "active" }) }] };
  }

  if (tool === "moderate_listing") {
    const listingId = String(args.listing_id ?? "");
    const action = String(args.action ?? "");
    const reason = String(args.reason ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    if (!["remove", "flag"].includes(action)) return fail("VALIDATION_ERROR", "action must be 'remove' or 'flag'.");
    if (!reason) return fail("VALIDATION_ERROR", "reason is required.");

    if (supabase) {
      const newStatus = action === "remove" ? "removed" : "flagged";
      const { error } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .update({ status: newStatus, updated_at: now() })
        .eq("listing_id", listingId);
      if (error) return fail("DB_ERROR", "Database operation failed");

      await emitEvent("admin.listing.moderated", { listing_id: listingId, action, reason });
      return { content: [{ type: "text", text: ok({ listing_id: listingId, action, status: newStatus, reason }) }] };
    }

    await emitEvent("admin.listing.moderated", { listing_id: listingId, action, reason });
    return { content: [{ type: "text", text: ok({ listing_id: listingId, action, status: action === "remove" ? "removed" : "flagged", reason }) }] };
  }

  if (tool === "get_audit_trail") {
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const userId = args.user_id ? String(args.user_id) : null;
    const category = args.category ? String(args.category) : null;

    if (supabase) {
      let query = supabase
        .schema("log_mcp")
        .from("audit_log")
        .select("log_id,server,category,action,user_id,created_at,output_summary", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (userId) query = query.eq("user_id", userId);
      if (category) query = query.eq("category", category);
      const { data, error, count } = await query;
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ entries: data ?? [], total: count ?? 0, limit, offset }) }] };
    }

    return { content: [{ type: "text", text: ok({ entries: [], total: 0 }) }] };
  }

  if (tool === "list_listings") {
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const statusFilter = args.status ? String(args.status) : null;

    if (supabase) {
      let query = supabase
        .schema("listing_mcp")
        .from("listings")
        .select("listing_id,seller_id,title,status,asking_price,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (statusFilter) query = query.eq("status", statusFilter);
      const { data, error, count } = await query;
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ listings: data ?? [], total: count ?? 0, limit, offset }) }] };
    }

    return { content: [{ type: "text", text: ok({ listings: [], total: 0 }) }] };
  }

  if (tool === "update_platform_config") {
    const key = String(args.key ?? "");
    const value = String(args.value ?? "");
    if (!key) return fail("VALIDATION_ERROR", "key is required.");

    await dbSetConfig(key, value);
    await emitEvent("admin.config.changed", { key, value });
    return { content: [{ type: "text", text: ok({ key, value, updated_at: now() }) }] };
  }

  if (tool === "get_platform_config") {
    const key = String(args.key ?? "");
    if (!key) return fail("VALIDATION_ERROR", "key is required.");
    const value = await dbGetConfig(key);
    return { content: [{ type: "text", text: ok({ key, value }) }] };
  }

  if (tool === "list_users") {
    const limit = Math.min(Number(args.limit ?? 50), 500);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const statusFilter = args.account_status ? String(args.account_status) : null;

    if (supabase) {
      let query = supabase
        .schema("auth_mcp")
        .from("users")
        .select("user_id,email,phone,account_status,is_platform_admin,created_at,last_login_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (statusFilter) query = query.eq("account_status", statusFilter);
      const { data, error, count } = await query;
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ users: data ?? [], total: count ?? 0, limit, offset }) }] };
    }

    return { content: [{ type: "text", text: ok({ users: [], total: 0 }) }] };
  }

  if (tool === "list_orders") {
    const limit = Math.min(Number(args.limit ?? 50), 500);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const statusFilter = args.status ? String(args.status) : null;

    if (supabase) {
      let query = supabase
        .schema("orders_mcp")
        .from("orders")
        .select("order_id,buyer_id,seller_id,listing_id,status,original_amount,adjusted_amount,final_amount,quantity,unit,currency,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (statusFilter) query = query.eq("status", statusFilter);
      const { data, error, count } = await query;
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ orders: data ?? [], total: count ?? 0, limit, offset }) }] };
    }

    return { content: [{ type: "text", text: ok({ orders: [], total: 0 }) }] };
  }

  if (tool === "list_escrows") {
    const limit = Math.min(Number(args.limit ?? 50), 500);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const statusFilter = args.status ? String(args.status) : null;

    if (supabase) {
      let query = supabase
        .schema("escrow_mcp")
        .from("escrows")
        .select("escrow_id,order_id,buyer_id,seller_id,original_amount,held_amount,released_amount,refunded_amount,currency,status,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (statusFilter) query = query.eq("status", statusFilter);
      const { data, error, count } = await query;
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ escrows: data ?? [], total: count ?? 0, limit, offset }) }] };
    }

    return { content: [{ type: "text", text: ok({ escrows: [], total: 0 }) }] };
  }

  if (tool === "list_auctions") {
    const limit = Math.min(Number(args.limit ?? 50), 500);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const statusFilter = args.status ? String(args.status) : null;

    if (supabase) {
      let query = supabase
        .schema("auction_mcp")
        .from("auctions")
        .select("auction_id,organizer_id,title,status,scheduled_start,actual_start,actual_end,total_lots,lots_sold,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (statusFilter) query = query.eq("status", statusFilter);
      const { data, error, count } = await query;
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ auctions: data ?? [], total: count ?? 0, limit, offset }) }] };
    }

    return { content: [{ type: "text", text: ok({ auctions: [], total: 0 }) }] };
  }

  if (tool === "list_bids") {
    const limit = Math.min(Number(args.limit ?? 50), 500);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const listingId = args.listing_id ? String(args.listing_id) : null;
    const bidderId = args.bidder_id ? String(args.bidder_id) : null;

    if (supabase) {
      let query = supabase
        .schema("bidding_mcp")
        .from("bids")
        .select("bid_id,listing_id,bidder_id,amount,bid_type,status,server_timestamp,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (listingId) query = query.eq("listing_id", listingId);
      if (bidderId) query = query.eq("bidder_id", bidderId);
      const { data, error, count } = await query;
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ bids: data ?? [], total: count ?? 0, limit, offset }) }] };
    }

    return { content: [{ type: "text", text: ok({ bids: [], total: 0 }) }] };
  }

  if (tool === "list_transactions") {
    const limit = Math.min(Number(args.limit ?? 50), 500);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const statusFilter = args.status ? String(args.status) : null;
    const typeFilter = args.transaction_type ? String(args.transaction_type) : null;

    if (supabase) {
      let query = supabase
        .schema("payments_mcp")
        .from("transactions")
        .select("transaction_id,order_id,escrow_id,payer_id,payee_id,amount,currency,payment_method,transaction_type,status,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (statusFilter) query = query.eq("status", statusFilter);
      if (typeFilter) query = query.eq("transaction_type", typeFilter);
      const { data, error, count } = await query;
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ transactions: data ?? [], total: count ?? 0, limit, offset }) }] };
    }

    return { content: [{ type: "text", text: ok({ transactions: [], total: 0 }) }] };
  }

  if (tool === "list_platform_config") {
    if (supabase) {
      const { data, error } = await supabase
        .schema("log_mcp")
        .from("platform_config")
        .select("config_key,config_value,updated_at")
        .order("config_key", { ascending: true });
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ config: data ?? [] }) }] };
    }
    return { content: [{ type: "text", text: ok({ config: [] }) }] };
  }

  if (tool === "grant_platform_admin") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");

    if (supabase) {
      const { data: user, error: fetchError } = await supabase
        .schema("auth_mcp")
        .from("users")
        .select("user_id,is_platform_admin")
        .eq("user_id", userId)
        .maybeSingle();
      if (fetchError) return fail("DB_ERROR", "Database operation failed");
      if (!user) return fail("NOT_FOUND", "User not found.");

      const { error } = await supabase
        .schema("auth_mcp")
        .from("users")
        .update({ is_platform_admin: true, updated_at: now() })
        .eq("user_id", userId);
      if (error) return fail("DB_ERROR", "Database operation failed");

      await emitEvent("admin.user.platform_admin_granted", { user_id: userId, granted_by: String(args._user_id ?? "") });
      return { content: [{ type: "text", text: ok({ user_id: userId, is_platform_admin: true }) }] };
    }

    return { content: [{ type: "text", text: ok({ user_id: userId, is_platform_admin: true }) }] };
  }

  if (tool === "update_order_status") {
    const orderId = String(args.order_id ?? "");
    const newStatus = String(args.status ?? "");
    if (!orderId) return fail("VALIDATION_ERROR", "order_id is required.");
    if (!newStatus) return fail("VALIDATION_ERROR", "status is required.");

    if (supabase) {
      const { data: order, error: fetchError } = await supabase
        .schema("orders_mcp")
        .from("orders")
        .select("order_id,status")
        .eq("order_id", orderId)
        .maybeSingle();
      if (fetchError) return fail("DB_ERROR", "Database operation failed");
      if (!order) return fail("NOT_FOUND", "Order not found.");

      const { error } = await supabase
        .schema("orders_mcp")
        .from("orders")
        .update({ status: newStatus, updated_at: now() })
        .eq("order_id", orderId);
      if (error) return fail("DB_ERROR", "Database operation failed");

      await emitEvent("admin.order.status_updated", { order_id: orderId, previous_status: order.status, new_status: newStatus, updated_by: String(args._user_id ?? "") });
      return { content: [{ type: "text", text: ok({ order_id: orderId, status: newStatus }) }] };
    }

    return { content: [{ type: "text", text: ok({ order_id: orderId, status: newStatus }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("admin", Number(process.env.MCP_HTTP_PORT ?? 4121));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
