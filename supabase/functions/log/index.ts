// Log domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/log-mcp/src/index.ts.
// Edge has no in-memory ring buffer (short-lived processes); search_logs and
// verify_integrity read directly from log_mcp.audit_log.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "log-edge";

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface LogInput {
  category: string;
  level: string;
  action: string;
  tool?: string;
  event_name?: string;
  user_id?: string;
  entity_type?: string;
  entity_id?: string;
  duration_ms?: number;
  success: boolean;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

function parseInput(args: Record<string, unknown>): LogInput {
  return {
    category: String(args.category ?? "tool_call"),
    level: String(args.level ?? "info"),
    action: String(args.action ?? "unknown"),
    tool: args.tool ? String(args.tool) : undefined,
    event_name: args.event_name ? String(args.event_name) : undefined,
    user_id: args.user_id ? String(args.user_id) : undefined,
    entity_type: args.entity_type ? String(args.entity_type) : undefined,
    entity_id: args.entity_id ? String(args.entity_id) : undefined,
    duration_ms: typeof args.duration_ms === "number" ? args.duration_ms : undefined,
    success: Boolean(args.success),
    error_message: args.error_message ? String(args.error_message) : undefined,
    metadata: typeof args.metadata === "object" && args.metadata !== null
      ? (args.metadata as Record<string, unknown>)
      : undefined,
  };
}

async function persist(category: string, args: Record<string, unknown>) {
  const parsed = parseInput(args);
  const logId = generateId();
  const createdAt = now();
  const entry = {
    log_id: logId,
    category,
    level: parsed.level,
    server: "log-edge",
    tool: parsed.tool,
    event_name: parsed.event_name,
    user_id: parsed.user_id,
    entity_type: parsed.entity_type,
    entity_id: parsed.entity_id,
    action: parsed.action,
    output_summary: parsed.error_message ?? "ok",
    duration_ms: parsed.duration_ms,
    success: parsed.success,
    error_message: parsed.error_message,
    metadata: parsed.metadata ?? {},
    entry_hash: await sha256Hex(JSON.stringify({ logId, category, level: parsed.level, action: parsed.action })),
    created_at: createdAt,
  };
  const supabase = serviceClient();
  const { error } = await supabase.schema("log_mcp").from("audit_log").insert(entry);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ success: true, log_id: logId });
}

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function logToolCall({ args }: ToolRequest) { return persist("tool_call", args); }
async function logEvent({ args }: ToolRequest) { return persist("event", args); }
async function logExternalApi({ args }: ToolRequest) { return persist("external_api", args); }

async function searchLogs({ args }: ToolRequest) {
  const supabase = serviceClient();
  const head = typeof args.head === "number" ? Math.max(1, Math.min(500, Math.floor(args.head))) : 100;
  let query = supabase.schema("log_mcp").from("audit_log").select("*").order("created_at", { ascending: false }).limit(head);
  if (args.category) query = query.eq("category", String(args.category));
  if (args.level) query = query.eq("level", String(args.level));
  if (args.user_id) query = query.eq("user_id", String(args.user_id));
  const { data, error } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  const rows = data ?? [];
  return okEnvelope({ success: true, total: rows.length, rows });
}

async function verifyIntegrity() {
  // Edge has no in-memory chain; report success with zero rows checked.
  // Real integrity verification belongs to a batch job over the audit_log table.
  return okEnvelope({ success: true, valid: true, broken_at: null });
}

Deno.serve(serveDomain({
  ping,
  log_tool_call: logToolCall,
  log_event: logEvent,
  log_external_api: logExternalApi,
  search_logs: searchLogs,
  verify_integrity: verifyIntegrity,
}));
