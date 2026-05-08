// KYC domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/kyc-mcp/src/index.ts.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "kyc-edge";

function levelRank(level: string): number {
  const map: Record<string, number> = { level_0: 0, level_1: 1, level_2: 2, level_3: 3 };
  return map[level] ?? 0;
}

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function startVerification({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  const targetLevel = String(args.target_level ?? "");
  if (!userId || !targetLevel) return failEnvelope("VALIDATION_ERROR", "user_id and target_level are required.");
  const verificationId = generateId();
  const { error } = await supabase.schema("kyc_mcp").from("verifications").insert({
    verification_id: verificationId, user_id: userId,
    target_level: targetLevel, current_status: "pending", submitted_at: now(),
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "kyc.verification.started", {
    verification_id: verificationId, user_id: userId, target_level: targetLevel,
  });
  return okEnvelope({ verification_id: verificationId, status: "pending" });
}

async function submitDocument({ args }: ToolRequest) {
  const supabase = serviceClient();
  const verificationId = String(args.verification_id ?? "");
  const userId = String(args.user_id ?? "");
  const docType = String(args.doc_type ?? "");
  const fileUrl = String(args.file_url ?? "");
  const fileHash = String(args.file_hash ?? "");
  if (!verificationId || !userId || !docType || !fileUrl || !fileHash) {
    return failEnvelope("VALIDATION_ERROR", "verification_id, user_id, doc_type, file_url, file_hash are required.");
  }
  const documentId = generateId();
  const { error } = await supabase.schema("kyc_mcp").from("documents").insert({
    document_id: documentId, verification_id: verificationId, user_id: userId,
    doc_type: docType, file_url: fileUrl, file_hash: fileHash,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "kyc.document.submitted", {
    verification_id: verificationId, document_id: documentId, user_id: userId,
  });
  return okEnvelope({ document_id: documentId });
}

async function reviewVerification({ args }: ToolRequest) {
  const supabase = serviceClient();
  const verificationId = String(args.verification_id ?? "");
  const status = String(args.status ?? "");
  if (!verificationId || !status) return failEnvelope("VALIDATION_ERROR", "verification_id and status are required.");
  const review: Record<string, unknown> = {
    current_status: status, reviewed_at: now(),
    reviewer_id: args.reviewer_id ? String(args.reviewer_id) : null,
    reviewer_notes: args.reviewer_notes ? String(args.reviewer_notes) : null,
    verified_at: status === "verified" ? now() : null,
  };
  const update = await supabase.schema("kyc_mcp").from("verifications")
    .update(review).eq("verification_id", verificationId)
    .select("user_id,target_level").maybeSingle();
  if (update.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!update.data) return failEnvelope("NOT_FOUND", "verification_id not found");
  if (status === "verified") {
    const userId = update.data.user_id as string;
    const targetLevel = update.data.target_level as string;
    const current = await supabase.schema("kyc_mcp").from("kyc_levels")
      .select("current_level").eq("user_id", userId).maybeSingle();
    if (current.error) return failEnvelope("DB_ERROR", "Database operation failed");
    const currentLevel = String(current.data?.current_level ?? "level_0");
    if (levelRank(targetLevel) < levelRank(currentLevel)) {
      return failEnvelope("KYC_DOWNGRADE_FORBIDDEN", `Cannot lower KYC level from ${currentLevel} to ${targetLevel}.`);
    }
    const upsert: Record<string, unknown> = { user_id: userId, current_level: targetLevel, updated_at: now() };
    if (targetLevel === "level_0") upsert.level_0_at = now();
    if (targetLevel === "level_1") upsert.level_1_at = now();
    if (targetLevel === "level_2") upsert.level_2_at = now();
    if (targetLevel === "level_3") upsert.level_3_at = now();
    const lvl = await supabase.schema("kyc_mcp").from("kyc_levels").upsert(upsert, { onConflict: "user_id" });
    if (lvl.error) return failEnvelope("DB_ERROR", "Database operation failed");
  }
  await emitEvent(supabase, SOURCE, "kyc.verification.reviewed", { verification_id: verificationId, status });
  return okEnvelope({ verification_id: verificationId, status });
}

async function getKycLevel({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const { data, error } = await supabase.schema("kyc_mcp").from("kyc_levels")
    .select("current_level,updated_at").eq("user_id", userId).maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({
    user_id: userId,
    current_level: data?.current_level ?? "level_0",
    updated_at: data?.updated_at ?? null,
  });
}

async function assertKycGate({ args }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? "");
  const requiredLevel = String(args.required_level ?? "");
  if (!userId || !requiredLevel) return failEnvelope("VALIDATION_ERROR", "user_id and required_level are required.");
  const { data, error } = await supabase.schema("kyc_mcp").from("kyc_levels")
    .select("current_level").eq("user_id", userId).maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  const currentLevel = String(data?.current_level ?? "level_0");
  if (levelRank(currentLevel) < levelRank(requiredLevel)) {
    return failEnvelope("KYC_GATE_BLOCKED", `Required ${requiredLevel}, current ${currentLevel} for context '${String(args.context ?? "unknown")}'.`);
  }
  return okEnvelope({ user_id: userId, current_level: currentLevel, required_level: requiredLevel, allowed: true });
}

async function checkKycExpiry({ args }: ToolRequest) {
  const supabase = serviceClient();
  const limit = Math.min(Number(args.limit ?? 50), 200);
  const ts = now();
  const { data, error } = await supabase.schema("kyc_mcp").from("kyc_levels")
    .select("user_id,current_level,next_review_at")
    .lt("next_review_at", ts).limit(limit);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  const flagged: string[] = [];
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const userId = String(r.user_id);
    const upd = await supabase.schema("kyc_mcp").from("kyc_levels")
      .update({ kyc_status: "review_required", updated_at: ts }).eq("user_id", userId);
    if (!upd.error) {
      flagged.push(userId);
      await emitEvent(supabase, SOURCE, "kyc.expiry.flagged", {
        user_id: userId, current_level: r.current_level, next_review_at: r.next_review_at,
      });
    }
  }
  return okEnvelope({ flagged_count: flagged.length, flagged_user_ids: flagged });
}

Deno.serve(serveDomain({
  ping,
  start_verification: startVerification,
  submit_document: submitDocument,
  review_verification: reviewVerification,
  get_kyc_level: getKycLevel,
  assert_kyc_gate: assertKycGate,
  check_kyc_expiry: checkKycExpiry,
}));
