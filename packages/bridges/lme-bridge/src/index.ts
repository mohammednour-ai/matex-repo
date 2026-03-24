import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "lme-bridge";
const SERVER_VERSION = "0.1.0";

const LME_BASE_PRICES: Record<string, number> = {
  copper: 8945.50,
  aluminum: 2312.75,
  zinc: 2645.00,
  nickel: 16280.00,
  lead: 2085.25,
  tin: 25430.00,
};

function simulatePrice(base: number): number {
  const variance = (Math.random() - 0.5) * 0.04;
  return Math.round((base * (1 + variance)) * 100) / 100;
}

function generateHistorical(base: number, days: number): Array<{ date: string; price: number }> {
  const result: Array<{ date: string; price: number }> = [];
  for (let i = days; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    result.push({ date, price: simulatePrice(base) });
  }
  return result;
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "get_lme_price", description: "Get simulated LME price for a metal (bridge stub)", inputSchema: { type: "object", properties: { metal: { type: "string", description: "copper, aluminum, zinc, nickel, lead, or tin" } }, required: ["metal"] } },
    { name: "get_historical", description: "Get simulated 30-day price history (bridge stub)", inputSchema: { type: "object", properties: { metal: { type: "string" }, days: { type: "number" } }, required: ["metal"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: JSON.stringify({ success: true, status: "ok", server: SERVER_NAME, version: SERVER_VERSION }) }] };
  }

  if (tool === "get_lme_price") {
    const metal = String(args.metal ?? "").toLowerCase();
    const basePrice = LME_BASE_PRICES[metal];
    if (!basePrice) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "UNKNOWN_METAL", message: `Unknown metal: ${metal}. Supported: ${Object.keys(LME_BASE_PRICES).join(", ")}` } }) }],
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          data: {
            metal,
            price: simulatePrice(basePrice),
            currency: "USD",
            unit: "per_tonne",
            source: "lme-bridge-stub",
            timestamp: new Date().toISOString(),
          },
        }),
      }],
    };
  }

  if (tool === "get_historical") {
    const metal = String(args.metal ?? "").toLowerCase();
    const days = Number(args.days ?? 30);
    const basePrice = LME_BASE_PRICES[metal];
    if (!basePrice) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "UNKNOWN_METAL", message: `Unknown metal: ${metal}. Supported: ${Object.keys(LME_BASE_PRICES).join(", ")}` } }) }],
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          data: {
            metal,
            currency: "USD",
            unit: "per_tonne",
            source: "lme-bridge-stub",
            prices: generateHistorical(basePrice, days),
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
