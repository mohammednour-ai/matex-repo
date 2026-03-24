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
    { name: "get_listing", description: "Get full listing by id", inputSchema: { type: "object", properties: { listing_id: { type: "string" } }, required: ["listing_id"] } },
    { name: "get_my_listings", description: "Get seller listings", inputSchema: { type: "object", properties: { seller_id: { type: "string" } }, required: ["seller_id"] } },
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
      if (error) return fail("DB_ERROR", error.message);
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

    if (supabase) {
      const { error } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .update(args.fields as Record<string, unknown>)
        .eq("listing_id", listingId);
      if (error) return fail("DB_ERROR", error.message);
      await emitEvent("listing.listing.updated", { listing_id: listingId });
      return { content: [{ type: "text", text: ok({ listing_id: listingId, updated: true }) }] };
    }

    const current = listingStore.get(listingId);
    if (!current) return fail("NOT_FOUND", "Listing not found");
    const fields = (args.fields ?? {}) as Partial<Listing>;
    const updated = { ...current, ...fields };
    listingStore.set(listingId, updated);
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
      if (error) return fail("DB_ERROR", error.message);
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
      if (error) return fail("DB_ERROR", error.message);
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
      if (error) return fail("DB_ERROR", error.message);
      return { content: [{ type: "text", text: ok({ listing: data ?? null }) }] };
    }
    const listing = listingStore.get(listingId);
    return { content: [{ type: "text", text: ok({ listing: listing ?? null }) }] };
  }

  if (tool === "get_my_listings") {
    const sellerId = String(args.seller_id ?? "");
    if (!sellerId) return fail("VALIDATION_ERROR", "seller_id is required.");
    if (supabase) {
      const { data, error } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .select("*")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });
      if (error) return fail("DB_ERROR", error.message);
      return { content: [{ type: "text", text: ok({ listings: data ?? [], total: (data ?? []).length }) }] };
    }
    const listings = Array.from(listingStore.values()).filter((row) => row.seller_id === sellerId);
    return { content: [{ type: "text", text: ok({ listings, total: listings.length }) }] };
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
