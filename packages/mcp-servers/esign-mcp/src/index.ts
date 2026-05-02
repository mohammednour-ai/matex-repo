import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now, sha256 , initSentry} from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "esign-mcp";
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
    { name: "create_document", description: "Create an eSign document record", inputSchema: { type: "object", properties: { template_type: { type: "string" }, order_id: { type: "string" }, contract_id: { type: "string" }, generated_data: { type: "object" }, signatories: { type: "array", items: { type: "object" } }, provider: { type: "string" } }, required: ["template_type", "signatories"] } },
    { name: "send_for_signing", description: "Send document for signing via provider", inputSchema: { type: "object", properties: { document_id: { type: "string" }, provider_envelope_id: { type: "string" } }, required: ["document_id", "provider_envelope_id"] } },
    { name: "record_signature", description: "Record a signatory signature and update document status", inputSchema: { type: "object", properties: { document_id: { type: "string" }, signatory_email: { type: "string" }, document_hash: { type: "string" } }, required: ["document_id", "signatory_email"] } },
    { name: "get_document", description: "Get eSign document by ID", inputSchema: { type: "object", properties: { document_id: { type: "string" } }, required: ["document_id"] } },
    { name: "void_document", description: "Void an eSign document", inputSchema: { type: "object", properties: { document_id: { type: "string" } }, required: ["document_id"] } },
    { name: "verify_hash", description: "Verify document hash against stored hash", inputSchema: { type: "object", properties: { document_id: { type: "string" }, hash: { type: "string" } }, required: ["document_id", "hash"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }
  if (!supabase) return fail("CONFIG_ERROR", "Supabase service role is required for esign-mcp.");

  if (tool === "create_document") {
    const templateType = String(args.template_type ?? "");
    const signatories = args.signatories as Array<Record<string, unknown>> | undefined;
    if (!templateType || !signatories || signatories.length === 0) {
      return fail("VALIDATION_ERROR", "template_type and signatories (non-empty) are required.");
    }

    const documentId = generateId();
    const insertResult = await supabase.schema("esign_mcp").from("documents").insert({
      document_id: documentId,
      template_type: templateType,
      order_id: args.order_id ? String(args.order_id) : null,
      contract_id: args.contract_id ? String(args.contract_id) : null,
      generated_data: args.generated_data ?? {},
      signatories: signatories.map((s) => ({ ...s, status: "pending" })),
      provider: String(args.provider ?? "docusign"),
      status: "draft",
      created_at: now(),
      updated_at: now(),
    });
    if (insertResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("esign.document.created", { document_id: documentId, template_type: templateType });
    return { content: [{ type: "text", text: ok({ document_id: documentId, status: "draft", template_type: templateType }) }] };
  }

  if (tool === "send_for_signing") {
    const documentId = String(args.document_id ?? "");
    const providerEnvelopeId = String(args.provider_envelope_id ?? "");
    if (!documentId || !providerEnvelopeId) return fail("VALIDATION_ERROR", "document_id and provider_envelope_id are required.");

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const updateResult = await supabase.schema("esign_mcp").from("documents")
      .update({ status: "sent", provider_envelope_id: providerEnvelopeId, expires_at: expiresAt, updated_at: now() })
      .eq("document_id", documentId)
      .eq("status", "draft");
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("esign.document.sent", { document_id: documentId, provider_envelope_id: providerEnvelopeId });
    return { content: [{ type: "text", text: ok({ document_id: documentId, status: "sent", expires_at: expiresAt }) }] };
  }

  if (tool === "record_signature") {
    const documentId = String(args.document_id ?? "");
    const signatoryEmail = String(args.signatory_email ?? "");
    if (!documentId || !signatoryEmail) return fail("VALIDATION_ERROR", "document_id and signatory_email are required.");

    const docResult = await supabase.schema("esign_mcp").from("documents").select("*").eq("document_id", documentId).maybeSingle();
    if (docResult.error) return fail("DB_ERROR", "Database operation failed");
    if (!docResult.data) return fail("NOT_FOUND", "Document not found.");

    const doc = docResult.data as Record<string, unknown>;
    const signatories = (doc.signatories as Array<Record<string, unknown>>) ?? [];
    let found = false;
    const signedAt = now();

    // Compute hash chain: each signature hashes (prev_hash + email + timestamp + document_id).
    const lastSignedHash = signatories
      .filter((s) => s.status === "signed")
      .reduce<string>((h, s) => String(s.signature_hash ?? h), String(doc.document_hash ?? "genesis"));

    const updatedSignatories = signatories.map((s) => {
      if (String(s.email) === signatoryEmail && s.status !== "signed") {
        found = true;
        const sigHash = sha256(`${lastSignedHash}:${signatoryEmail}:${signedAt}:${documentId}`);
        return { ...s, status: "signed", signed_at: signedAt, prev_hash: lastSignedHash, signature_hash: sigHash };
      }
      return s;
    });
    if (!found) return fail("NOT_FOUND", "Signatory not found or already signed.");

    const allSigned = updatedSignatories.every((s) => s.status === "signed");
    const updatePayload: Record<string, unknown> = { signatories: updatedSignatories, updated_at: signedAt };
    if (allSigned) {
      updatePayload.status = "signed";
      updatePayload.completed_at = signedAt;
      if (args.document_hash) updatePayload.document_hash = String(args.document_hash);
    }

    const updateResult = await supabase.schema("esign_mcp").from("documents").update(updatePayload).eq("document_id", documentId);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");

    if (allSigned) {
      await emitEvent("esign.document.signed", { document_id: documentId });
    }
    return { content: [{ type: "text", text: ok({ document_id: documentId, signatory_email: signatoryEmail, all_signed: allSigned, status: allSigned ? "signed" : doc.status }) }] };
  }

  if (tool === "get_document") {
    const documentId = String(args.document_id ?? "");
    if (!documentId) return fail("VALIDATION_ERROR", "document_id is required.");

    const docResult = await supabase.schema("esign_mcp").from("documents").select("*").eq("document_id", documentId).maybeSingle();
    if (docResult.error) return fail("DB_ERROR", "Database operation failed");
    if (!docResult.data) return fail("NOT_FOUND", "Document not found.");

    return { content: [{ type: "text", text: ok({ document: docResult.data }) }] };
  }

  if (tool === "void_document") {
    const documentId = String(args.document_id ?? "");
    if (!documentId) return fail("VALIDATION_ERROR", "document_id is required.");

    const updateResult = await supabase.schema("esign_mcp").from("documents")
      .update({ status: "voided", updated_at: now() })
      .eq("document_id", documentId);
    if (updateResult.error) return fail("DB_ERROR", "Database operation failed");

    await emitEvent("esign.document.voided", { document_id: documentId });
    return { content: [{ type: "text", text: ok({ document_id: documentId, status: "voided" }) }] };
  }

  if (tool === "verify_hash") {
    const documentId = String(args.document_id ?? "");
    const hash = String(args.hash ?? "");
    if (!documentId || !hash) return fail("VALIDATION_ERROR", "document_id and hash are required.");

    const docResult = await supabase.schema("esign_mcp").from("documents").select("document_hash").eq("document_id", documentId).maybeSingle();
    if (docResult.error) return fail("DB_ERROR", "Database operation failed");
    if (!docResult.data) return fail("NOT_FOUND", "Document not found.");

    const storedHash = String((docResult.data as Record<string, unknown>).document_hash ?? "");
    const valid = storedHash === hash;
    return { content: [{ type: "text", text: ok({ document_id: documentId, valid, stored_hash_exists: !!storedHash }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("esign", Number(process.env.MCP_HTTP_PORT ?? 4122));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
