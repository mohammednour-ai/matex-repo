import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getFreighteraQuote, type FreighteraQuoteRequest } from "./freightera.js";

const SERVER_NAME = "carriers-bridge";
const SERVER_VERSION = "0.1.0";

const CARRIERS = [
  { id: "day_ross", name: "Day & Ross", rating: 4.2 },
  { id: "manitoulin", name: "Manitoulin Transport", rating: 4.0 },
  { id: "purolator", name: "Purolator Freight", rating: 4.5 },
  { id: "gofor", name: "GoFor Industries", rating: 3.8 },
  { id: "canada_cartage", name: "Canada Cartage", rating: 4.1 },
  { id: "uber_freight", name: "Uber Freight", rating: 3.9 },
];

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "request_quotes", description: "Request shipping quotes from all integrated carriers (stub)", inputSchema: { type: "object", properties: { origin: { type: "object" }, destination: { type: "object" }, weight_kg: { type: "number" }, dimensions: { type: "object" }, hazmat_class: { type: "string" } }, required: ["origin", "destination", "weight_kg"] } },
    { name: "book_carrier", description: "Book a shipment with selected carrier (stub)", inputSchema: { type: "object", properties: { carrier_id: { type: "string" }, quote_id: { type: "string" }, pickup_date: { type: "string" }, special_instructions: { type: "string" } }, required: ["carrier_id", "quote_id"] } },
    { name: "get_tracking", description: "Get real-time tracking for a shipment (stub)", inputSchema: { type: "object", properties: { tracking_number: { type: "string" }, carrier_id: { type: "string" } }, required: ["tracking_number"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: JSON.stringify({ success: true, status: "ok", server: SERVER_NAME, version: SERVER_VERSION }) }] };
  }

  if (tool === "request_quotes") {
    const weightKg = Number(args.weight_kg ?? 0);
    const quotes = CARRIERS.map((carrier) => ({
      quote_id: `quote_${carrier.id}_${Date.now()}`,
      carrier_id: carrier.id,
      carrier_name: carrier.name,
      carrier_rating: carrier.rating,
      price_cad: Number((weightKg * (0.08 + Math.random() * 0.12) + 150 + Math.random() * 300).toFixed(2)),
      transit_days: Math.floor(Math.random() * 5) + 1,
      co2_emissions_kg: Number((weightKg * 0.05 * (Math.random() + 0.5)).toFixed(2)),
      valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      tdg_certified: true,
    }));

    // Freightera adapter — additive. Stub today; real Shipper API once granted.
    try {
      const origin = (args.origin ?? {}) as Record<string, unknown>;
      const destination = (args.destination ?? {}) as Record<string, unknown>;
      const freighteraReq: FreighteraQuoteRequest = {
        origin: {
          province: String(origin.province ?? ""),
          postal_code: String(origin.postal_code ?? ""),
          country: (String(origin.country ?? "CA").toUpperCase() === "US" ? "US" : "CA") as "CA" | "US",
        },
        destination: {
          province: String(destination.province ?? ""),
          postal_code: String(destination.postal_code ?? ""),
          country: (String(destination.country ?? "CA").toUpperCase() === "US" ? "US" : "CA") as "CA" | "US",
        },
        weight_kg: weightKg,
        hazmat_class: typeof args.hazmat_class === "string" ? args.hazmat_class : undefined,
        flatbed: Boolean((args as { flatbed?: boolean }).flatbed),
      };
      const freightera = await getFreighteraQuote(freighteraReq);
      quotes.push(freightera);
    } catch {
      // Freightera failure must not break the rest of the quote board.
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, quotes, carrier_count: quotes.length }) }],
    };
  }

  if (tool === "book_carrier") {
    const carrierId = String(args.carrier_id ?? "");
    const quoteId = String(args.quote_id ?? "");
    const carrier = CARRIERS.find((c) => c.id === carrierId);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          booking_id: `bk_${Date.now()}`,
          carrier_id: carrierId,
          carrier_name: carrier?.name ?? carrierId,
          quote_id: quoteId,
          tracking_number: `TRK${Date.now()}`,
          status: "confirmed",
          estimated_pickup: args.pickup_date ?? new Date(Date.now() + 86400000).toISOString(),
        }),
      }],
    };
  }

  if (tool === "get_tracking") {
    const trackingNumber = String(args.tracking_number ?? "");
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          tracking_number: trackingNumber,
          status: "in_transit",
          current_location: { city: "Toronto", province: "ON", country: "CA" },
          estimated_delivery: new Date(Date.now() + 2 * 86400000).toISOString(),
          events: [
            { timestamp: new Date(Date.now() - 86400000).toISOString(), status: "picked_up", location: "Montreal, QC" },
            { timestamp: new Date().toISOString(), status: "in_transit", location: "Toronto, ON" },
          ],
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
