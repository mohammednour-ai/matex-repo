import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "equifax-bridge";
const SERVER_VERSION = "0.1.0";

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "check_business_credit", description: "Get simulated Equifax business credit report (bridge stub)", inputSchema: { type: "object", properties: { business_name: { type: "string" }, business_number: { type: "string", description: "CRA Business Number" } }, required: ["business_name"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: JSON.stringify({ success: true, status: "ok", server: SERVER_NAME, version: SERVER_VERSION }) }] };
  }

  if (tool === "check_business_credit") {
    const businessName = String(args.business_name ?? "");
    const businessNumber = args.business_number ? String(args.business_number) : null;
    if (!businessName) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "VALIDATION_ERROR", message: "business_name is required." } }) }],
      };
    }

    const score = Math.floor(Math.random() * 551) + 300;
    const tradeLines = Math.floor(Math.random() * 20) + 1;
    const derogatoryCount = Math.floor(Math.random() * 3);
    const yearsInBusiness = Math.floor(Math.random() * 30) + 1;

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          data: {
            business_name: businessName,
            business_number: businessNumber,
            score,
            risk_class: score >= 700 ? "low" : score >= 500 ? "medium" : "high",
            trade_lines: tradeLines,
            derogatory_count: derogatoryCount,
            years_in_business: yearsInBusiness,
            payment_index: Math.floor(Math.random() * 41) + 60,
            source: "equifax-bridge-stub",
            report_date: new Date().toISOString().slice(0, 10),
          },
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
