// Notifications domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/notifications-mcp/src/index.ts.
// SendGrid + Twilio called via fetch (Deno-native, no SDK).

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "notifications-edge";
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")?.trim();
const SENDGRID_FROM_EMAIL = Deno.env.get("SENDGRID_FROM_EMAIL") ?? "noreply@matex.ca";
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER")?.trim();

const VALID_CHANNELS = new Set(["email", "sms", "push", "in_app"]);
const VALID_PRIORITIES = new Set(["low", "normal", "high", "critical"]);

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
    // Non-blocking: DB record already committed.
  }
}

async function deliverSms(to: string, body: string): Promise<void> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER || !to) return;
  try {
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: TWILIO_PHONE_NUMBER, Body: body }).toString(),
    });
  } catch {
    // Non-blocking.
  }
}

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function sendNotification({ args }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? "");
  const type = String(args.type ?? "");
  const title = String(args.title ?? "");
  const body = String(args.body ?? "");
  const channels = args.channels as string[] | undefined;
  if (!userId || !type || !title || !body || !channels || channels.length === 0) {
    return failEnvelope("VALIDATION_ERROR", "user_id, type, title, body, channels (non-empty) are required.");
  }
  for (const ch of channels) {
    if (!VALID_CHANNELS.has(ch)) {
      return failEnvelope("VALIDATION_ERROR", `Invalid channel '${ch}'. Must be one of: ${[...VALID_CHANNELS].join(", ")}`);
    }
  }
  const priority = String(args.priority ?? "normal");
  if (!VALID_PRIORITIES.has(priority)) {
    return failEnvelope("VALIDATION_ERROR", `Invalid priority '${priority}'. Must be one of: ${[...VALID_PRIORITIES].join(", ")}`);
  }
  const notificationId = generateId();
  const { error } = await supabase.schema("notifications_mcp").from("notifications").insert({
    notification_id: notificationId, user_id: userId,
    type, title, body, channels, priority,
    data: args.data ?? {}, status: "sent", read: false, created_at: now(),
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");

  if (channels.includes("email") || channels.includes("sms")) {
    const userResult = await supabase.schema("auth_mcp").from("users")
      .select("email,phone,email_verified,phone_verified").eq("user_id", userId).maybeSingle();
    const userEmail = String(userResult.data?.email ?? "");
    const userPhone = String(userResult.data?.phone ?? "");
    const emailVerified = Boolean(userResult.data?.email_verified ?? false);
    const phoneVerified = Boolean(userResult.data?.phone_verified ?? false);
    if (channels.includes("email") && userEmail && emailVerified) await deliverEmail(userEmail, title, body);
    if (channels.includes("sms") && userPhone && phoneVerified) await deliverSms(userPhone, `${title}: ${body}`);
  }
  await emitEvent(supabase, SOURCE, "notifications.notification.sent", {
    notification_id: notificationId, user_id: userId, type, channels, priority,
  });
  return okEnvelope({ notification_id: notificationId, user_id: userId, channels, priority, status: "sent" });
}

async function getNotifications({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const limit = Number(args.limit ?? 50);
  const offset = Number(args.offset ?? 0);
  let query = supabase.schema("notifications_mcp").from("notifications")
    .select("*", { count: "exact" }).eq("user_id", userId);
  if (args.status) query = query.eq("status", String(args.status));
  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);
  const result = await query;
  if (result.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const unread = await supabase.schema("notifications_mcp").from("notifications")
    .select("notification_id", { count: "exact" }).eq("user_id", userId).eq("read", false);
  return okEnvelope({
    notifications: result.data ?? [],
    total: result.count ?? 0,
    unread_count: unread.count ?? 0,
  });
}

async function markRead({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const notificationIds = args.notification_ids as string[] | undefined;
  const userId = String(args.user_id ?? caller.userId);
  if (!notificationIds || notificationIds.length === 0 || !userId) {
    return failEnvelope("VALIDATION_ERROR", "notification_ids (non-empty) and user_id are required.");
  }
  const { error } = await supabase.schema("notifications_mcp").from("notifications")
    .update({ read: true, read_at: now() })
    .in("notification_id", notificationIds).eq("user_id", userId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ marked_read: notificationIds.length });
}

async function getPreferences({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const { data, error } = await supabase.schema("notifications_mcp").from("notification_preferences")
    .select("*").eq("user_id", userId).maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  const defaults = {
    email_enabled: true, sms_enabled: true, push_enabled: true, in_app_enabled: true,
    quiet_hours_start: null, quiet_hours_end: null,
  };
  return okEnvelope({ preferences: data ?? { user_id: userId, ...defaults } });
}

async function updatePreferences({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  const preferences = args.preferences as Record<string, unknown> | undefined;
  if (!userId || !preferences) return failEnvelope("VALIDATION_ERROR", "user_id and preferences are required.");
  const { error } = await supabase.schema("notifications_mcp").from("notification_preferences")
    .upsert({ user_id: userId, ...preferences, updated_at: now() }, { onConflict: "user_id" });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ user_id: userId, updated: true });
}

Deno.serve(serveDomain({
  ping,
  send_notification: sendNotification,
  get_notifications: getNotifications,
  mark_read: markRead,
  get_preferences: getPreferences,
  update_preferences: updatePreferences,
}));
