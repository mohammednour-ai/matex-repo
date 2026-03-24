/**
 * MATEX log-mcp (Phase 0 foundation implementation)
 *
 * - Append-only audit ingestion tools
 * - Search/read tools for recent entries
 * - Integrity verification tool
 *
 * Note:
 * This implementation keeps an in-memory ring buffer for local development
 * and optionally mirrors inserts to Supabase when env vars are configured.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuditLogEntry, LogCategory, LogLevel } from "@matex/types";
import { generateId, MatexEventBus, now, sanitizeForLog, sha256 } from "@matex/utils";

type JsonObject = Record<string, unknown>;

interface LogInput {
  category: LogCategory;
  level: LogLevel;
  action: string;
  tool?: string;
  event_name?: string;
  user_id?: string;
  entity_type?: string;
  entity_id?: string;
  duration_ms?: number;
  success: boolean;
  error_message?: string;
  metadata?: JsonObject;
}

const SERVER_NAME = "log-mcp";
const SERVER_VERSION = "0.1.0";
const MAX_IN_MEMORY = 5_000;

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

const memoryLogStore: AuditLogEntry[] = [];

function toAuditLogEntry(input: LogInput): AuditLogEntry {
  return {
    log_id: generateId(),
    category: input.category,
    level: input.level,
    server: SERVER_NAME,
    tool: input.tool,
    event_name: input.event_name,
    user_id: input.user_id,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    action: input.action,
    duration_ms: input.duration_ms,
    success: input.success,
    error_message: input.error_message,
    created_at: now(),
  };
}

async function persistLog(entry: AuditLogEntry, metadata: JsonObject | undefined): Promise<void> {
  memoryLogStore.push(entry);
  if (memoryLogStore.length > MAX_IN_MEMORY) {
    memoryLogStore.shift();
  }

  if (!supabase) return;

  const { error } = await supabase.from("log_mcp.audit_log").insert({
    log_id: entry.log_id,
    category: entry.category,
    level: entry.level,
    server: entry.server,
    tool: entry.tool,
    event_name: entry.event_name,
    user_id: entry.user_id,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    action: entry.action,
    output_summary: entry.error_message ?? "ok",
    duration_ms: entry.duration_ms,
    success: entry.success,
    error_message: entry.error_message,
    metadata: metadata ?? {},
    entry_hash: sha256(JSON.stringify(entry)),
    created_at: entry.created_at,
  });

  // If Supabase insert fails, we still keep in-memory logs to avoid dropping developer traces.
  if (error) {
    console.error(`[${SERVER_NAME}] Supabase insert error:`, error.message);
  }
}

function parseLogInput(args: Record<string, unknown>): LogInput {
  return {
    category: (args.category as LogCategory) ?? "tool_call",
    level: (args.level as LogLevel) ?? "info",
    action: String(args.action ?? "unknown"),
    tool: args.tool ? String(args.tool) : undefined,
    event_name: args.event_name ? String(args.event_name) : undefined,
    user_id: args.user_id ? String(args.user_id) : undefined,
    entity_type: args.entity_type ? String(args.entity_type) : undefined,
    entity_id: args.entity_id ? String(args.entity_id) : undefined,
    duration_ms: typeof args.duration_ms === "number" ? args.duration_ms : undefined,
    success: Boolean(args.success),
    error_message: args.error_message ? String(args.error_message) : undefined,
    metadata: typeof args.metadata === "object" && args.metadata !== null ? (args.metadata as JsonObject) : undefined,
  };
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "log_tool_call",
      description: "Append tool call log entry to audit log",
      inputSchema: { type: "object", properties: { action: { type: "string" }, success: { type: "boolean" } }, required: ["action", "success"] },
    },
    {
      name: "log_event",
      description: "Append event log entry to audit log",
      inputSchema: { type: "object", properties: { event_name: { type: "string" }, action: { type: "string" } }, required: ["event_name", "action"] },
    },
    {
      name: "log_external_api",
      description: "Append external API call log entry to audit log",
      inputSchema: { type: "object", properties: { action: { type: "string" }, success: { type: "boolean" } }, required: ["action", "success"] },
    },
    {
      name: "search_logs",
      description: "Search in-memory recent audit logs by basic filters",
      inputSchema: { type: "object", properties: { category: { type: "string" }, level: { type: "string" }, user_id: { type: "string" }, head: { type: "number" } } },
    },
    {
      name: "verify_integrity",
      description: "Verify local in-memory hash chain continuity",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "ping",
      description: "Health check",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return {
      content: [{ type: "text", text: JSON.stringify({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }],
    };
  }

  if (tool === "log_tool_call" || tool === "log_event" || tool === "log_external_api") {
    const parsed = parseLogInput(args);
    const category: LogCategory =
      tool === "log_tool_call" ? "tool_call" : tool === "log_event" ? "event" : "external_api";
    const entry = toAuditLogEntry({ ...parsed, category });
    const metadata = parsed.metadata ? sanitizeForLog(parsed.metadata) : undefined;

    await persistLog(entry, metadata);
    return { content: [{ type: "text", text: JSON.stringify({ success: true, log_id: entry.log_id }) }] };
  }

  if (tool === "search_logs") {
    const category = args.category ? String(args.category) : null;
    const level = args.level ? String(args.level) : null;
    const userId = args.user_id ? String(args.user_id) : null;
    const head = typeof args.head === "number" ? Math.max(1, Math.min(500, Math.floor(args.head))) : 100;

    const rows = memoryLogStore
      .filter((row) => (!category || row.category === category) && (!level || row.level === level) && (!userId || row.user_id === userId))
      .slice(-head)
      .reverse();

    return { content: [{ type: "text", text: JSON.stringify({ success: true, total: rows.length, rows }) }] };
  }

  if (tool === "verify_integrity") {
    let previousHash = "";
    let valid = true;
    let brokenAt: string | null = null;

    for (const row of memoryLogStore) {
      const currentHash = sha256(`${previousHash}:${JSON.stringify(row)}`);
      if (!currentHash) {
        valid = false;
        brokenAt = row.log_id;
        break;
      }
      previousHash = currentHash;
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, valid, broken_at: brokenAt }) }],
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: `Unknown tool: ${tool}` }],
  };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal`, error);
  process.exit(1);
});

const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
if (EVENT_REDIS_URL) {
  const bus = new MatexEventBus({ redisUrl: EVENT_REDIS_URL, groupName: "log-mcp-consumer" });
  bus.startConsumerLoop("log-mcp-worker", async (event, payload, _id) => {
    const entry = {
      log_id: generateId(),
      level: "info" as const,
      category: "event" as const,
      server_name: String(payload.publisher ?? "unknown"),
      tool_name: event,
      input_hash: sha256(JSON.stringify(payload)),
      output_summary: JSON.stringify(payload).slice(0, 500),
      created_at: now(),
    };
    memoryLogStore.push(entry as AuditLogEntry);
    if (memoryLogStore.length > MAX_IN_MEMORY) memoryLogStore.shift();
    console.error(`[log-mcp] consumed event: ${event}`);
  });
  console.error("[log-mcp] event bus consumer started");
}
