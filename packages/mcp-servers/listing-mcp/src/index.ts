import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import type { Listing, ListingStatus, PriceType, UnitType } from "@matex/types";
import { generateId, MatexEventBus, now } from "@matex/utils";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "listing-mcp";
const SERVER_VERSION = "0.1.0";
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const listingStore = new Map<string, Listing>();
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

function toSlug(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

async function emitEvent(event: string, payload: Record<string, unknown>): Promise<void> {
  if (!eventBus) return;
  try {
    await eventBus.publish(event, payload, SERVER_NAME);
  } catch {
    // Non-blocking event emission for MVP scaffold.
  }
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "create_listing", description: "Create a material listing", inputSchema: { type: "object", properties: { seller_id: { type: "string" }, title: { type: "string" }, category_id: { type: "string" }, description: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" }, price_type: { type: "string" }, asking_price: { type: "number" } }, required: ["seller_id", "title", "category_id", "description", "quantity", "unit", "price_type"] } },
    { name: "update_listing", description: "Update listing fields", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, fields: { type: "object" } }, required: ["listing_id", "fields"] } },
    { name: "upload_images", description: "Attach image URLs to listing", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, images: { type: "array" } }, required: ["listing_id", "images"] } },
    { name: "publish_listing", description: "Mark listing as active", inputSchema: { type: "object", properties: { listing_id: { type: "string" } }, required: ["listing_id"] } },
    { name: "archive_listing", description: "Archive a listing (soft delete)", inputSchema: { type: "object", properties: { listing_id: { type: "string" } }, required: ["listing_id"] } },
    { name: "get_listing", description: "Get full listing by id", inputSchema: { type: "object", properties: { listing_id: { type: "string" } }, required: ["listing_id"] } },
    { name: "get_my_listings", description: "Get seller listings with pagination", inputSchema: { type: "object", properties: { seller_id: { type: "string" }, limit: { type: "number" }, offset: { type: "number" }, status: { type: "string" } }, required: ["seller_id"] } },
    { name: "list_listings", description: "Browse active marketplace listings", inputSchema: { type: "object", properties: { limit: { type: "number" }, offset: { type: "number" }, category_id: { type: "string" }, price_min: { type: "number" }, price_max: { type: "number" } } } },
    { name: "add_favorite", description: "Save a listing to favorites (stub)", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, user_id: { type: "string" } }, required: ["listing_id"] } },
    { name: "ping", description: "Health check", inputSchema: { type: "object", properties: {} } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  if (tool === "ping") {
    return { content: [{ type: "text", text: ok({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, timestamp: now() }) }] };
  }

  if (tool === "create_listing") {
    if (!String(args.seller_id ?? "").trim()) return fail("VALIDATION_ERROR", "seller_id is required.");
    if (!String(args.title ?? "").trim()) return fail("VALIDATION_ERROR", "title is required.");
    if (!String(args.category_id ?? "").trim()) return fail("VALIDATION_ERROR", "category_id is required.");
    if (!String(args.description ?? "").trim()) return fail("VALIDATION_ERROR", "description is required.");
    if (Number(args.quantity ?? 0) <= 0) return fail("VALIDATION_ERROR", "quantity must be greater than 0.");
    const listingId = generateId();
    const slug = `${toSlug(String(args.title ?? "listing"))}-${listingId.slice(0, 8)}`;
    const listing: Listing = {
      listing_id: listingId,
      seller_id: String(args.seller_id ?? ""),
      title: String(args.title ?? ""),
      category_id: String(args.category_id ?? ""),
      description: String(args.description ?? ""),
      quantity: Number(args.quantity ?? 0),
      unit: String(args.unit ?? "kg") as UnitType,
      price_type: String(args.price_type ?? "fixed") as PriceType,
      asking_price: typeof args.asking_price === "number" ? args.asking_price : undefined,
      reserve_price: undefined,
      quality_grade: undefined,
      images: [],
      location: { lat: 0, lng: 0 },
      pickup_address: { street: "", city: "", province: "ON", postal_code: "", country: "CA" },
      status: "draft" as ListingStatus,
      created_at: now(),
      published_at: undefined,
    };

    if (supabase) {
      const { error } = await supabase.schema("listing_mcp").from("listings").insert({
        listing_id: listingId,
        seller_id: listing.seller_id,
        title: listing.title,
        slug,
        category_id: listing.category_id,
        description: listing.description,
        quantity: listing.quantity,
        unit: listing.unit,
        price_type: listing.price_type,
        asking_price: listing.asking_price ?? null,
        images: listing.images,
        location: `SRID=4326;POINT(${listing.location.lng} ${listing.location.lat})`,
        pickup_address: listing.pickup_address,
        status: listing.status,
      });
      if (error) return fail("DB_ERROR", "Database operation failed");
      await emitEvent("listing.listing.created", { listing_id: listingId, seller_id: listing.seller_id });
      return { content: [{ type: "text", text: ok({ listing_id: listingId, status: listing.status }) }] };
    }

    listingStore.set(listingId, listing);
    await emitEvent("listing.listing.created", { listing_id: listingId, seller_id: listing.seller_id });
    return { content: [{ type: "text", text: ok({ listing_id: listingId, status: listing.status }) }] };
  }

  if (tool === "update_listing") {
    const listingId = String(args.listing_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    if (typeof args.fields !== "object" || !args.fields) return fail("VALIDATION_ERROR", "fields must be an object.");

    const ALLOWED_FIELDS = ["title", "description", "asking_price", "quantity"] as const;
    const rawFields = args.fields as Record<string, unknown>;
    const safeFields: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in rawFields) safeFields[key] = rawFields[key];
    }
    if (Object.keys(safeFields).length === 0) return fail("VALIDATION_ERROR", "No valid fields provided. Allowed: title, description, asking_price, quantity.");

    if (supabase) {
      const { error } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .update({ ...safeFields, updated_at: now() })
        .eq("listing_id", listingId);
      if (error) return fail("DB_ERROR", "Database operation failed");
      await emitEvent("listing.listing.updated", { listing_id: listingId });
      return { content: [{ type: "text", text: ok({ listing_id: listingId, updated: true }) }] };
    }

    const current = listingStore.get(listingId);
    if (!current) return fail("NOT_FOUND", "Listing not found");
    const updated = { ...current, ...safeFields };
    listingStore.set(listingId, updated as Listing);
    await emitEvent("listing.listing.updated", { listing_id: listingId });
    return { content: [{ type: "text", text: ok({ listing: updated }) }] };
  }

  if (tool === "upload_images") {
    const listingId = String(args.listing_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    if (!Array.isArray(args.images) || args.images.length === 0) return fail("VALIDATION_ERROR", "images must be a non-empty array.");
    const imagesInput = Array.isArray(args.images) ? args.images : [];
    const images = imagesInput.map((img, idx) => ({
      url: String((img as { url?: string }).url ?? img),
      order: idx + 1,
      alt_text: `Listing image ${idx + 1}`,
    }));

    if (supabase) {
      const { error } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .update({ images })
        .eq("listing_id", listingId);
      if (error) return fail("DB_ERROR", "Database operation failed");
      await emitEvent("listing.images.uploaded", { listing_id: listingId, images_count: images.length });
      return { content: [{ type: "text", text: ok({ listing_id: listingId, images_count: images.length }) }] };
    }

    const current = listingStore.get(listingId);
    if (!current) return fail("NOT_FOUND", "Listing not found");
    const updated = { ...current, images };
    listingStore.set(listingId, updated);
    await emitEvent("listing.images.uploaded", { listing_id: listingId, images_count: images.length });
    return { content: [{ type: "text", text: ok({ listing_id: listingId, images_count: images.length }) }] };
  }

  if (tool === "publish_listing") {
    const listingId = String(args.listing_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    if (supabase) {
      const publishedAt = now();
      const { data, error } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .update({ status: "active", published_at: publishedAt })
        .eq("listing_id", listingId)
        .select("listing_id,seller_id,status,published_at")
        .maybeSingle();
      if (error) return fail("DB_ERROR", "Database operation failed");
      if (!data) return fail("NOT_FOUND", "Listing not found");
      await emitEvent("listing.listing.published", { listing_id: listingId, seller_id: data.seller_id });
      return { content: [{ type: "text", text: ok({ listing_id: listingId, status: data.status, published_at: data.published_at }) }] };
    }

    const current = listingStore.get(listingId);
    if (!current) return fail("NOT_FOUND", "Listing not found");
    const updated: Listing = { ...current, status: "active", published_at: now() };
    listingStore.set(listingId, updated);
    await emitEvent("listing.listing.published", { listing_id: listingId, seller_id: updated.seller_id });
    return { content: [{ type: "text", text: ok({ listing_id: listingId, status: updated.status, published_at: updated.published_at }) }] };
  }

  if (tool === "get_listing") {
    const listingId = String(args.listing_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    if (supabase) {
      const { data, error } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .select("*")
        .eq("listing_id", listingId)
        .maybeSingle();
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ listing: data ?? null }) }] };
    }
    const listing = listingStore.get(listingId);
    return { content: [{ type: "text", text: ok({ listing: listing ?? null }) }] };
  }

  if (tool === "get_my_listings") {
    const sellerId = String(args.seller_id ?? "");
    if (!sellerId) return fail("VALIDATION_ERROR", "seller_id is required.");
    const limit = Math.min(Number(args.limit ?? 50), 100);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const statusFilter = args.status ? String(args.status) : undefined;

    if (supabase) {
      let query = supabase
        .schema("listing_mcp")
        .from("listings")
        .select("*", { count: "exact" })
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (statusFilter) query = query.eq("status", statusFilter);
      const { data, error, count } = await query;
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ listings: data ?? [], total: count ?? 0, limit, offset }) }] };
    }
    let listings = Array.from(listingStore.values()).filter((row) => row.seller_id === sellerId);
    if (statusFilter) listings = listings.filter((l) => l.status === statusFilter);
    listings.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    const page = listings.slice(offset, offset + limit);
    return { content: [{ type: "text", text: ok({ listings: page, total: listings.length, limit, offset }) }] };
  }

  if (tool === "archive_listing") {
    const listingId = String(args.listing_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    if (supabase) {
      const { error } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .update({ status: "archived" })
        .eq("listing_id", listingId);
      if (error) return fail("DB_ERROR", "Database operation failed");
      await emitEvent("listing.listing.archived", { listing_id: listingId });
      return { content: [{ type: "text", text: ok({ listing_id: listingId, status: "archived" }) }] };
    }
    const current = listingStore.get(listingId);
    if (!current) return fail("NOT_FOUND", "Listing not found");
    listingStore.set(listingId, { ...current, status: "archived" as ListingStatus });
    await emitEvent("listing.listing.archived", { listing_id: listingId });
    return { content: [{ type: "text", text: ok({ listing_id: listingId, status: "archived" }) }] };
  }

  if (tool === "list_listings") {
    const limit = Math.min(Number(args.limit ?? 50), 100);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const categoryFilter = args.category_id ? String(args.category_id) : undefined;
    const priceMin = typeof args.price_min === "number" ? args.price_min : undefined;
    const priceMax = typeof args.price_max === "number" ? args.price_max : undefined;

    if (supabase) {
      let query = supabase
        .schema("listing_mcp")
        .from("listings")
        .select("listing_id,seller_id,title,category_id,description,quantity,unit,price_type,asking_price,images,status,created_at,published_at", { count: "exact" })
        .eq("status", "active")
        .order("published_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (categoryFilter) query = query.eq("category_id", categoryFilter);
      if (priceMin !== undefined) query = query.gte("asking_price", priceMin);
      if (priceMax !== undefined) query = query.lte("asking_price", priceMax);
      const { data, error, count } = await query;
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ listings: data ?? [], total: count ?? 0, limit, offset }) }] };
    }

    let listings = Array.from(listingStore.values()).filter((l) => l.status === "active");
    if (categoryFilter) listings = listings.filter((l) => l.category_id === categoryFilter);
    if (priceMin !== undefined) listings = listings.filter((l) => (l.asking_price ?? 0) >= priceMin);
    if (priceMax !== undefined) listings = listings.filter((l) => (l.asking_price ?? 0) <= priceMax);
    listings.sort((a, b) => ((a.published_at ?? a.created_at) < (b.published_at ?? b.created_at) ? 1 : -1));
    const page = listings.slice(offset, offset + limit);
    return { content: [{ type: "text", text: ok({ listings: page, total: listings.length, limit, offset }) }] };
  }

  if (tool === "add_favorite") {
    const listingId = String(args.listing_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    return { content: [{ type: "text", text: ok({ listing_id: listingId, favorited: true }) }] };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${tool}` }] };
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} started`);
}

if (process.env.MCP_HTTP_MODE === "1") {
  startDomainHttpAdapter("listing", Number(process.env.MCP_HTTP_PORT ?? 4103));
} else {
  main().catch((error) => {
    console.error(`[${SERVER_NAME}] fatal`, error);
    process.exit(1);
  });
}
