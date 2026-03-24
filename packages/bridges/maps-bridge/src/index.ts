import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const SERVER_NAME = "maps-bridge";
const SERVER_VERSION = "0.1.0";

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "geocode", description: "Geocode address to lat/lng (bridge stub)", inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
    { name: "reverse_geocode", description: "Reverse geocode lat/lng to address (bridge stub)", inputSchema: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" } }, required: ["lat", "lng"] } },
    { name: "distance_matrix", description: "Distance calculation between two points", inputSchema: { type: "object", properties: { origin_lat: { type: "number" }, origin_lng: { type: "number" }, destination_lat: { type: "number" }, destination_lng: { type: "number" } }, required: ["origin_lat", "origin_lng", "destination_lat", "destination_lng"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: JSON.stringify({ success: true, status: "ok", server: SERVER_NAME, version: SERVER_VERSION }) }] };
  }

  if (tool === "geocode") {
    return { content: [{ type: "text", text: JSON.stringify({ success: true, address: String(args.address ?? ""), lat: 43.6532, lng: -79.3832, provider: "maps-bridge-stub" }) }] };
  }

  if (tool === "reverse_geocode") {
    return { content: [{ type: "text", text: JSON.stringify({ success: true, lat: Number(args.lat ?? 0), lng: Number(args.lng ?? 0), formatted_address: "Toronto, ON, Canada", provider: "maps-bridge-stub" }) }] };
  }

  if (tool === "distance_matrix") {
    const originLat = Number(args.origin_lat ?? 0);
    const originLng = Number(args.origin_lng ?? 0);
    const destinationLat = Number(args.destination_lat ?? 0);
    const destinationLng = Number(args.destination_lng ?? 0);
    const dx = destinationLat - originLat;
    const dy = destinationLng - originLng;
    const approxKm = Math.sqrt(dx * dx + dy * dy) * 111;
    return { content: [{ type: "text", text: JSON.stringify({ success: true, distance_km: Number(approxKm.toFixed(2)), duration_minutes: Math.ceil((approxKm / 60) * 60) }) }] };
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
