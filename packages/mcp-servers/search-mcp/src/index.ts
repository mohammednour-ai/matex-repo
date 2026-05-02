import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import { generateId, MatexEventBus, now , initSentry} from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "search-mcp";
initSentry(SERVER_NAME);
const SERVER_VERSION = "0.1.0";
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type SearchDoc = {
  listing_id: string;
  title: string;
  description: string;
  category: string;
  lat: number;
  lng: number;
  price?: number;
};

const listingIndex: SearchDoc[] = [];
const savedSearches = new Map<string, Array<Record<string, unknown>>>();
const eventBus = EVENT_REDIS_URL ? new MatexEventBus({ redisUrl: EVENT_REDIS_URL }) : null;
const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

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
    // Non-blocking event emission for MVP scaffold.
  }
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "search_materials", description: "Search indexed listings with pagination", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" }, offset: { type: "number" }, sort_by: { type: "string" }, categories: { type: "array" }, provinces: { type: "array" }, price_min: { type: "number" }, price_max: { type: "number" }, sale_modes: { type: "array" }, inspection_required: { type: "boolean" } } } },
    { name: "geo_search", description: "Search listings by distance radius with pagination", inputSchema: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" }, radius_km: { type: "number" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["lat", "lng", "radius_km"] } },
    { name: "filter_by_category", description: "Filter listings by category with pagination", inputSchema: { type: "object", properties: { category: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["category"] } },
    { name: "save_search", description: "Save a user search configuration", inputSchema: { type: "object", properties: { user_id: { type: "string" }, query: { type: "string" }, filters: { type: "object" } }, required: ["user_id"] } },
    { name: "get_saved_searches", description: "Get saved searches by user", inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] } },
    { name: "index_listing", description: "Index listing document (internal utility)", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, category: { type: "string" }, lat: { type: "number" }, lng: { type: "number" }, price: { type: "number" } }, required: ["listing_id", "title", "description", "category", "lat", "lng"] } },
    { name: "remove_from_index", description: "Remove a listing from the in-memory search index (call on archive/delete)", inputSchema: { type: "object", properties: { listing_id: { type: "string" } }, required: ["listing_id"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }

  if (tool === "index_listing") {
    if (!String(args.listing_id ?? "").trim()) return fail("VALIDATION_ERROR", "listing_id is required.");
    if (!String(args.title ?? "").trim()) return fail("VALIDATION_ERROR", "title is required.");
    if (!String(args.category ?? "").trim()) return fail("VALIDATION_ERROR", "category is required.");
    const listingId = String(args.listing_id ?? "");
    // Replace existing entry if already indexed, otherwise append.
    const existingIdx = listingIndex.findIndex((d) => d.listing_id === listingId);
    const doc: SearchDoc = {
      listing_id: listingId,
      title: String(args.title ?? ""),
      description: String(args.description ?? ""),
      category: String(args.category ?? ""),
      lat: Number(args.lat ?? 0),
      lng: Number(args.lng ?? 0),
      price: typeof args.price === "number" ? args.price : undefined,
    };
    if (existingIdx >= 0) {
      listingIndex[existingIdx] = doc;
    } else {
      listingIndex.push(doc);
    }
    await emitEvent("search.index.updated", { listing_id: doc.listing_id, category: doc.category });
    return { content: [{ type: "text", text: ok({ indexed: true, listing_id: doc.listing_id, total_indexed: listingIndex.length }) }] };
  }

  if (tool === "remove_from_index") {
    const listingId = String(args.listing_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    const before = listingIndex.length;
    const idx = listingIndex.findIndex((d) => d.listing_id === listingId);
    if (idx >= 0) listingIndex.splice(idx, 1);
    return { content: [{ type: "text", text: ok({ removed: idx >= 0, listing_id: listingId, total_indexed: listingIndex.length, was_indexed: before }) }] };
  }

  if (tool === "search_materials") {
    const query = String(args.query ?? "").toLowerCase().trim();
    const limit = Math.min(Number(args.limit ?? 50), 100);
    const offset = Math.max(Number(args.offset ?? 0), 0);

    if (supabase) {
      let dbQuery = supabase
        .schema("listing_mcp")
        .from("listings")
        .select("listing_id,title,description,category_id,asking_price,status,quantity,unit,images,created_at", { count: "exact" })
        .eq("status", "active")
        .range(offset, offset + limit - 1);
      if (query) dbQuery = dbQuery.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
      if (typeof args.price_min === "number") dbQuery = dbQuery.gte("asking_price", args.price_min);
      if (typeof args.price_max === "number") dbQuery = dbQuery.lte("asking_price", args.price_max);
      const { data, error, count } = await dbQuery;
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ results: data ?? [], total: count ?? 0, limit, offset }) }] };
    }

    let results = listingIndex.filter((d) =>
      query.length === 0
        ? true
        : d.title.toLowerCase().includes(query) ||
          d.description.toLowerCase().includes(query) ||
          d.category.toLowerCase().includes(query),
    );
    if (typeof args.price_min === "number") results = results.filter((d) => (d.price ?? 0) >= (args.price_min as number));
    if (typeof args.price_max === "number") results = results.filter((d) => (d.price ?? 0) <= (args.price_max as number));
    const page = results.slice(offset, offset + limit);
    return { content: [{ type: "text", text: ok({ results: page, total: results.length, limit, offset }) }] };
  }

  if (tool === "geo_search") {
    const lat = Number(args.lat ?? 0);
    const lng = Number(args.lng ?? 0);
    const radiusKm = Number(args.radius_km ?? 0);
    const limit = Math.min(Number(args.limit ?? 50), 100);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusKm) || radiusKm <= 0) {
      return fail("VALIDATION_ERROR", "lat, lng, and radius_km must be valid numbers and radius_km > 0.");
    }
    if (supabase) {
      const { data, error, count } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .select("listing_id,title,description,category_id,asking_price,pickup_address,status", { count: "exact" })
        .eq("status", "active")
        .range(offset, offset + limit - 1);
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ results: data ?? [], total: count ?? 0, limit, offset, note: "PostGIS radius filter pending migration" }) }] };
    }

    const all = listingIndex
      .map((d) => ({ ...d, distance_km: Number(distanceKm(lat, lng, d.lat, d.lng).toFixed(2)) }))
      .filter((d) => d.distance_km <= radiusKm)
      .sort((a, b) => a.distance_km - b.distance_km);
    const page = all.slice(offset, offset + limit);
    return { content: [{ type: "text", text: ok({ results: page, total: all.length, limit, offset }) }] };
  }

  if (tool === "filter_by_category") {
    const category = String(args.category ?? "").toLowerCase();
    if (!category) return fail("VALIDATION_ERROR", "category is required.");
    const limit = Math.min(Number(args.limit ?? 50), 100);
    const offset = Math.max(Number(args.offset ?? 0), 0);

    if (supabase) {
      const { data, error, count } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .select("*", { count: "exact" })
        .eq("status", "active")
        .eq("category_id", category)
        .range(offset, offset + limit - 1);
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ results: data ?? [], total: count ?? 0, limit, offset }) }] };
    }

    const all = listingIndex.filter((d) => d.category.toLowerCase() === category);
    const page = all.slice(offset, offset + limit);
    return { content: [{ type: "text", text: ok({ results: page, total: all.length, limit, offset }) }] };
  }

  if (tool === "save_search") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    const entry = {
      saved_search_id: generateId(),
      query: String(args.query ?? ""),
      filters: (args.filters ?? {}) as Record<string, unknown>,
      created_at: now(),
    };

    if (supabase) {
      const { error } = await supabase.schema("listing_mcp").from("saved_searches").insert({
        saved_search_id: entry.saved_search_id,
        user_id: userId,
        query: entry.query,
        filters: entry.filters,
      });
      if (error) return fail("DB_ERROR", "Database operation failed");
      await emitEvent("search.saved_search.created", { user_id: userId, saved_search_id: entry.saved_search_id });
      return { content: [{ type: "text", text: ok({ saved_search_id: entry.saved_search_id }) }] };
    }

    const current = savedSearches.get(userId) ?? [];
    current.push(entry);
    savedSearches.set(userId, current);
    await emitEvent("search.saved_search.created", { user_id: userId, saved_search_id: entry.saved_search_id });
    return { content: [{ type: "text", text: ok({ saved_search_id: entry.saved_search_id }) }] };
  }

  if (tool === "get_saved_searches") {
    const userId = String(args.user_id ?? "");
    if (supabase) {
      const { data, error } = await supabase
        .schema("listing_mcp")
        .from("saved_searches")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ saved_searches: data ?? [], total: (data ?? []).length }) }] };
    }
    const results = savedSearches.get(userId) ?? [];
    return { content: [{ type: "text", text: ok({ saved_searches: results, total: results.length }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("search", Number(process.env.MCP_HTTP_PORT ?? 4104));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}

// Evict archived/cancelled listings from the in-memory index automatically.
if (eventBus) {
  eventBus.startConsumerLoop("search-index-eviction", async (event, payload) => {
    if (event === "listing.listing.archived" || event === "listing.listing.cancelled" || event === "listing.listing.deleted") {
      const listingId = String(payload.listing_id ?? "");
      if (!listingId) return;
      const idx = listingIndex.findIndex((d) => d.listing_id === listingId);
      if (idx >= 0) {
        listingIndex.splice(idx, 1);
        console.error(`[search-mcp] evicted listing ${listingId} from index (event: ${event})`);
      }
    }
  });
  console.error("[search-mcp] index eviction consumer started");
}
