import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "analytics-mcp";
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
    { name: "get_dashboard_stats", description: "Platform-wide KPIs: active listings, total escrow, active auctions, total users", inputSchema: { type: "object", properties: {} } },
    { name: "get_conversion_funnel", description: "Listing to search to message to order conversion rates", inputSchema: { type: "object", properties: { period_days: { type: "number", description: "Lookback period in days (default 30)" } } } },
    { name: "get_revenue_report", description: "Commission revenue by period", inputSchema: { type: "object", properties: { start_date: { type: "string" }, end_date: { type: "string" } }, required: ["start_date", "end_date"] } },
    { name: "export_data", description: "Export query results as JSON", inputSchema: { type: "object", properties: { query_type: { type: "string", description: "One of: listings, transactions, users, orders" }, filters: { type: "object" } }, required: ["query_type"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

async function assertPlatformAdmin(args: Record<string, unknown>): Promise<{ isError: true; content: Array<{ type: "text"; text: string }> } | null> {
  const userId = String(args._user_id ?? "");
  if (!userId) return fail("UNAUTHORIZED", "Authentication required.");
  if (!supabase) return null;
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

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }

  if (tool === "export_data" || tool === "get_revenue_report") {
    const adminErr = await assertPlatformAdmin(args);
    if (adminErr) return adminErr;
  }

  if (tool === "get_dashboard_stats") {
    if (supabase) {
      const [listingsRes, usersRes, escrowRes, auctionsRes] = await Promise.all([
        supabase.schema("listing_mcp").from("listings").select("listing_id", { count: "exact", head: true }).eq("status", "active"),
        supabase.schema("auth_mcp").from("users").select("user_id", { count: "exact", head: true }),
        supabase.schema("escrow_mcp").from("escrows").select("amount").in("status", ["created", "funds_held"]),
        supabase.schema("auction_mcp").from("auctions").select("auction_id", { count: "exact", head: true }).eq("status", "active"),
      ]);

      const totalEscrow = (escrowRes.data ?? []).reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.amount ?? 0), 0);

      return {
        content: [{
          type: "text",
          text: ok({
            active_listings: listingsRes.count ?? 0,
            total_users: usersRes.count ?? 0,
            total_escrow_held: totalEscrow,
            active_auctions: auctionsRes.count ?? 0,
            timestamp: now(),
          }),
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: ok({
          active_listings: 0,
          total_users: 0,
          total_escrow_held: 0,
          active_auctions: 0,
          timestamp: now(),
        }),
      }],
    };
  }

  if (tool === "get_conversion_funnel") {
    const periodDays = Number(args.period_days ?? 30);
    const since = new Date(Date.now() - periodDays * 86400000).toISOString();

    if (supabase) {
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

      return {
        content: [{
          type: "text",
          text: ok({
            period_days: periodDays,
            listings_created: listings,
            searches_performed: searches,
            messages_sent: messages,
            orders_placed: orders,
            search_to_message_rate: searches > 0 ? Math.round((messages / searches) * 10000) / 100 : 0,
            message_to_order_rate: messages > 0 ? Math.round((orders / messages) * 10000) / 100 : 0,
          }),
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: ok({
          period_days: periodDays,
          listings_created: 0,
          searches_performed: 0,
          messages_sent: 0,
          orders_placed: 0,
          search_to_message_rate: 0,
          message_to_order_rate: 0,
        }),
      }],
    };
  }

  if (tool === "get_revenue_report") {
    const startDate = String(args.start_date ?? "");
    const endDate = String(args.end_date ?? "");
    if (!startDate || !endDate) return fail("VALIDATION_ERROR", "start_date and end_date are required.");

    if (supabase) {
      const { data, error } = await supabase
        .schema("payments_mcp")
        .from("transactions")
        .select("transaction_id,amount,commission_amount,tax_amount,transaction_type,created_at")
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .in("transaction_type", ["purchase", "commission"]);
      if (error) return fail("DB_ERROR", error.message);

      const rows = data ?? [];
      const totalRevenue = rows.reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.commission_amount ?? 0), 0);
      const totalTax = rows.reduce((sum: number, r: Record<string, unknown>) => sum + Number(r.tax_amount ?? 0), 0);

      return {
        content: [{
          type: "text",
          text: ok({
            start_date: startDate,
            end_date: endDate,
            total_commission_revenue: Math.round(totalRevenue * 100) / 100,
            total_tax_collected: Math.round(totalTax * 100) / 100,
            transaction_count: rows.length,
          }),
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: ok({
          start_date: startDate,
          end_date: endDate,
          total_commission_revenue: 0,
          total_tax_collected: 0,
          transaction_count: 0,
        }),
      }],
    };
  }

  if (tool === "export_data") {
    const queryType = String(args.query_type ?? "");
    if (!["listings", "transactions", "users", "orders"].includes(queryType)) {
      return fail("VALIDATION_ERROR", "query_type must be one of: listings, transactions, users, orders.");
    }

    if (supabase) {
      const schemaMap: Record<string, { schema: string; table: string; select: string }> = {
        listings: { schema: "listing_mcp", table: "listings", select: "listing_id,title,status,material_category,price,created_at" },
        transactions: { schema: "payments_mcp", table: "transactions", select: "transaction_id,payer_id,amount,transaction_type,status,created_at" },
        users: { schema: "auth_mcp", table: "users", select: "user_id,email,role,account_status,created_at" },
        orders: { schema: "orders_mcp", table: "orders", select: "order_id,buyer_id,seller_id,total_amount,status,created_at" },
      };

      const cfg = schemaMap[queryType];
      const { data, error } = await supabase.schema(cfg.schema).from(cfg.table).select(cfg.select).limit(1000);
      if (error) return fail("DB_ERROR", error.message);

      const exportId = generateId();
      await emitEvent("analytics.data.exported", { export_id: exportId, query_type: queryType, row_count: (data ?? []).length });

      return {
        content: [{
          type: "text",
          text: ok({ export_id: exportId, query_type: queryType, row_count: (data ?? []).length, rows: data ?? [] }),
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: ok({ export_id: generateId(), query_type: queryType, row_count: 0, rows: [] }),
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
  startDomainHttpAdapter("analytics", Number(process.env.MCP_HTTP_PORT ?? 4118));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}

if (eventBus) {
  const eventCounts = new Map<string, number>();
  eventBus.startConsumerLoop("analytics-consumer", async (event) => {
    eventCounts.set(event, (eventCounts.get(event) ?? 0) + 1);
  });
  console.error("[analytics-mcp] event bus consumer started");
}
