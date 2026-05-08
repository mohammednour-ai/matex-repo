// eSign domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/esign-mcp/src/index.ts.
// Note: provider envelope orchestration (DocuSign etc.) is owned by the
// caller — this function only stamps records. Document generation that
// could exceed the 150s edge cap is intentionally NOT here.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "esign-edge";

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function createDocument({ args }: ToolRequest) {
  const supabase = serviceClient();
  const templateType = String(args.template_type ?? "");
  const signatories = args.signatories as Array<Record<string, unknown>> | undefined;
  if (!templateType || !signatories || signatories.length === 0) {
    return failEnvelope("VALIDATION_ERROR", "template_type and signatories (non-empty) are required.");
  }
  const documentId = generateId();
  const ts = now();
  const { error } = await supabase.schema("esign_mcp").from("documents").insert({
    document_id: documentId, template_type: templateType,
    order_id: args.order_id ? String(args.order_id) : null,
    contract_id: args.contract_id ? String(args.contract_id) : null,
    generated_data: args.generated_data ?? {},
    signatories: signatories.map((s) => ({ ...s, status: "pending" })),
    provider: String(args.provider ?? "docusign"),
    status: "draft", created_at: ts, updated_at: ts,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "esign.document.created", { document_id: documentId, template_type: templateType });
  return okEnvelope({ document_id: documentId, status: "draft", template_type: templateType });
}

async function sendForSigning({ args }: ToolRequest) {
  const supabase = serviceClient();
  const documentId = String(args.document_id ?? "");
  const providerEnvelopeId = String(args.provider_envelope_id ?? "");
  if (!documentId || !providerEnvelopeId) return failEnvelope("VALIDATION_ERROR", "document_id and provider_envelope_id are required.");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.schema("esign_mcp").from("documents")
    .update({
      status: "sent", provider_envelope_id: providerEnvelopeId,
      expires_at: expiresAt, updated_at: now(),
    })
    .eq("document_id", documentId).eq("status", "draft");
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "esign.document.sent", { document_id: documentId, provider_envelope_id: providerEnvelopeId });
  return okEnvelope({ document_id: documentId, status: "sent", expires_at: expiresAt });
}

async function recordSignature({ args }: ToolRequest) {
  const supabase = serviceClient();
  const documentId = String(args.document_id ?? "");
  const signatoryEmail = String(args.signatory_email ?? "");
  if (!documentId || !signatoryEmail) return failEnvelope("VALIDATION_ERROR", "document_id and signatory_email are required.");
  const docResult = await supabase.schema("esign_mcp").from("documents").select("*").eq("document_id", documentId).maybeSingle();
  if (docResult.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!docResult.data) return failEnvelope("NOT_FOUND", "Document not found.");
  const doc = docResult.data as Record<string, unknown>;
  const signatories = (doc.signatories as Array<Record<string, unknown>>) ?? [];
  const signedAt = now();
  const lastSignedHash = signatories
    .filter((s) => s.status === "signed")
    .reduce<string>((h, s) => String(s.signature_hash ?? h), String(doc.document_hash ?? "genesis"));
  let found = false;
  const updatedSignatories: Array<Record<string, unknown>> = [];
  for (const s of signatories) {
    if (String(s.email) === signatoryEmail && s.status !== "signed") {
      found = true;
      const sigHash = await sha256Hex(`${lastSignedHash}:${signatoryEmail}:${signedAt}:${documentId}`);
      updatedSignatories.push({ ...s, status: "signed", signed_at: signedAt, prev_hash: lastSignedHash, signature_hash: sigHash });
    } else {
      updatedSignatories.push(s);
    }
  }
  if (!found) return failEnvelope("NOT_FOUND", "Signatory not found or already signed.");
  const allSigned = updatedSignatories.every((s) => s.status === "signed");
  const update: Record<string, unknown> = { signatories: updatedSignatories, updated_at: signedAt };
  if (allSigned) {
    update.status = "signed";
    update.completed_at = signedAt;
    if (args.document_hash) update.document_hash = String(args.document_hash);
  }
  const upd = await supabase.schema("esign_mcp").from("documents").update(update).eq("document_id", documentId);
  if (upd.error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (allSigned) await emitEvent(supabase, SOURCE, "esign.document.signed", { document_id: documentId });
  return okEnvelope({
    document_id: documentId, signatory_email: signatoryEmail,
    all_signed: allSigned, status: allSigned ? "signed" : doc.status,
  });
}

async function getDocument({ args }: ToolRequest) {
  const supabase = serviceClient();
  const documentId = String(args.document_id ?? "");
  if (!documentId) return failEnvelope("VALIDATION_ERROR", "document_id is required.");
  const { data, error } = await supabase.schema("esign_mcp").from("documents").select("*").eq("document_id", documentId).maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!data) return failEnvelope("NOT_FOUND", "Document not found.");
  return okEnvelope({ document: data });
}

async function voidDocument({ args }: ToolRequest) {
  const supabase = serviceClient();
  const documentId = String(args.document_id ?? "");
  if (!documentId) return failEnvelope("VALIDATION_ERROR", "document_id is required.");
  const { error } = await supabase.schema("esign_mcp").from("documents")
    .update({ status: "voided", updated_at: now() }).eq("document_id", documentId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "esign.document.voided", { document_id: documentId });
  return okEnvelope({ document_id: documentId, status: "voided" });
}

async function verifyHash({ args }: ToolRequest) {
  const supabase = serviceClient();
  const documentId = String(args.document_id ?? "");
  const hash = String(args.hash ?? "");
  if (!documentId || !hash) return failEnvelope("VALIDATION_ERROR", "document_id and hash are required.");
  const { data, error } = await supabase.schema("esign_mcp").from("documents")
    .select("document_hash").eq("document_id", documentId).maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!data) return failEnvelope("NOT_FOUND", "Document not found.");
  const storedHash = String((data as Record<string, unknown>).document_hash ?? "");
  return okEnvelope({ document_id: documentId, valid: storedHash === hash, stored_hash_exists: !!storedHash });
}

Deno.serve(serveDomain({
  ping,
  create_document: createDocument,
  send_for_signing: sendForSigning,
  record_signature: recordSignature,
  get_document: getDocument,
  void_document: voidDocument,
  verify_hash: verifyHash,
}));
