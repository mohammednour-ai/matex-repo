import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "admin-mcp";
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
  if (error) return fail("DB_ERROR", error.message);
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
        supabase.schema("escrow_mcp").from("escrows").select("amount").in("status", ["created", "funds_held"]),
        supabase.schema("dispute_mcp").from("disputes").select("dispute_id", { count: "exact", head: true }).eq("status", "open"),
      ]);

      const totalEscrow = (escrowRes.data ?? []).reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.amount ?? 0), 0);

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
      if (fetchError) return fail("DB_ERROR", fetchError.message);
      if (!user) return fail("NOT_FOUND", "User not found.");
      if (user.account_status === "suspended") return fail("ALREADY_SUSPENDED", "User is already suspended.");

      const { error } = await supabase
        .schema("auth_mcp")
        .from("users")
        .update({ account_status: "suspended", updated_at: now() })
        .eq("user_id", userId);
      if (error) return fail("DB_ERROR", error.message);

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
      if (fetchError) return fail("DB_ERROR", fetchError.message);
      if (!user) return fail("NOT_FOUND", "User not found.");
      if (user.account_status !== "suspended") return fail("NOT_SUSPENDED", "User is not suspended.");

      const { error } = await supabase
        .schema("auth_mcp")
        .from("users")
        .update({ account_status: "active", updated_at: now() })
        .eq("user_id", userId);
      if (error) return fail("DB_ERROR", error.message);

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
      if (error) return fail("DB_ERROR", error.message);

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
      if (error) return fail("DB_ERROR", error.message);
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
      if (error) return fail("DB_ERROR", error.message);
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
