import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now , initSentry} from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "notifications-mcp";
initSentry(SERVER_NAME);
const SERVER_VERSION = "0.1.0";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY?.trim();
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? "noreply@matex.ca";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID?.trim();
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim();
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER?.trim();

async function deliverEmail(to: string, subject: string, text: string): Promise<void> {
  if (!SENDGRID_API_KEY || !to) return;
  try {
    await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { authorization: `Bearer ${SENDGRID_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: SENDGRID_FROM_EMAIL, name: "Matex" },
        subject,
        content: [{ type: "text/plain", value: text }],
      }),
    });
  } catch {
    // Non-blocking delivery — DB record already committed.
  }
}

async function deliverSms(to: string, body: string): Promise<void> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER || !to) return;
  try {
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: TWILIO_PHONE_NUMBER, Body: body }).toString(),
    });
  } catch {
    // Non-blocking delivery — DB record already committed.
  }
}

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

const VALID_CHANNELS = ["email", "sms", "push", "in_app"] as const;
const VALID_PRIORITIES = ["low", "normal", "high", "critical"] as const;

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "send_notification", description: "Create and route a notification to specified channels", inputSchema: { type: "object", properties: { user_id: { type: "string" }, type: { type: "string" }, title: { type: "string" }, body: { type: "string" }, channels: { type: "array", items: { type: "string" } }, priority: { type: "string" }, data: { type: "object" } }, required: ["user_id", "type", "title", "body", "channels"] } },
    { name: "get_notifications", description: "List notifications for a user", inputSchema: { type: "object", properties: { user_id: { type: "string" }, status: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["user_id"] } },
    { name: "mark_read", description: "Mark one or more notifications as read", inputSchema: { type: "object", properties: { notification_ids: { type: "array", items: { type: "string" } }, user_id: { type: "string" } }, required: ["notification_ids", "user_id"] } },
    { name: "get_preferences", description: "Get notification preferences for a user", inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] } },
    { name: "update_preferences", description: "Update notification preferences for a user", inputSchema: { type: "object", properties: { user_id: { type: "string" }, preferences: { type: "object" } }, required: ["user_id", "preferences"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }
  if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for notifications-mcp.");

  if (tool === "send_notification") {
    const userId = String(args.user_id ?? "");
    const type = String(args.type ?? "");
    const title = String(args.title ?? "");
    const body = String(args.body ?? "");
    const channels = args.channels as string[] | undefined;
    if (!userId || !type || !title || !body || !channels || channels.length === 0) {
      return fail("VALIDATION_ERROR", "user_id, type, title, body, channels (non-empty) are required.");
    }

    for (const ch of channels) {
      if (!VALID_CHANNELS.includes(ch as typeof VALID_CHANNELS[number])) {
        return fail("VALIDATION_ERROR", `Invalid channel '${ch}'. Must be one of: ${VALID_CHANNELS.join(", ")}`);
      }
    }

    const priority = String(args.priority ?? "normal");
    if (!VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
      return fail("VALIDATION_ERROR", `Invalid priority '${priority}'. Must be one of: ${VALID_PRIORITIES.join(", ")}`);
    }

    const notificationId = generateId();
    const insertResult = await supabase.schema("notifications_mcp").from("notifications").insert({
      notification_id: notificationId,
      user_id: userId,
      type,
      title,
      body,
      channels,
      priority,
      data: args.data ?? {},
      status: "sent",
      read: false,
      created_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");

    // Deliver via external APIs after DB commit. Fetch user contact info if needed.
    if (channels.includes("email") || channels.includes("sms")) {
      const userResult = await supabase.schema("auth_mcp").from("users").select("email,phone,email_verified,phone_verified").eq("user_id", userId).maybeSingle();
      const userEmail = String(userResult.data?.email ?? "");
      const userPhone = String(userResult.data?.phone ?? "");
      const emailVerified = Boolean(userResult.data?.email_verified ?? false);
      const phoneVerified = Boolean(userResult.data?.phone_verified ?? false);
      if (channels.includes("email") && userEmail && emailVerified) {
        await deliverEmail(userEmail, title, body);
      }
      if (channels.includes("sms") && userPhone && phoneVerified) {
        await deliverSms(userPhone, `${title}: ${body}`);
      }
    }

    await emitEvent("notifications.notification.sent", { notification_id: notificationId, user_id: userId, type, channels, priority });
    return { content: [{ type: "text", text: ok({ notification_id: notificationId, user_id: userId, channels, priority, status: "sent" }) }] };
  }

  if (tool === "get_notifications") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");

    const limit = Number(args.limit ?? 50);
    const offset = Number(args.offset ?? 0);

    let query = supabase.schema("notifications_mcp").from("notifications").select("*", { count: "exact" }).eq("user_id", userId);
    if (args.status) query = query.eq("status", String(args.status));
    query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const result = await query;
    if (result.error) return fail("DB_ERROR", "Database operation failed");

    const unreadResult = await supabase.schema("notifications_mcp").from("notifications")
      .select("notification_id", { count: "exact" })
      .eq("user_id", userId)
      .eq("read", false);

    return { content: [{ type: "text", text: ok({ notifications: result.data ?? [], total: result.count ?? 0, unread_count: unreadResult.count ?? 0 }) }] };
  }

  if (tool === "mark_read") {
    const notificationIds = args.notification_ids as string[] | undefined;
    const userId = String(args.user_id ?? "");
    if (!notificationIds || notificationIds.length === 0 || !userId) return fail("VALIDATION_ERROR", "notification_ids (non-empty) and user_id are required.");

    const updateResult = await supabase.schema("notifications_mcp").from("notifications")
      .update({ read: true, read_at: now() })
      .in("notification_id", notificationIds)
      .eq("user_id", userId);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");

    return { content: [{ type: "text", text: ok({ marked_read: notificationIds.length }) }] };
  }

  if (tool === "get_preferences") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");

    const result = await supabase.schema("notifications_mcp").from("notification_preferences").select("*").eq("user_id", userId).maybeSingle();
    if (result.error) return fail("DB_ERROR", "Database operation failed");

    const defaults = { email_enabled: true, sms_enabled: true, push_enabled: true, in_app_enabled: true, quiet_hours_start: null, quiet_hours_end: null };
    return { content: [{ type: "text", text: ok({ preferences: result.data ?? { user_id: userId, ...defaults } }) }] };
  }

  if (tool === "update_preferences") {
    const userId = String(args.user_id ?? "");
    const preferences = args.preferences as Record<string, unknown> | undefined;
    if (!userId || !preferences) return fail("VALIDATION_ERROR", "user_id and preferences are required.");

    const upsertResult = await supabase.schema("notifications_mcp").from("notification_preferences").upsert({
      user_id: userId,
      ...preferences,
      updated_at: now(),
    }, { onConflict: "user_id" });
    if (upsertResult.error) return fail("DB_ERROR", "Database operation failed");

    return { content: [{ type: "text", text: ok({ user_id: userId, updated: true }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("notifications", Number(process.env.MCP_HTTP_PORT ?? 4117));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}

if (eventBus) {
  const NOTIFY_EVENTS = [
    "escrow.funds.released", "escrow.escrow.frozen", "auction.bid.placed",
    "auction.lot.closed", "inspection.discrepancy.detected", "dispute.dispute.escalated",
    "logistics.shipment.delivered", "contracts.order.triggered",
  ];
  eventBus.startConsumerLoop("notifications-consumer", async (event, payload) => {
    if (!NOTIFY_EVENTS.some((e) => event.startsWith(e.split(".")[0] ?? ""))) return;
    const userId = String(payload.user_id ?? payload.buyer_id ?? payload.seller_id ?? "");
    if (!userId || !supabase) return;
    await supabase.schema("notifications_mcp").from("notifications").insert({
      notification_id: generateId(),
      user_id: userId,
      type: event,
      title: event.replace(/\./g, " "),
      body: JSON.stringify(payload).slice(0, 200),
      data: payload,
      channels_sent: ["in_app"],
      priority: event.includes("frozen") || event.includes("discrepancy") ? "high" : "normal",
    });
    console.error(`[notifications-mcp] auto-notify: ${event} -> ${userId}`);
  });
  console.error("[notifications-mcp] event bus consumer started");
}
