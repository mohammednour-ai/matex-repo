import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "onfido-bridge";
const SERVER_VERSION = "0.1.0";

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "create_applicant", description: "Create Onfido applicant (bridge stub)", inputSchema: { type: "object", properties: { user_id: { type: "string" }, first_name: { type: "string" }, last_name: { type: "string" }, email: { type: "string" } }, required: ["user_id", "first_name", "last_name"] } },
    { name: "submit_check", description: "Submit KYC check request (bridge stub)", inputSchema: { type: "object", properties: { applicant_id: { type: "string" }, report_names: { type: "array" } }, required: ["applicant_id"] } },
    { name: "get_check_status", description: "Get check status (bridge stub)", inputSchema: { type: "object", properties: { check_id: { type: "string" } }, required: ["check_id"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: JSON.stringify({ success: true, status: "ok", server: SERVER_NAME, version: SERVER_VERSION }) }] };
  }

  if (tool === "create_applicant") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            applicant_id: `onfido_app_${Date.now()}`,
            user_id: String(args.user_id ?? ""),
            provider: "onfido-bridge-stub",
          }),
        },
      ],
    };
  }

  if (tool === "submit_check") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            check_id: `onfido_chk_${Date.now()}`,
            applicant_id: String(args.applicant_id ?? ""),
            status: "in_progress",
          }),
        },
      ],
    };
  }

  if (tool === "get_check_status") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            check_id: String(args.check_id ?? ""),
            status: "complete",
            result: "clear",
          }),
        },
      ],
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
