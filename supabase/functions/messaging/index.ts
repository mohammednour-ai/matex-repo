// Messaging domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/messaging-mcp/src/index.ts.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "messaging-edge";

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function createThread({ args }: ToolRequest) {
  const supabase = serviceClient();
  if (!Array.isArray(args.participants) || args.participants.length < 2) {
    return failEnvelope("VALIDATION_ERROR", "participants must contain at least 2 user IDs.");
  }
  const threadId = generateId();
  const participants = (args.participants as unknown[]).map(String);
  const { error } = await supabase.schema("messaging_mcp").from("threads").insert({
    thread_id: threadId,
    listing_id: args.listing_id ? String(args.listing_id) : null,
    subject: args.subject ? String(args.subject) : null,
    participants,
    thread_type: "general",
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "messaging.thread.created", { thread_id: threadId, participants });
  return okEnvelope({ thread_id: threadId });
}

async function sendMessage({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const threadId = String(args.thread_id ?? "");
  if (!threadId) return failEnvelope("VALIDATION_ERROR", "thread_id is required.");
  const senderId = String(args.sender_id ?? caller.userId).trim();
  if (!senderId) return failEnvelope("VALIDATION_ERROR", "sender_id is required.");
  if (!String(args.content ?? "").trim()) return failEnvelope("VALIDATION_ERROR", "content is required.");
  const exists = await supabase.schema("messaging_mcp").from("threads").select("thread_id").eq("thread_id", threadId).maybeSingle();
  if (exists.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!exists.data) return failEnvelope("NOT_FOUND", "Thread not found");
  const messageId = generateId();
  const createdAt = now();
  const insert = await supabase.schema("messaging_mcp").from("messages").insert({
    message_id: messageId, thread_id: threadId, sender_id: senderId,
    content: String(args.content ?? ""), created_at: createdAt,
  });
  if (insert.error) return failEnvelope("DB_ERROR", "Database operation failed");
  await supabase.schema("messaging_mcp").from("threads").update({ last_message_at: createdAt }).eq("thread_id", threadId);
  await emitEvent(supabase, SOURCE, "messaging.message.sent", { thread_id: threadId, message_id: messageId, sender_id: senderId });
  return okEnvelope({ message_id: messageId, timestamp: createdAt });
}

async function getThread({ args }: ToolRequest) {
  const supabase = serviceClient();
  const threadId = String(args.thread_id ?? "");
  if (!threadId) return failEnvelope("VALIDATION_ERROR", "thread_id is required.");
  const thread = await supabase.schema("messaging_mcp").from("threads").select("*").eq("thread_id", threadId).maybeSingle();
  if (thread.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!thread.data) return okEnvelope({ thread: null });
  const messages = await supabase.schema("messaging_mcp").from("messages")
    .select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
  if (messages.error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ thread: { ...thread.data, messages: messages.data ?? [] } });
}

async function listThreads({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const limit = Math.min(Number(args.limit ?? 50), 100);
  const offset = Math.max(Number(args.offset ?? 0), 0);
  const { data, error, count } = await supabase.schema("messaging_mcp").from("threads")
    .select("thread_id,listing_id,subject,participants,last_message_at,status", { count: "exact" })
    .contains("participants", [userId])
    .order("last_message_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  const list = (data ?? []).map((t: Record<string, unknown>) => {
    const parts = Array.isArray(t.participants) ? (t.participants as string[]) : [];
    const otherId = parts.find((p) => p !== userId) ?? "";
    return {
      thread_id: t.thread_id, listing_id: t.listing_id ?? null, subject: t.subject ?? null,
      other_user_id: otherId, other_user_name: otherId.slice(0, 8),
      last_message: "",
      last_message_at: t.last_message_at ?? new Date(0).toISOString(),
      unread_count: 0, status: t.status ?? "active",
    };
  });
  return okEnvelope({ threads: list, total: count ?? 0, limit, offset });
}

async function getMessages({ args }: ToolRequest) {
  const supabase = serviceClient();
  const threadId = String(args.thread_id ?? "");
  if (!threadId) return failEnvelope("VALIDATION_ERROR", "thread_id is required.");
  const limit = Math.min(Number(args.limit ?? 50), 200);
  const offset = Math.max(Number(args.offset ?? 0), 0);
  const { data, error, count } = await supabase.schema("messaging_mcp").from("messages")
    .select("message_id,thread_id,sender_id,content,created_at", { count: "exact" })
    .eq("thread_id", threadId).order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ messages: data ?? [], total: count ?? 0, limit, offset });
}

async function getUnread({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const joined = await supabase.schema("messaging_mcp").from("threads")
    .select("thread_id,participants").contains("participants", [userId]);
  if (joined.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const threadIds = (joined.data ?? []).map((row: Record<string, unknown>) => row.thread_id);
  if (threadIds.length === 0) return okEnvelope({ total_unread: 0, thread_count: 0 });
  const messages = await supabase.schema("messaging_mcp").from("messages")
    .select("sender_id,read_by").in("thread_id", threadIds).neq("sender_id", userId);
  if (messages.error) return failEnvelope("DB_ERROR", "Database operation failed");
  const unread = (messages.data ?? []).filter((m: Record<string, unknown>) => {
    const rb = Array.isArray(m.read_by) ? (m.read_by as string[]) : [];
    return !rb.includes(userId);
  });
  return okEnvelope({ total_unread: unread.length, thread_count: threadIds.length });
}

async function markThreadRead({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const threadId = String(args.thread_id ?? "");
  const userId = String(args.user_id ?? caller.userId);
  if (!threadId) return failEnvelope("VALIDATION_ERROR", "thread_id is required.");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const msgs = await supabase.schema("messaging_mcp").from("messages")
    .select("message_id,read_by").eq("thread_id", threadId).neq("sender_id", userId);
  if (msgs.error) return failEnvelope("DB_ERROR", "Database operation failed");
  let marked = 0;
  for (const m of msgs.data ?? []) {
    const row = m as Record<string, unknown>;
    const rb = Array.isArray(row.read_by) ? (row.read_by as string[]) : [];
    if (rb.includes(userId)) continue;
    const next = [...rb, userId];
    const { error } = await supabase.schema("messaging_mcp").from("messages")
      .update({ read_by: next }).eq("message_id", row.message_id);
    if (error) return failEnvelope("DB_ERROR", "Database operation failed");
    marked++;
  }
  await emitEvent(supabase, SOURCE, "messaging.thread.read", { thread_id: threadId, user_id: userId, marked });
  return okEnvelope({ thread_id: threadId, marked_count: marked });
}

Deno.serve(serveDomain({
  ping,
  create_thread: createThread,
  send_message: sendMessage,
  get_thread: getThread,
  list_threads: listThreads,
  get_messages: getMessages,
  get_unread: getUnread,
  mark_thread_read: markThreadRead,
}));
