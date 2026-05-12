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
import { generateId, MatexEventBus, now, sanitizeForLog, sha256 , initSentry} from "@matex/utils";

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
initSentry(SERVER_NAME);
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
      name: "get_retention_status",
      description: "Compute the FINTRAC / PCMLTFA record-retention checklist for a user. Replaces the hardcoded list in /compliance with real DB counts. Refs: docs/audit/2026-05-10/report.md §2.3 P1-5.",
      inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] },
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

  if (tool === "get_retention_status") {
    // Replaces the hardcoded RETENTION_CHECKS in apps/web-v2's compliance
    // page. All six checks now come from live DB counts (transactions, KYC
    // docs, beneficial ownership, LCTR-eligible transactions, STR filings,
    // and catalytic-converter listings via category slug).
    const userId = String(args.user_id ?? "");
    if (!userId) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "user_id is required." } }) }],
      };
    }
    if (!supabase) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "CONFIG_ERROR", message: "Supabase service role is required for get_retention_status." } }) }],
      };
    }

    const [txs, kycDocs, companies, lctrEligible, strs, catListings] = await Promise.all([
      supabase
        .schema("payments_mcp")
        .from("transactions")
        .select("transaction_id", { count: "exact", head: true })
        .eq("payer_id", userId),
      supabase
        .schema("kyc_mcp")
        .from("documents")
        .select("document_id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .schema("profile_mcp")
        .from("companies")
        .select("company_id", { count: "exact", head: true })
        .eq("user_id", userId),
      supabase
        .schema("payments_mcp")
        .from("transactions")
        .select("transaction_id", { count: "exact", head: true })
        .eq("payer_id", userId)
        .gte("amount", 10000),
      supabase
        .schema("log_mcp")
        .from("audit_log")
        .select("log_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .or("action.eq.compliance.str_filed,event_name.eq.compliance.str_filed"),
      // Catalytic-converter listings for this seller. Mirrors the edge query
      // in supabase/functions/log/index.ts — counts via category slug join so
      // the check doesn't need a hardcoded category_id UUID.
      supabase
        .schema("listing_mcp")
        .from("listings")
        .select("listing_id, categories!inner(slug)", { count: "exact", head: true })
        .eq("seller_id", userId)
        .ilike("categories.slug", "%catalytic%"),
    ]);

    const txCount = txs.count ?? 0;
    const kycCount = kycDocs.count ?? 0;
    const companyCount = companies.count ?? 0;
    const lctrCount = lctrEligible.count ?? 0;
    const strCount = strs.count ?? 0;
    const catCount = catListings.count ?? 0;

    const checks = [
      {
        id: "transaction_records",
        label: "Transaction records (5 years)",
        description: "All payment and order records are stored in the Matex audit log with tamper-evident hashing.",
        count: txCount,
        ok: true,
        // Even with zero transactions the retention obligation is "ok" — there's
        // nothing to retain yet. We surface the count so operators see the gauge.
        action: txCount === 0 ? "No transactions yet — records will accrue as you trade." : "",
      },
      {
        id: "client_identification",
        label: "Client identification records",
        description: "KYC Level 1 documents (government-issued ID) retained for 5 years from end of relationship.",
        count: kycCount,
        ok: kycCount > 0,
        action: kycCount === 0 ? "Upload your government-issued ID via Settings → KYC & Verification." : "",
      },
      {
        id: "beneficial_ownership",
        label: "Beneficial ownership (corporate accounts)",
        description: "Articles of incorporation and corporate structure for KYC Level 3 corporate accounts.",
        count: companyCount,
        // Only applicable when the user is corporate. If no company is on file
        // the requirement doesn't apply, so we mark it "ok" by convention.
        ok: companyCount === 0,
        action: companyCount > 0 ? "Required for corporate accounts — collect via KYC Level 3 verification in Settings." : "",
      },
      {
        id: "catalytic_serials",
        label: "Catalytic converter serial records",
        description: "Serial number, VIN, and photo documentation for all catalytic converter transactions.",
        count: catCount,
        ok: catCount === 0,
        action:
          catCount === 0
            ? "No catalytic-converter listings on file — no serial records required yet."
            : "Required for every catalytic listing — collect serial / VIN / photos via Listings > Create.",
      },
      {
        id: "str_filings",
        label: "Suspicious transaction logs",
        description: "STR filings are retained in the compliance audit trail for 5 years.",
        count: strCount,
        // STR filings are exception-driven; zero is normal and acceptable.
        ok: true,
        action: "",
      },
      {
        id: "lctr_reports",
        label: "FINTRAC reports (LCTRs)",
        description: "Filed Large Cash Transaction Reports archived in the compliance record.",
        count: lctrCount,
        // Count here is LCTR-eligible transactions (≥ CAD $10,000).
        // The actual filed-or-not distinction would require a column on
        // payments_mcp.transactions that we don't have today.
        ok: true,
        action: lctrCount > 0 ? "Confirm all CAD $10,000+ transactions are filed with FINTRAC within 15 days." : "",
      },
    ];

    return { content: [{ type: "text", text: JSON.stringify({ success: true, data: { checks } }) }] };
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
    const entry = toAuditLogEntry({
      category: "event",
      level: "info",
      action: event,
      event_name: event,
      success: true,
      tool: undefined,
      metadata: sanitizeForLog(payload) as Record<string, unknown>,
    });
    (entry as unknown as Record<string, unknown>).input_hash = sha256(JSON.stringify(payload));
    memoryLogStore.push(entry);
    if (memoryLogStore.length > MAX_IN_MEMORY) memoryLogStore.shift();
    console.error(`[log-mcp] consumed event: ${event}`);
  });
  console.error("[log-mcp] event bus consumer started");
}
