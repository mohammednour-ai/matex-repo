import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "adobe-sign-bridge";
const SERVER_VERSION = "0.1.0";

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "create_agreement", description: "Create an Adobe Sign agreement (stub)", inputSchema: { type: "object", properties: { document_name: { type: "string" }, document_url: { type: "string" }, signers: { type: "array", items: { type: "object" } }, message: { type: "string" } }, required: ["document_name", "signers"] } },
    { name: "send_for_signature", description: "Send an agreement for signing (stub)", inputSchema: { type: "object", properties: { agreement_id: { type: "string" } }, required: ["agreement_id"] } },
    { name: "get_agreement_status", description: "Get agreement signing status (stub)", inputSchema: { type: "object", properties: { agreement_id: { type: "string" } }, required: ["agreement_id"] } },
    { name: "download_signed", description: "Download signed document (stub)", inputSchema: { type: "object", properties: { agreement_id: { type: "string" } }, required: ["agreement_id"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: JSON.stringify({ success: true, status: "ok", server: SERVER_NAME, version: SERVER_VERSION }) }] };
  }

  if (tool === "create_agreement") {
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
          agreement_id: `agr_${Date.now()}`,
          document_name: documentName,
          signer_count: signers.length,
          status: "created",
        }),
      }],
    };
  }

  if (tool === "send_for_signature") {
    const agreementId = String(args.agreement_id ?? "");
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          agreement_id: agreementId,
          status: "sent",
          sent_at: new Date().toISOString(),
        }),
      }],
    };
  }

  if (tool === "get_agreement_status") {
    const agreementId = String(args.agreement_id ?? "");
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          agreement_id: agreementId,
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
    const agreementId = String(args.agreement_id ?? "");
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          agreement_id: agreementId,
          download_url: `https://adobesign.example.com/documents/${agreementId}/signed.pdf`,
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
