import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { callServer, generateId, MatexEventBus, now , initSentry} from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "dispute-mcp";
initSentry(SERVER_NAME);
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
    { name: "file_dispute", description: "File a new dispute against an order", inputSchema: { type: "object", properties: { order_id: { type: "string" }, filed_by: { type: "string" }, against_user_id: { type: "string" }, dispute_type: { type: "string" }, description: { type: "string" }, escrow_id: { type: "string" } }, required: ["order_id", "filed_by", "against_user_id", "dispute_type", "description"] } },
    { name: "submit_evidence", description: "Submit evidence for a dispute", inputSchema: { type: "object", properties: { dispute_id: { type: "string" }, submitted_by: { type: "string" }, evidence_type: { type: "string" }, file_url: { type: "string" }, description: { type: "string" } }, required: ["dispute_id", "submitted_by", "evidence_type"] } },
    { name: "propose_settlement", description: "Propose a settlement for a dispute", inputSchema: { type: "object", properties: { dispute_id: { type: "string" }, proposed_by: { type: "string" }, settlement_type: { type: "string" }, amount: { type: "number" }, description: { type: "string" } }, required: ["dispute_id", "proposed_by", "settlement_type"] } },
    { name: "escalate_dispute", description: "Escalate dispute to higher resolution tier", inputSchema: { type: "object", properties: { dispute_id: { type: "string" }, escalated_by: { type: "string" }, reason: { type: "string" } }, required: ["dispute_id", "escalated_by", "reason"] } },
    { name: "resolve_dispute", description: "Resolve a dispute with final decision", inputSchema: { type: "object", properties: { dispute_id: { type: "string" }, resolved_by: { type: "string" }, resolution: { type: "string" }, resolution_type: { type: "string" }, penalty_amount: { type: "number" }, penalty_user_id: { type: "string" } }, required: ["dispute_id", "resolved_by", "resolution", "resolution_type"] } },
    { name: "get_dispute", description: "Get dispute with evidence and settlements", inputSchema: { type: "object", properties: { dispute_id: { type: "string" } }, required: ["dispute_id"] } },
    { name: "update_pis", description: "Recalculate Platform Integrity Score for a user", inputSchema: { type: "object", properties: { user_id: { type: "string" }, score_delta: { type: "number" }, reason: { type: "string" }, dispute_id: { type: "string" } }, required: ["user_id", "score_delta", "reason"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }
  if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for dispute-mcp.");

  if (tool === "file_dispute") {
    const orderId = String(args.order_id ?? "");
    const filedBy = String(args._user_id ?? args.filed_by ?? "");
    const againstUserId = String(args.against_user_id ?? "");
    const disputeType = String(args.dispute_type ?? "");
    const description = String(args.description ?? "");
    if (!orderId || !filedBy || !againstUserId || !disputeType || !description) return fail("VALIDATION_ERROR", "order_id, against_user_id, dispute_type, description are required.");
    if (filedBy === againstUserId) return fail("VALIDATION_ERROR", "Cannot file a dispute against yourself.");

    const disputeId = generateId();
    const insertResult = await supabase.schema("dispute_mcp").from("disputes").insert({
      dispute_id: disputeId,
      order_id: orderId,
      filed_by: filedBy,
      against_user_id: againstUserId,
      dispute_type: disputeType,
      description,
      escrow_id: args.escrow_id ? String(args.escrow_id) : null,
      status: "open",
      resolution_tier: "mediation",
      created_at: now(),
      updated_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("dispute.dispute.created", { dispute_id: disputeId, order_id: orderId, filed_by: filedBy, dispute_type: disputeType });
    return { content: [{ type: "text", text: ok({ dispute_id: disputeId, status: "open", resolution_tier: "mediation" }) }] };
  }

  if (tool === "submit_evidence") {
    const disputeId = String(args.dispute_id ?? "");
    const submittedBy = String(args.submitted_by ?? "");
    const evidenceType = String(args.evidence_type ?? "");
    if (!disputeId || !submittedBy || !evidenceType) return fail("VALIDATION_ERROR", "dispute_id, submitted_by, evidence_type are required.");

    const evidenceId = generateId();
    const insertResult = await supabase.schema("dispute_mcp").from("evidence").insert({
      evidence_id: evidenceId,
      dispute_id: disputeId,
      submitted_by: submittedBy,
      evidence_type: evidenceType,
      file_url: args.file_url ? String(args.file_url) : null,
      description: args.description ? String(args.description) : null,
      submitted_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("dispute.evidence.submitted", { dispute_id: disputeId, evidence_id: evidenceId });
    return { content: [{ type: "text", text: ok({ evidence_id: evidenceId, dispute_id: disputeId }) }] };
  }

  if (tool === "propose_settlement") {
    const disputeId = String(args.dispute_id ?? "");
    const proposedBy = String(args.proposed_by ?? "");
    const settlementType = String(args.settlement_type ?? "");
    if (!disputeId || !proposedBy || !settlementType) return fail("VALIDATION_ERROR", "dispute_id, proposed_by, settlement_type are required.");

    const proposalId = generateId();
    const insertResult = await supabase.schema("dispute_mcp").from("settlement_proposals").insert({
      proposal_id: proposalId,
      dispute_id: disputeId,
      proposed_by: proposedBy,
      settlement_type: settlementType,
      amount: typeof args.amount === "number" ? Number(args.amount) : null,
      description: args.description ? String(args.description) : null,
      status: "proposed",
      created_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("dispute.settlement.proposed", { dispute_id: disputeId, proposal_id: proposalId });
    return { content: [{ type: "text", text: ok({ proposal_id: proposalId, dispute_id: disputeId, status: "proposed" }) }] };
  }

  if (tool === "escalate_dispute") {
    const disputeId = String(args.dispute_id ?? "");
    const escalatedBy = String(args._user_id ?? args.escalated_by ?? "");
    const reason = String(args.reason ?? "");
    const VALID_TIERS = ["mediation", "arbitration", "legal"] as const;
    const nextTier = String(args.next_tier ?? "arbitration");
    if (!VALID_TIERS.includes(nextTier as typeof VALID_TIERS[number])) {
      return fail("VALIDATION_ERROR", `next_tier must be one of: ${VALID_TIERS.join(", ")}`);
    }
    if (!disputeId || !escalatedBy || !reason) return fail("VALIDATION_ERROR", "dispute_id, escalated_by, reason are required.");

    const resolutionDeadline = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const updateResult = await supabase.schema("dispute_mcp").from("disputes")
      .update({ resolution_tier: nextTier, escalated_by: escalatedBy, escalation_reason: reason, resolution_deadline: resolutionDeadline, updated_at: now() })
      .eq("dispute_id", disputeId)
      .eq("status", "open");
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("dispute.dispute.escalated", { dispute_id: disputeId, escalated_by: escalatedBy, reason, resolution_tier: nextTier, resolution_deadline: resolutionDeadline });
    return { content: [{ type: "text", text: ok({ dispute_id: disputeId, resolution_tier: nextTier, resolution_deadline: resolutionDeadline }) }] };
  }

  if (tool === "resolve_dispute") {
    const disputeId = String(args.dispute_id ?? "");
    const resolvedBy = String(args.resolved_by ?? "");
    const resolution = String(args.resolution ?? "");
    const resolutionType = String(args.resolution_type ?? "");
    if (!disputeId || !resolvedBy || !resolution || !resolutionType) return fail("VALIDATION_ERROR", "dispute_id, resolved_by, resolution, resolution_type are required.");

    const updateResult = await supabase.schema("dispute_mcp").from("disputes")
      .update({ status: "resolved", resolved_by: resolvedBy, resolution, resolution_type: resolutionType, resolved_at: now(), updated_at: now() })
      .eq("dispute_id", disputeId);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");

    if (typeof args.penalty_amount === "number" && args.penalty_user_id) {
      const penaltyId = generateId();
      await supabase.schema("dispute_mcp").from("penalties").insert({
        penalty_id: penaltyId,
        dispute_id: disputeId,
        user_id: String(args.penalty_user_id),
        amount: Number(args.penalty_amount),
        reason: resolution,
        created_at: now(),
      });
      await emitEvent("dispute.penalty.applied", { dispute_id: disputeId, penalty_id: penaltyId, user_id: String(args.penalty_user_id), amount: Number(args.penalty_amount) });
    }

    await emitEvent("dispute.dispute.resolved", { dispute_id: disputeId, resolution_type: resolutionType });
    return { content: [{ type: "text", text: ok({ dispute_id: disputeId, status: "resolved", resolution_type: resolutionType }) }] };
  }

  if (tool === "get_dispute") {
    const disputeId = String(args.dispute_id ?? "");
    if (!disputeId) return fail("VALIDATION_ERROR", "dispute_id is required.");

    const disputeResult = await supabase.schema("dispute_mcp").from("disputes").select("*").eq("dispute_id", disputeId).maybeSingle();
    if (disputeResult.error) return fail("DB_ERROR", "Database operation failed");
    if (!disputeResult.data) return fail("NOT_FOUND", "Dispute not found.");

    const evidenceResult = await supabase.schema("dispute_mcp").from("evidence").select("*").eq("dispute_id", disputeId).order("submitted_at", { ascending: true });
    const proposalsResult = await supabase.schema("dispute_mcp").from("settlement_proposals").select("*").eq("dispute_id", disputeId).order("created_at", { ascending: false });

    return { content: [{ type: "text", text: ok({ dispute: disputeResult.data, evidence: evidenceResult.data ?? [], settlement_proposals: proposalsResult.data ?? [] }) }] };
  }

  if (tool === "update_pis") {
    const userId = String(args.user_id ?? "");
    const scoreDelta = Number(args.score_delta ?? 0);
    const reason = String(args.reason ?? "");
    if (!userId || scoreDelta === 0 || !reason) return fail("VALIDATION_ERROR", "user_id, score_delta (non-zero), reason are required.");

    const existing = await supabase.schema("dispute_mcp").from("platform_integrity_scores").select("*").eq("user_id", userId).maybeSingle();
    const currentScore = existing.data ? Number((existing.data as Record<string, unknown>).score ?? 100) : 100;
    const previousTier = String((existing.data as Record<string, unknown> | null)?.tier ?? "excellent");
    const newScore = Math.max(0, Math.min(100, currentScore + scoreDelta));

    let tier: string;
    if (newScore >= 90) tier = "excellent";
    else if (newScore >= 70) tier = "good";
    else if (newScore >= 50) tier = "fair";
    else if (newScore >= 25) tier = "poor";
    else tier = "critical";

    const upsertResult = await supabase.schema("dispute_mcp").from("platform_integrity_scores").upsert({
      user_id: userId,
      score: newScore,
      tier,
      last_reason: reason,
      dispute_id: args.dispute_id ? String(args.dispute_id) : null,
      updated_at: now(),
    }, { onConflict: "user_id" });
    if (upsertResult.error) return fail("DB_ERROR", "Database operation failed");

    if (tier === "critical" && previousTier !== "critical") {
      await emitEvent("dispute.pis.critical", { user_id: userId, score: newScore, reason });
    }

    return { content: [{ type: "text", text: ok({ user_id: userId, previous_score: currentScore, new_score: newScore, tier }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("dispute", Number(process.env.MCP_HTTP_PORT ?? 4115));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
