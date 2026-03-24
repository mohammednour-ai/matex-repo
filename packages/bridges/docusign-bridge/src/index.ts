import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "docusign-bridge";
const SERVER_VERSION = "0.1.0";

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "create_envelope", description: "Create a DocuSign envelope with documents (stub)", inputSchema: { type: "object", properties: { document_name: { type: "string" }, document_url: { type: "string" }, signers: { type: "array", items: { type: "object" } }, subject: { type: "string" }, message: { type: "string" } }, required: ["document_name", "signers"] } },
    { name: "send_for_signature", description: "Send an envelope for signing (stub)", inputSchema: { type: "object", properties: { envelope_id: { type: "string" } }, required: ["envelope_id"] } },
    { name: "get_envelope_status", description: "Get envelope signing status (stub)", inputSchema: { type: "object", properties: { envelope_id: { type: "string" } }, required: ["envelope_id"] } },
    { name: "download_signed", description: "Download signed document (stub)", inputSchema: { type: "object", properties: { envelope_id: { type: "string" } }, required: ["envelope_id"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: JSON.stringify({ success: true, status: "ok", server: SERVER_NAME, version: SERVER_VERSION }) }] };
  }

  if (tool === "create_envelope") {
    const documentName = String(args.document_name ?? "");
    const signers = args.signers as Array<Record<string, unknown>> | undefined;
    if (!documentName || !signers || signers.length === 0) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "document_name and signers (non-empty) are required." } }) }] };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          envelope_id: `env_${Date.now()}`,
          document_name: documentName,
          signer_count: signers.length,
          status: "created",
        }),
      }],
    };
  }

  if (tool === "send_for_signature") {
    const envelopeId = String(args.envelope_id ?? "");
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          envelope_id: envelopeId,
          status: "sent",
          sent_at: new Date().toISOString(),
        }),
      }],
    };
  }

  if (tool === "get_envelope_status") {
    const envelopeId = String(args.envelope_id ?? "");
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          envelope_id: envelopeId,
          status: "completed",
          signers: [
            { email: "signer@example.com", status: "completed", signed_at: new Date().toISOString() },
          ],
          completed_at: new Date().toISOString(),
        }),
      }],
    };
  }

  if (tool === "download_signed") {
    const envelopeId = String(args.envelope_id ?? "");
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          envelope_id: envelopeId,
          download_url: `https://docusign.example.com/documents/${envelopeId}/signed.pdf`,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        }),
      }],
    };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
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
