import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "messaging-mcp";
const SERVER_VERSION = "0.1.0";
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface MessageThread {
  thread_id: string;
  participants: string[];
  subject?: string;
  listing_id?: string;
  messages: Array<{
    message_id: string;
    sender_id: string;
    content: string;
    created_at: string;
  }>;
}

const threads = new Map<string, MessageThread>();
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
    { name: "create_thread", description: "Create a conversation thread", inputSchema: { type: "object", properties: { participants: { type: "array" }, listing_id: { type: "string" }, subject: { type: "string" } }, required: ["participants"] } },
    { name: "send_message", description: "Send message in thread", inputSchema: { type: "object", properties: { thread_id: { type: "string" }, sender_id: { type: "string" }, content: { type: "string" } }, required: ["thread_id", "sender_id", "content"] } },
    { name: "get_thread", description: "Get thread messages", inputSchema: { type: "object", properties: { thread_id: { type: "string" } }, required: ["thread_id"] } },
    { name: "get_unread", description: "Get unread count by user", inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }

  if (tool === "create_thread") {
    if (!Array.isArray(args.participants) || args.participants.length < 2) {
      return fail("VALIDATION_ERROR", "participants must contain at least 2 user IDs.");
    }
    const threadId = generateId();
    const participants = (Array.isArray(args.participants) ? args.participants : []).map(String);
    const thread: MessageThread = {
      thread_id: threadId,
      participants,
      listing_id: args.listing_id ? String(args.listing_id) : undefined,
      subject: args.subject ? String(args.subject) : undefined,
      messages: [],
    };

    if (supabase) {
      const { error } = await supabase.schema("messaging_mcp").from("threads").insert({
        thread_id: threadId,
        listing_id: thread.listing_id ?? null,
        subject: thread.subject ?? null,
        participants,
        thread_type: "general",
      });
      if (error) return fail("DB_ERROR", error.message);
      await emitEvent("messaging.thread.created", { thread_id: threadId, participants: thread.participants });
      return { content: [{ type: "text", text: ok({ thread_id: threadId }) }] };
    }

    threads.set(threadId, thread);
    await emitEvent("messaging.thread.created", { thread_id: threadId, participants: thread.participants });
    return { content: [{ type: "text", text: ok({ thread_id: threadId }) }] };
  }

  if (tool === "send_message") {
    const threadId = String(args.thread_id ?? "");
    if (!threadId) return fail("VALIDATION_ERROR", "thread_id is required.");
    if (!String(args.sender_id ?? "").trim()) return fail("VALIDATION_ERROR", "sender_id is required.");
    if (!String(args.content ?? "").trim()) return fail("VALIDATION_ERROR", "content is required.");

    if (supabase) {
      const { data: threadExists, error: threadCheckError } = await supabase
        .schema("messaging_mcp")
        .from("threads")
        .select("thread_id")
        .eq("thread_id", threadId)
        .maybeSingle();
      if (threadCheckError) return fail("DB_ERROR", threadCheckError.message);
      if (!threadExists) return fail("NOT_FOUND", "Thread not found");

      const messageId = generateId();
      const createdAt = now();
      const { error } = await supabase.schema("messaging_mcp").from("messages").insert({
        message_id: messageId,
        thread_id: threadId,
        sender_id: String(args.sender_id ?? ""),
        content: String(args.content ?? ""),
        created_at: createdAt,
      });
      if (error) return fail("DB_ERROR", error.message);
      await supabase
        .schema("messaging_mcp")
        .from("threads")
        .update({ last_message_at: createdAt })
        .eq("thread_id", threadId);
      await emitEvent("messaging.message.sent", { thread_id: threadId, message_id: messageId, sender_id: String(args.sender_id ?? "") });
      return { content: [{ type: "text", text: ok({ message_id: messageId, timestamp: createdAt }) }] };
    }

    const thread = threads.get(threadId);
    if (!thread) return fail("NOT_FOUND", "Thread not found");
    const message = {
      message_id: generateId(),
      sender_id: String(args.sender_id ?? ""),
      content: String(args.content ?? ""),
      created_at: now(),
    };
    thread.messages.push(message);
    threads.set(threadId, thread);
    await emitEvent("messaging.message.sent", { thread_id: threadId, message_id: message.message_id, sender_id: message.sender_id });
    return { content: [{ type: "text", text: ok({ message_id: message.message_id, timestamp: message.created_at }) }] };
  }

  if (tool === "get_thread") {
    const threadId = String(args.thread_id ?? "");
    if (!threadId) return fail("VALIDATION_ERROR", "thread_id is required.");

    if (supabase) {
      const { data: thread, error: threadError } = await supabase
        .schema("messaging_mcp")
        .from("threads")
        .select("*")
        .eq("thread_id", threadId)
        .maybeSingle();
      if (threadError) return fail("DB_ERROR", threadError.message);
      if (!thread) return { content: [{ type: "text", text: ok({ thread: null }) }] };
      const { data: messages, error: messagesError } = await supabase
        .schema("messaging_mcp")
        .from("messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (messagesError) return fail("DB_ERROR", messagesError.message);
      return { content: [{ type: "text", text: ok({ thread: { ...thread, messages: messages ?? [] } }) }] };
    }

    const thread = threads.get(threadId);
    return { content: [{ type: "text", text: ok({ thread: thread ?? null }) }] };
  }

  if (tool === "get_unread") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");

    if (supabase) {
      const { data: joinedThreads, error: threadError } = await supabase
        .schema("messaging_mcp")
        .from("threads")
        .select("thread_id,participants")
        .contains("participants", [userId]);
      if (threadError) return fail("DB_ERROR", threadError.message);
      const threadIds = (joinedThreads ?? []).map((row) => row.thread_id);
      if (threadIds.length === 0) return { content: [{ type: "text", text: ok({ total_unread: 0, thread_count: 0 }) }] };

      const { data: messages, error: messagesError } = await supabase
        .schema("messaging_mcp")
        .from("messages")
        .select("sender_id")
        .in("thread_id", threadIds)
        .neq("sender_id", userId);
      if (messagesError) return fail("DB_ERROR", messagesError.message);
      return {
        content: [
          {
            type: "text",
            text: ok({ total_unread: (messages ?? []).length, thread_count: threadIds.length }),
          },
        ],
      };
    }

    const joined = Array.from(threads.values()).filter((thread) => thread.participants.includes(userId));
    const totalUnread = joined.reduce((sum, thread) => sum + thread.messages.filter((m) => m.sender_id !== userId).length, 0);
    return { content: [{ type: "text", text: ok({ total_unread: totalUnread, thread_count: joined.length }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("messaging", Number(process.env.MCP_HTTP_PORT ?? 4105));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
