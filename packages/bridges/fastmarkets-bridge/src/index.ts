import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "fastmarkets-bridge";
const SERVER_VERSION = "0.1.0";

const FASTMARKETS_BASE_PRICES: Record<string, { price: number; unit: string }> = {
  hms_1: { price: 385.00, unit: "per_gross_ton" },
  hms_2: { price: 365.00, unit: "per_gross_ton" },
  shredded_scrap: { price: 420.00, unit: "per_gross_ton" },
  occ_11: { price: 135.00, unit: "per_short_ton" },
  sorted_office_paper: { price: 175.00, unit: "per_short_ton" },
  mixed_paper: { price: 65.00, unit: "per_short_ton" },
  hdpe_natural: { price: 0.42, unit: "per_lb" },
  pet_clear: { price: 0.28, unit: "per_lb" },
  pp_homopolymer: { price: 0.38, unit: "per_lb" },
};

const REGIONS = ["northeast", "midwest", "southeast", "west", "canada_east", "canada_west"];

function simulatePrice(base: number): number {
  const variance = (Math.random() - 0.5) * 0.06;
  return Math.round((base * (1 + variance)) * 100) / 100;
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "get_fastmarkets_price", description: "Get simulated Fastmarkets/AMM price for ferrous scrap, paper, or plastics (bridge stub)", inputSchema: { type: "object", properties: { material: { type: "string", description: "e.g. hms_1, occ_11, hdpe_natural" } }, required: ["material"] } },
    { name: "get_regional_data", description: "Get simulated regional price data (bridge stub)", inputSchema: { type: "object", properties: { material: { type: "string" }, region: { type: "string" } }, required: ["material"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: JSON.stringify({ success: true, status: "ok", server: SERVER_NAME, version: SERVER_VERSION }) }] };
  }

  if (tool === "get_fastmarkets_price") {
    const material = String(args.material ?? "").toLowerCase();
    const entry = FASTMARKETS_BASE_PRICES[material];
    if (!entry) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "UNKNOWN_MATERIAL", message: `Unknown material: ${material}. Supported: ${Object.keys(FASTMARKETS_BASE_PRICES).join(", ")}` } }) }],
      };
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          data: {
            material,
            price: simulatePrice(entry.price),
            currency: "USD",
            unit: entry.unit,
            source: "fastmarkets-bridge-stub",
            timestamp: new Date().toISOString(),
          },
        }),
      }],
    };
  }

  if (tool === "get_regional_data") {
    const material = String(args.material ?? "").toLowerCase();
    const region = String(args.region ?? "").toLowerCase();
    const entry = FASTMARKETS_BASE_PRICES[material];
    if (!entry) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "UNKNOWN_MATERIAL", message: `Unknown material: ${material}. Supported: ${Object.keys(FASTMARKETS_BASE_PRICES).join(", ")}` } }) }],
      };
    }

    if (region && !REGIONS.includes(region)) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({ success: false, error: { code: "UNKNOWN_REGION", message: `Unknown region: ${region}. Supported: ${REGIONS.join(", ")}` } }) }],
      };
    }

    const targetRegions = region ? [region] : REGIONS;
    const regionalPrices = targetRegions.map((r) => ({
      region: r,
      price: simulatePrice(entry.price),
      currency: "USD",
      unit: entry.unit,
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          data: {
            material,
            source: "fastmarkets-bridge-stub",
            timestamp: new Date().toISOString(),
            regional_prices: regionalPrices,
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
