import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "kyc-mcp";
const SERVER_VERSION = "0.1.0";
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;

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

function levelRank(level: string): number {
  const map: Record<string, number> = { level_0: 0, level_1: 1, level_2: 2, level_3: 3 };
  return map[level] ?? 0;
}

async function emitEvent(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!eventBus) return;
  try {
    await eventBus.publish(event, payload, SERVER_NAME);
  } catch {
    // non-blocking
  }
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "start_verification", description: "Start KYC verification request", inputSchema: { type: "object", properties: { user_id: { type: "string" }, target_level: { type: "string" } }, required: ["user_id", "target_level"] } },
    { name: "submit_document", description: "Attach KYC document to verification", inputSchema: { type: "object", properties: { verification_id: { type: "string" }, user_id: { type: "string" }, doc_type: { type: "string" }, file_url: { type: "string" }, file_hash: { type: "string" } }, required: ["verification_id", "user_id", "doc_type", "file_url", "file_hash"] } },
    { name: "review_verification", description: "Review and set KYC status", inputSchema: { type: "object", properties: { verification_id: { type: "string" }, status: { type: "string" }, reviewer_id: { type: "string" }, reviewer_notes: { type: "string" } }, required: ["verification_id", "status"] } },
    { name: "get_kyc_level", description: "Get current KYC level by user", inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] } },
    { name: "assert_kyc_gate", description: "Assert user meets required KYC level", inputSchema: { type: "object", properties: { user_id: { type: "string" }, required_level: { type: "string" }, context: { type: "string" } }, required: ["user_id", "required_level"] } },
    { name: "check_kyc_expiry", description: "Find users whose KYC review is overdue and downgrade/flag them", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }

  if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for kyc-mcp.");

  if (tool === "start_verification") {
    const userId = String(args.user_id ?? "");
    const targetLevel = String(args.target_level ?? "");
    if (!userId || !targetLevel) return fail("VALIDATION_ERROR", "user_id and target_level are required.");
    const verificationId = generateId();
    const { error } = await supabase.schema("kyc_mcp").from("verifications").insert({
      verification_id: verificationId,
      user_id: userId,
      target_level: targetLevel,
      current_status: "pending",
      submitted_at: now(),
    });
    if (error) return fail("DB_ERROR", error.message);
    await emitEvent("kyc.verification.started", { verification_id: verificationId, user_id: userId, target_level: targetLevel });
    return { content: [{ type: "text", text: ok({ verification_id: verificationId, status: "pending" }) }] };
  }

  if (tool === "submit_document") {
    const verificationId = String(args.verification_id ?? "");
    const userId = String(args.user_id ?? "");
    const docType = String(args.doc_type ?? "");
    const fileUrl = String(args.file_url ?? "");
    const fileHash = String(args.file_hash ?? "");
    if (!verificationId || !userId || !docType || !fileUrl || !fileHash) {
      return fail("VALIDATION_ERROR", "verification_id, user_id, doc_type, file_url, file_hash are required.");
    }
    const documentId = generateId();
    const { error } = await supabase.schema("kyc_mcp").from("documents").insert({
      document_id: documentId,
      verification_id: verificationId,
      user_id: userId,
      doc_type: docType,
      file_url: fileUrl,
      file_hash: fileHash,
    });
    if (error) return fail("DB_ERROR", error.message);
    await emitEvent("kyc.document.submitted", { verification_id: verificationId, document_id: documentId, user_id: userId });
    return { content: [{ type: "text", text: ok({ document_id: documentId }) }] };
  }

  if (tool === "review_verification") {
    const verificationId = String(args.verification_id ?? "");
    const status = String(args.status ?? "");
    if (!verificationId || !status) return fail("VALIDATION_ERROR", "verification_id and status are required.");

    const reviewPayload: Record<string, unknown> = {
      current_status: status,
      reviewed_at: now(),
      reviewer_id: args.reviewer_id ? String(args.reviewer_id) : null,
      reviewer_notes: args.reviewer_notes ? String(args.reviewer_notes) : null,
      verified_at: status === "verified" ? now() : null,
    };

    const updateResult = await supabase
      .schema("kyc_mcp")
      .from("verifications")
      .update(reviewPayload)
      .eq("verification_id", verificationId)
      .select("user_id,target_level")
      .maybeSingle();
    if (updateResult.error) return fail("DB_ERROR", updateResult.error.message);
    if (!updateResult.data) return fail("NOT_FOUND", "verification_id not found");

    if (status === "verified") {
      const userId = updateResult.data.user_id as string;
      const targetLevel = updateResult.data.target_level as string;

      const currentLevelResult = await supabase.schema("kyc_mcp").from("kyc_levels").select("current_level").eq("user_id", userId).maybeSingle();
      if (currentLevelResult.error) return fail("DB_ERROR", currentLevelResult.error.message);
      const currentLevel = String(currentLevelResult.data?.current_level ?? "level_0");
      if (levelRank(targetLevel) < levelRank(currentLevel)) {
        return fail("KYC_DOWNGRADE_FORBIDDEN", `Cannot lower KYC level from ${currentLevel} to ${targetLevel}.`);
      }

      const upsertPayload: Record<string, unknown> = {
        user_id: userId,
        current_level: targetLevel,
        updated_at: now(),
      };
      if (targetLevel === "level_0") upsertPayload.level_0_at = now();
      if (targetLevel === "level_1") upsertPayload.level_1_at = now();
      if (targetLevel === "level_2") upsertPayload.level_2_at = now();
      if (targetLevel === "level_3") upsertPayload.level_3_at = now();
      const levelUpsert = await supabase.schema("kyc_mcp").from("kyc_levels").upsert(upsertPayload, { onConflict: "user_id" });
      if (levelUpsert.error) return fail("DB_ERROR", levelUpsert.error.message);
    }

    await emitEvent("kyc.verification.reviewed", { verification_id: verificationId, status });
    return { content: [{ type: "text", text: ok({ verification_id: verificationId, status }) }] };
  }

  if (tool === "get_kyc_level") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    const result = await supabase.schema("kyc_mcp").from("kyc_levels").select("current_level,updated_at").eq("user_id", userId).maybeSingle();
    if (result.error) return fail("DB_ERROR", result.error.message);
    return { content: [{ type: "text", text: ok({ user_id: userId, current_level: result.data?.current_level ?? "level_0", updated_at: result.data?.updated_at ?? null }) }] };
  }

  if (tool === "assert_kyc_gate") {
    const userId = String(args.user_id ?? "");
    const requiredLevel = String(args.required_level ?? "");
    if (!userId || !requiredLevel) return fail("VALIDATION_ERROR", "user_id and required_level are required.");
    const result = await supabase.schema("kyc_mcp").from("kyc_levels").select("current_level").eq("user_id", userId).maybeSingle();
    if (result.error) return fail("DB_ERROR", result.error.message);
    const currentLevel = String(result.data?.current_level ?? "level_0");
    const allowed = levelRank(currentLevel) >= levelRank(requiredLevel);
    if (!allowed) {
      return fail("KYC_GATE_BLOCKED", `Required ${requiredLevel}, current ${currentLevel} for context '${String(args.context ?? "unknown")}'.`);
    }
    return { content: [{ type: "text", text: ok({ user_id: userId, current_level: currentLevel, required_level: requiredLevel, allowed: true }) }] };
  }

  if (tool === "check_kyc_expiry") {
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const now_ = now();
    const { data: expiredRows, error: expiredError } = await supabase
      .schema("kyc_mcp")
      .from("kyc_levels")
      .select("user_id,current_level,next_review_at")
      .lt("next_review_at", now_)
      .limit(limit);
    if (expiredError) return fail("DB_ERROR", expiredError.message);
    const rows = expiredRows ?? [];
    const flagged: string[] = [];
    for (const row of rows) {
      const userId = String(row.user_id);
      const { error: updateError } = await supabase
        .schema("kyc_mcp")
        .from("kyc_levels")
        .update({ kyc_status: "review_required", updated_at: now_ })
        .eq("user_id", userId);
      if (!updateError) {
        flagged.push(userId);
        await emitEvent("kyc.expiry.flagged", { user_id: userId, current_level: row.current_level, next_review_at: row.next_review_at });
      }
    }
    return { content: [{ type: "text", text: ok({ flagged_count: flagged.length, flagged_user_ids: flagged }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("kyc", Number(process.env.MCP_HTTP_PORT ?? 4107));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
