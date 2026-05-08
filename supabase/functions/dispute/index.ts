// Dispute domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/dispute-mcp/src/index.ts.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "dispute-edge";

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function fileDispute({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const orderId = String(args.order_id ?? "");
  const filedBy = String(args.filed_by ?? caller.userId);
  const againstUserId = String(args.against_user_id ?? "");
  const disputeType = String(args.dispute_type ?? "");
  const description = String(args.description ?? "");
  if (!orderId || !filedBy || !againstUserId || !disputeType || !description) {
    return failEnvelope("VALIDATION_ERROR", "order_id, against_user_id, dispute_type, description are required.");
  }
  if (filedBy === againstUserId) return failEnvelope("VALIDATION_ERROR", "Cannot file a dispute against yourself.");
  const disputeId = generateId();
  const ts = now();
  const { error } = await supabase.schema("dispute_mcp").from("disputes").insert({
    dispute_id: disputeId, order_id: orderId, filed_by: filedBy, against_user_id: againstUserId,
    dispute_type: disputeType, description,
    escrow_id: args.escrow_id ? String(args.escrow_id) : null,
    status: "open", resolution_tier: "mediation",
    created_at: ts, updated_at: ts,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "dispute.dispute.created", {
    dispute_id: disputeId, order_id: orderId, filed_by: filedBy, dispute_type: disputeType,
  });
  return okEnvelope({ dispute_id: disputeId, status: "open", resolution_tier: "mediation" });
}

async function submitEvidence({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const disputeId = String(args.dispute_id ?? "");
  const submittedBy = String(args.submitted_by ?? caller.userId);
  const evidenceType = String(args.evidence_type ?? "");
  if (!disputeId || !submittedBy || !evidenceType) {
    return failEnvelope("VALIDATION_ERROR", "dispute_id, submitted_by, evidence_type are required.");
  }
  const evidenceId = generateId();
  const { error } = await supabase.schema("dispute_mcp").from("evidence").insert({
    evidence_id: evidenceId, dispute_id: disputeId, submitted_by: submittedBy,
    evidence_type: evidenceType,
    file_url: args.file_url ? String(args.file_url) : null,
    description: args.description ? String(args.description) : null,
    submitted_at: now(),
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "dispute.evidence.submitted", { dispute_id: disputeId, evidence_id: evidenceId });
  return okEnvelope({ evidence_id: evidenceId, dispute_id: disputeId });
}

async function proposeSettlement({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const disputeId = String(args.dispute_id ?? "");
  const proposedBy = String(args.proposed_by ?? caller.userId);
  const settlementType = String(args.settlement_type ?? "");
  if (!disputeId || !proposedBy || !settlementType) {
    return failEnvelope("VALIDATION_ERROR", "dispute_id, proposed_by, settlement_type are required.");
  }
  const proposalId = generateId();
  const { error } = await supabase.schema("dispute_mcp").from("settlement_proposals").insert({
    proposal_id: proposalId, dispute_id: disputeId, proposed_by: proposedBy,
    settlement_type: settlementType,
    amount: typeof args.amount === "number" ? Number(args.amount) : null,
    description: args.description ? String(args.description) : null,
    status: "proposed", created_at: now(),
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "dispute.settlement.proposed", { dispute_id: disputeId, proposal_id: proposalId });
  return okEnvelope({ proposal_id: proposalId, dispute_id: disputeId, status: "proposed" });
}

async function escalateDispute({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const disputeId = String(args.dispute_id ?? "");
  const escalatedBy = String(args.escalated_by ?? caller.userId);
  const reason = String(args.reason ?? "");
  const VALID_TIERS = ["mediation", "arbitration", "legal"];
  const nextTier = String(args.next_tier ?? "arbitration");
  if (!VALID_TIERS.includes(nextTier)) return failEnvelope("VALIDATION_ERROR", `next_tier must be one of: ${VALID_TIERS.join(", ")}`);
  if (!disputeId || !escalatedBy || !reason) return failEnvelope("VALIDATION_ERROR", "dispute_id, escalated_by, reason are required.");
  const resolutionDeadline = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  const { error } = await supabase.schema("dispute_mcp").from("disputes")
    .update({
      resolution_tier: nextTier, escalated_by: escalatedBy, escalation_reason: reason,
      resolution_deadline: resolutionDeadline, updated_at: now(),
    })
    .eq("dispute_id", disputeId).eq("status", "open");
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "dispute.dispute.escalated", {
    dispute_id: disputeId, escalated_by: escalatedBy, reason,
    resolution_tier: nextTier, resolution_deadline: resolutionDeadline,
  });
  return okEnvelope({ dispute_id: disputeId, resolution_tier: nextTier, resolution_deadline: resolutionDeadline });
}

async function resolveDispute({ args }: ToolRequest) {
  const supabase = serviceClient();
  const disputeId = String(args.dispute_id ?? "");
  const resolvedBy = String(args.resolved_by ?? "");
  const resolution = String(args.resolution ?? "");
  const resolutionType = String(args.resolution_type ?? "");
  if (!disputeId || !resolvedBy || !resolution || !resolutionType) {
    return failEnvelope("VALIDATION_ERROR", "dispute_id, resolved_by, resolution, resolution_type are required.");
  }
  const ts = now();
  const { error } = await supabase.schema("dispute_mcp").from("disputes")
    .update({
      status: "resolved", resolved_by: resolvedBy, resolution,
      resolution_type: resolutionType, resolved_at: ts, updated_at: ts,
    })
    .eq("dispute_id", disputeId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (typeof args.penalty_amount === "number" && args.penalty_user_id) {
    const penaltyId = generateId();
    await supabase.schema("dispute_mcp").from("penalties").insert({
      penalty_id: penaltyId, dispute_id: disputeId,
      user_id: String(args.penalty_user_id), amount: Number(args.penalty_amount),
      reason: resolution, created_at: now(),
    });
    await emitEvent(supabase, SOURCE, "dispute.penalty.applied", {
      dispute_id: disputeId, penalty_id: penaltyId,
      user_id: String(args.penalty_user_id), amount: Number(args.penalty_amount),
    });
  }
  await emitEvent(supabase, SOURCE, "dispute.dispute.resolved", { dispute_id: disputeId, resolution_type: resolutionType });
  return okEnvelope({ dispute_id: disputeId, status: "resolved", resolution_type: resolutionType });
}

async function getDispute({ args }: ToolRequest) {
  const supabase = serviceClient();
  const disputeId = String(args.dispute_id ?? "");
  if (!disputeId) return failEnvelope("VALIDATION_ERROR", "dispute_id is required.");
  const dispute = await supabase.schema("dispute_mcp").from("disputes").select("*").eq("dispute_id", disputeId).maybeSingle();
  if (dispute.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!dispute.data) return failEnvelope("NOT_FOUND", "Dispute not found.");
  const evidence = await supabase.schema("dispute_mcp").from("evidence")
    .select("*").eq("dispute_id", disputeId).order("submitted_at", { ascending: true });
  const proposals = await supabase.schema("dispute_mcp").from("settlement_proposals")
    .select("*").eq("dispute_id", disputeId).order("created_at", { ascending: false });
  return okEnvelope({ dispute: dispute.data, evidence: evidence.data ?? [], settlement_proposals: proposals.data ?? [] });
}

async function updatePis({ args }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? "");
  const scoreDelta = Number(args.score_delta ?? 0);
  const reason = String(args.reason ?? "");
  if (!userId || scoreDelta === 0 || !reason) {
    return failEnvelope("VALIDATION_ERROR", "user_id, score_delta (non-zero), reason are required.");
  }
  const existing = await supabase.schema("dispute_mcp").from("platform_integrity_scores")
    .select("*").eq("user_id", userId).maybeSingle();
  const currentScore = existing.data ? Number((existing.data as Record<string, unknown>).score ?? 100) : 100;
  const previousTier = String((existing.data as Record<string, unknown> | null)?.tier ?? "excellent");
  const newScore = Math.max(0, Math.min(100, currentScore + scoreDelta));
  let tier: string;
  if (newScore >= 90) tier = "excellent";
  else if (newScore >= 70) tier = "good";
  else if (newScore >= 50) tier = "fair";
  else if (newScore >= 25) tier = "poor";
  else tier = "critical";
  const { error } = await supabase.schema("dispute_mcp").from("platform_integrity_scores").upsert({
    user_id: userId, score: newScore, tier, last_reason: reason,
    dispute_id: args.dispute_id ? String(args.dispute_id) : null,
    updated_at: now(),
  }, { onConflict: "user_id" });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (tier === "critical" && previousTier !== "critical") {
    await emitEvent(supabase, SOURCE, "dispute.pis.critical", { user_id: userId, score: newScore, reason });
  }
  return okEnvelope({ user_id: userId, previous_score: currentScore, new_score: newScore, tier });
}

Deno.serve(serveDomain({
  ping,
  file_dispute: fileDispute,
  submit_evidence: submitEvidence,
  propose_settlement: proposeSettlement,
  escalate_dispute: escalateDispute,
  resolve_dispute: resolveDispute,
  get_dispute: getDispute,
  update_pis: updatePis,
}));
