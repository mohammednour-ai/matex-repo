import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";
import type { Listing, ListingStatus, PriceType, UnitType } from "@matex/types";
import { MatexEventBus, initSentry } from "@matex/utils";
import { generateId, now } from "@matex/logic";
import { startDomainHttpAdapter } from "../../../shared/mcp-http-adapter/src";

const SERVER_NAME = "listing-mcp";
initSentry(SERVER_NAME);
const SERVER_VERSION = "0.1.0";
const EVENT_REDIS_URL = process.env.REDIS_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const listingStore = new Map<string, Listing>();
const favoritesStore = new Map<string, Set<string>>(); // user_id -> Set<listing_id>
const categoryStore = new Map<string, Record<string, unknown>>();
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

// Verify the actor owns the listing (or is a platform admin).
// Returns null on success, or a fail() result on permission failure / DB error.
async function assertListingOwner(
  listingId: string,
  actorId: string,
): Promise<{ listing: { listing_id: string; seller_id: string; status: string } } | { error: ReturnType<typeof fail> }> {
  if (supabase) {
    const { data: listing, error: listErr } = await supabase
      .schema("listing_mcp")
      .from("listings")
      .select("listing_id,seller_id,status")
      .eq("listing_id", listingId)
      .maybeSingle();
    if (listErr) return { error: fail("DB_ERROR", "Database operation failed") };
    if (!listing) return { error: fail("NOT_FOUND", "Listing not found") };
    if (listing.seller_id !== actorId) {
      const { data: admin } = await supabase
        .schema("auth_mcp")
        .from("users")
        .select("is_platform_admin")
        .eq("user_id", actorId)
        .maybeSingle();
      if (!admin?.is_platform_admin) return { error: fail("FORBIDDEN", "Only the seller or a platform admin may modify this listing.") };
    }
    return { listing };
  }
  const current = listingStore.get(listingId);
  if (!current) return { error: fail("NOT_FOUND", "Listing not found") };
  if (current.seller_id !== actorId) return { error: fail("FORBIDDEN", "Only the seller may modify this listing.") };
  return { listing: { listing_id: current.listing_id, seller_id: current.seller_id, status: current.status } };
}

const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "create_listing", description: "Create a material listing (draft)", inputSchema: { type: "object", properties: { seller_id: { type: "string" }, title: { type: "string" }, category_id: { type: "string" }, category: { type: "string", description: "Category slug or name; resolved to category_id when category_id is not provided" }, subcategory_id: { type: "string" }, description: { type: "string" }, material_type: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" }, price_type: { type: "string" }, asking_price: { type: "number" }, buy_now_price: { type: "number" }, reserve_price: { type: "number" }, quality_grade: { type: "string" }, quality_details: { type: "object" }, contamination_pct: { type: "number" }, moisture_pct: { type: "number" }, certifications: { type: "array" }, has_permit: { type: "boolean" }, permit_number: { type: "string" }, environmental_permits: { type: "array" }, pickup_address: { type: "object" }, inspection_required: { type: "boolean" }, hazmat_class: { type: "string" }, available_from: { type: "string" }, expires_at: { type: "string" }, status: { type: "string" } }, required: ["seller_id", "title", "description", "quantity", "unit"] } },
    { name: "update_listing", description: "Update listing fields (seller-only)", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, actor_id: { type: "string" }, fields: { type: "object" } }, required: ["listing_id", "actor_id", "fields"] } },
    { name: "upload_images", description: "Attach image URLs to listing (seller-only)", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, actor_id: { type: "string" }, images: { type: "array" } }, required: ["listing_id", "actor_id", "images"] } },
    { name: "publish_listing", description: "Mark listing as active (seller-only). Optional fields persist auction config / payment / logistics / pickup details.", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, actor_id: { type: "string" }, sale_mode: { type: "string" }, asking_price: { type: "number" }, buy_now_price: { type: "number" }, starting_bid: { type: "number" }, reserve_price: { type: "number" }, bid_increment: { type: "number" }, bidding_closes_at: { type: "string" }, auction_date: { type: "string" }, deposit_pct: { type: "number" }, require_escrow: { type: "boolean" }, payment_methods: { type: "array" }, seller_province: { type: "string" }, pickup_address: { type: "object" }, inspection_required: { type: "boolean" }, hazmat_class: { type: "string" }, publish_mode: { type: "string" }, scheduled_at: { type: "string" } }, required: ["listing_id", "actor_id"] } },
    { name: "archive_listing", description: "Archive a listing (seller-only soft delete)", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, actor_id: { type: "string" } }, required: ["listing_id", "actor_id"] } },
    { name: "get_listing", description: "Get full listing by id", inputSchema: { type: "object", properties: { listing_id: { type: "string" } }, required: ["listing_id"] } },
    { name: "get_my_listings", description: "Get seller listings with pagination", inputSchema: { type: "object", properties: { seller_id: { type: "string" }, limit: { type: "number" }, offset: { type: "number" }, status: { type: "string" } }, required: ["seller_id"] } },
    { name: "list_listings", description: "Browse active marketplace listings", inputSchema: { type: "object", properties: { limit: { type: "number" }, offset: { type: "number" }, category_id: { type: "string" }, price_min: { type: "number" }, price_max: { type: "number" } } } },
    { name: "add_favorite", description: "Save a listing to favorites", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, user_id: { type: "string" } }, required: ["listing_id", "user_id"] } },
    { name: "remove_favorite", description: "Remove a listing from favorites", inputSchema: { type: "object", properties: { listing_id: { type: "string" }, user_id: { type: "string" } }, required: ["listing_id", "user_id"] } },
    { name: "list_favorites", description: "List a user's saved listings", inputSchema: { type: "object", properties: { user_id: { type: "string" }, limit: { type: "number" }, offset: { type: "number" } }, required: ["user_id"] } },
    { name: "create_category", description: "Create a listing category (admin-only)", inputSchema: { type: "object", properties: { actor_id: { type: "string" }, name: { type: "string" }, slug: { type: "string" }, parent_id: { type: "string" }, default_unit: { type: "string" }, weight_tolerance: { type: "number" }, sort_order: { type: "number" } }, required: ["actor_id", "name"] } },
    { name: "update_category", description: "Update a category (admin-only)", inputSchema: { type: "object", properties: { actor_id: { type: "string" }, category_id: { type: "string" }, fields: { type: "object" } }, required: ["actor_id", "category_id", "fields"] } },
    { name: "list_categories", description: "List all active categories", inputSchema: { type: "object", properties: { include_inactive: { type: "boolean" }, parent_id: { type: "string" } } } },
    { name: "get_category", description: "Get a category by id or slug", inputSchema: { type: "object", properties: { category_id: { type: "string" }, slug: { type: "string" } } } },
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
    if (!String(args.description ?? "").trim()) return fail("VALIDATION_ERROR", "description is required.");
    if (Number(args.quantity ?? 0) <= 0) return fail("VALIDATION_ERROR", "quantity must be greater than 0.");

    let categoryId = args.category_id ? String(args.category_id) : "";
    if (!categoryId && args.category && supabase) {
      const slugOrName = String(args.category).trim();
      const { data: cat, error: catError } = await supabase
        .schema("listing_mcp")
        .from("categories")
        .select("category_id")
        .or(`slug.eq.${slugOrName},name.eq.${slugOrName}`)
        .limit(1)
        .maybeSingle();
      if (catError) return fail("DB_ERROR", "Database operation failed");
      if (cat?.category_id) categoryId = String(cat.category_id);
    }
    if (!categoryId) return fail("VALIDATION_ERROR", "category_id (or a known category slug/name) is required.");

    const allowedStatuses = ["draft", "pending_review"];
    const requestedStatus = args.status ? String(args.status) : "draft";
    const status = (allowedStatuses.includes(requestedStatus) ? requestedStatus : "draft") as ListingStatus;

    const allowedPriceTypes = ["fixed", "auction", "negotiable"];
    const incomingPriceType = args.price_type ? String(args.price_type) : "fixed";
    const mappedPriceType = incomingPriceType === "bidding" ? "auction" : incomingPriceType;
    const priceType = (allowedPriceTypes.includes(mappedPriceType) ? mappedPriceType : "fixed") as PriceType;

    const qualityDetails: Record<string, unknown> = {
      ...(typeof args.quality_details === "object" && args.quality_details ? (args.quality_details as Record<string, unknown>) : {}),
    };
    if (typeof args.material_type === "string" && args.material_type) qualityDetails.material_type = String(args.material_type);
    if (typeof args.contamination_pct === "number") qualityDetails.contamination_pct = args.contamination_pct;
    if (typeof args.moisture_pct === "number") qualityDetails.moisture_pct = args.moisture_pct;

    const certifications = Array.isArray(args.certifications) ? args.certifications : [];
    const environmentalPermits = Array.isArray(args.environmental_permits) ? [...args.environmental_permits] : [];
    if (args.has_permit && args.permit_number) {
      environmentalPermits.push({ permit_type: "general", number: String(args.permit_number), expiry: null });
    }

    const pickupAddress = (typeof args.pickup_address === "object" && args.pickup_address)
      ? args.pickup_address as Record<string, unknown>
      : { street: "", city: "", province: "ON", postal_code: "", country: "CA" };

    const listingId = generateId();
    const slug = `${toSlug(String(args.title ?? "listing"))}-${listingId.slice(0, 8)}`;
    const listing: Listing = {
      listing_id: listingId,
      seller_id: String(args.seller_id ?? ""),
      title: String(args.title ?? ""),
      category_id: categoryId,
      description: String(args.description ?? ""),
      quantity: Number(args.quantity ?? 0),
      unit: String(args.unit ?? "kg") as UnitType,
      price_type: priceType,
      asking_price: typeof args.asking_price === "number" ? args.asking_price : undefined,
      reserve_price: typeof args.reserve_price === "number" ? args.reserve_price : undefined,
      quality_grade: args.quality_grade ? String(args.quality_grade) : undefined,
      images: [],
      location: { lat: 0, lng: 0 },
      pickup_address: { street: "", city: "", province: "ON", postal_code: "", country: "CA" },
      status,
      created_at: now(),
      published_at: undefined,
    };

    if (supabase) {
      const insertPayload: Record<string, unknown> = {
        listing_id: listingId,
        seller_id: listing.seller_id,
        title: listing.title,
        slug,
        category_id: categoryId,
        subcategory_id: args.subcategory_id ? String(args.subcategory_id) : null,
        description: listing.description,
        quantity: listing.quantity,
        unit: listing.unit,
        price_type: listing.price_type,
        asking_price: listing.asking_price ?? null,
        reserve_price: listing.reserve_price ?? null,
        buy_now_price: typeof args.buy_now_price === "number" ? args.buy_now_price : null,
        quality_grade: listing.quality_grade ?? null,
        quality_details: Object.keys(qualityDetails).length > 0 ? qualityDetails : null,
        certifications,
        environmental_permits: environmentalPermits,
        images: listing.images,
        location: `SRID=4326;POINT(${listing.location.lng} ${listing.location.lat})`,
        pickup_address: pickupAddress,
        inspection_required: args.inspection_required === true,
        available_from: args.available_from ? String(args.available_from) : null,
        expires_at: args.expires_at ? String(args.expires_at) : null,
        status: listing.status,
      };
      const { error } = await supabase.schema("listing_mcp").from("listings").insert(insertPayload);
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
    const actorId = String(args.actor_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    if (!actorId) return fail("VALIDATION_ERROR", "actor_id is required.");
    if (typeof args.fields !== "object" || !args.fields) return fail("VALIDATION_ERROR", "fields must be an object.");

    const ownerCheck = await assertListingOwner(listingId, actorId);
    if ("error" in ownerCheck) return ownerCheck.error;

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
      await emitEvent("listing.listing.updated", { listing_id: listingId, actor_id: actorId });
      return { content: [{ type: "text", text: ok({ listing_id: listingId, updated: true }) }] };
    }

    const current = listingStore.get(listingId)!;
    const updated = { ...current, ...safeFields };
    listingStore.set(listingId, updated as Listing);
    await emitEvent("listing.listing.updated", { listing_id: listingId, actor_id: actorId });
    return { content: [{ type: "text", text: ok({ listing: updated }) }] };
  }

  if (tool === "upload_images") {
    const listingId = String(args.listing_id ?? "");
    const actorId = String(args.actor_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    if (!actorId) return fail("VALIDATION_ERROR", "actor_id is required.");
    if (!Array.isArray(args.images) || args.images.length === 0) return fail("VALIDATION_ERROR", "images must be a non-empty array.");

    const ownerCheck = await assertListingOwner(listingId, actorId);
    if ("error" in ownerCheck) return ownerCheck.error;

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

    const current = listingStore.get(listingId)!;
    const updated = { ...current, images };
    listingStore.set(listingId, updated);
    await emitEvent("listing.images.uploaded", { listing_id: listingId, images_count: images.length });
    return { content: [{ type: "text", text: ok({ listing_id: listingId, images_count: images.length }) }] };
  }

  if (tool === "publish_listing") {
    const listingId = String(args.listing_id ?? "");
    const actorId = String(args.actor_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    if (!actorId) return fail("VALIDATION_ERROR", "actor_id is required.");

    const ownerCheck = await assertListingOwner(listingId, actorId);
    if ("error" in ownerCheck) return ownerCheck.error;

    const isScheduled = args.publish_mode === "scheduled" && typeof args.scheduled_at === "string" && args.scheduled_at.length > 0;
    const allowedPriceTypes = ["fixed", "auction", "negotiable"];
    const saleMode = args.sale_mode ? String(args.sale_mode) : "";
    const mappedPriceType = saleMode === "bidding" ? "auction" : saleMode;
    const priceType = allowedPriceTypes.includes(mappedPriceType) ? mappedPriceType : null;

    const update: Record<string, unknown> = {
      status: isScheduled ? "pending_review" : "active",
      published_at: isScheduled ? null : now(),
      updated_at: now(),
    };
    if (priceType) update.price_type = priceType;
    if (typeof args.asking_price === "number") update.asking_price = args.asking_price;
    if (typeof args.buy_now_price === "number") update.buy_now_price = args.buy_now_price;
    if (typeof args.reserve_price === "number") update.reserve_price = args.reserve_price;
    if (typeof args.inspection_required === "boolean") update.inspection_required = args.inspection_required;
    if (typeof args.pickup_address === "object" && args.pickup_address) update.pickup_address = args.pickup_address;

    const auctionMeta: Record<string, unknown> = {};
    if (typeof args.starting_bid === "number") auctionMeta.starting_bid = args.starting_bid;
    if (typeof args.bid_increment === "number") auctionMeta.bid_increment = args.bid_increment;
    if (typeof args.bidding_closes_at === "string" && args.bidding_closes_at) auctionMeta.bidding_closes_at = args.bidding_closes_at;
    if (typeof args.auction_date === "string" && args.auction_date) auctionMeta.auction_date = args.auction_date;
    if (typeof args.deposit_pct === "number") auctionMeta.deposit_pct = args.deposit_pct;

    const paymentMeta: Record<string, unknown> = {};
    if (Array.isArray(args.payment_methods)) paymentMeta.payment_methods = args.payment_methods;
    if (typeof args.require_escrow === "boolean") paymentMeta.require_escrow = args.require_escrow;
    if (typeof args.seller_province === "string" && args.seller_province) paymentMeta.seller_province = args.seller_province;
    if (typeof args.hazmat_class === "string" && args.hazmat_class) paymentMeta.hazmat_class = args.hazmat_class;
    if (typeof args.scheduled_at === "string" && args.scheduled_at) paymentMeta.scheduled_at = args.scheduled_at;

    if (supabase) {
      const { data: existing } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .select("quality_details")
        .eq("listing_id", listingId)
        .maybeSingle();
      const mergedDetails = {
        ...((existing?.quality_details as Record<string, unknown> | null) ?? {}),
        ...(Object.keys(auctionMeta).length > 0 ? { auction_config: auctionMeta } : {}),
        ...(Object.keys(paymentMeta).length > 0 ? { payment: paymentMeta } : {}),
      };
      if (Object.keys(mergedDetails).length > 0) update.quality_details = mergedDetails;

      const { data, error } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .update(update)
        .eq("listing_id", listingId)
        .select("listing_id,seller_id,status,published_at")
        .maybeSingle();
      if (error) return fail("DB_ERROR", "Database operation failed");
      if (!data) return fail("NOT_FOUND", "Listing not found");
      await emitEvent("listing.listing.published", { listing_id: listingId, seller_id: data.seller_id, scheduled: isScheduled });
      return { content: [{ type: "text", text: ok({ listing_id: listingId, status: data.status, published_at: data.published_at }) }] };
    }

    const current = listingStore.get(listingId)!;
    const updated: Listing = { ...current, status: (isScheduled ? "pending_review" : "active") as ListingStatus, published_at: isScheduled ? undefined : now() };
    listingStore.set(listingId, updated);
    await emitEvent("listing.listing.published", { listing_id: listingId, seller_id: updated.seller_id, scheduled: isScheduled });
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
    const actorId = String(args.actor_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    if (!actorId) return fail("VALIDATION_ERROR", "actor_id is required.");

    const ownerCheck = await assertListingOwner(listingId, actorId);
    if ("error" in ownerCheck) return ownerCheck.error;

    if (supabase) {
      const { error } = await supabase
        .schema("listing_mcp")
        .from("listings")
        .update({ status: "cancelled", updated_at: now() })
        .eq("listing_id", listingId);
      if (error) return fail("DB_ERROR", "Database operation failed");
      await emitEvent("listing.listing.archived", { listing_id: listingId, actor_id: actorId });
      return { content: [{ type: "text", text: ok({ listing_id: listingId, status: "archived" }) }] };
    }
    const current = listingStore.get(listingId)!;
    listingStore.set(listingId, { ...current, status: "archived" as ListingStatus });
    await emitEvent("listing.listing.archived", { listing_id: listingId, actor_id: actorId });
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
    const userId = String(args.user_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");

    if (supabase) {
      // Idempotent insert via upsert on the composite PK (user_id, listing_id).
      const { error } = await supabase
        .schema("listing_mcp")
        .from("favorites")
        .upsert({ user_id: userId, listing_id: listingId, created_at: now() }, { onConflict: "user_id,listing_id" });
      if (error) return fail("DB_ERROR", "Database operation failed");
      await emitEvent("listing.favorite.added", { listing_id: listingId, user_id: userId });
      return { content: [{ type: "text", text: ok({ listing_id: listingId, user_id: userId, favorited: true }) }] };
    }

    const set = favoritesStore.get(userId) ?? new Set<string>();
    set.add(listingId);
    favoritesStore.set(userId, set);
    await emitEvent("listing.favorite.added", { listing_id: listingId, user_id: userId });
    return { content: [{ type: "text", text: ok({ listing_id: listingId, user_id: userId, favorited: true }) }] };
  }

  if (tool === "remove_favorite") {
    const listingId = String(args.listing_id ?? "");
    const userId = String(args.user_id ?? "");
    if (!listingId) return fail("VALIDATION_ERROR", "listing_id is required.");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");

    if (supabase) {
      const { error } = await supabase
        .schema("listing_mcp")
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("listing_id", listingId);
      if (error) return fail("DB_ERROR", "Database operation failed");
      await emitEvent("listing.favorite.removed", { listing_id: listingId, user_id: userId });
      return { content: [{ type: "text", text: ok({ listing_id: listingId, user_id: userId, favorited: false }) }] };
    }
    favoritesStore.get(userId)?.delete(listingId);
    return { content: [{ type: "text", text: ok({ listing_id: listingId, user_id: userId, favorited: false }) }] };
  }

  if (tool === "list_favorites") {
    const userId = String(args.user_id ?? "");
    if (!userId) return fail("VALIDATION_ERROR", "user_id is required.");
    const limit = Math.min(Number(args.limit ?? 50), 100);
    const offset = Math.max(Number(args.offset ?? 0), 0);

    if (supabase) {
      const { data, error, count } = await supabase
        .schema("listing_mcp")
        .from("favorites")
        .select("listing_id,created_at", { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ favorites: data ?? [], total: count ?? 0, limit, offset }) }] };
    }
    const ids = Array.from(favoritesStore.get(userId) ?? []);
    return { content: [{ type: "text", text: ok({ favorites: ids.map((id) => ({ listing_id: id })), total: ids.length, limit, offset }) }] };
  }

  // ========================================================================
  // Categories (admin-gated CRUD)
  // ========================================================================
  if (tool === "create_category" || tool === "update_category") {
    const actorId = String(args.actor_id ?? "");
    if (!actorId) return fail("VALIDATION_ERROR", "actor_id is required.");
    if (supabase) {
      const { data: admin, error: aerr } = await supabase
        .schema("auth_mcp")
        .from("users")
        .select("is_platform_admin")
        .eq("user_id", actorId)
        .maybeSingle();
      if (aerr) return fail("DB_ERROR", "Database operation failed");
      if (!admin?.is_platform_admin) return fail("FORBIDDEN", "Only platform admins may manage categories.");
    }

    if (tool === "create_category") {
      const name = String(args.name ?? "").trim();
      if (!name) return fail("VALIDATION_ERROR", "name is required.");
      const slug = String(args.slug ?? "").trim() || toSlug(name);
      const categoryId = generateId();
      const payload = {
        category_id: categoryId,
        name,
        slug,
        parent_id: args.parent_id ? String(args.parent_id) : null,
        default_unit: args.default_unit ? String(args.default_unit) : null,
        weight_tolerance: args.weight_tolerance !== undefined ? Number(args.weight_tolerance) : 2.0,
        sort_order: args.sort_order !== undefined ? Number(args.sort_order) : 0,
        is_active: true,
      };
      if (supabase) {
        const { error } = await supabase.schema("listing_mcp").from("categories").insert(payload);
        if (error) return fail("DB_ERROR", "Database operation failed");
      } else {
        categoryStore.set(categoryId, payload);
      }
      await emitEvent("listing.category.created", { category_id: categoryId, name, slug });
      return { content: [{ type: "text", text: ok({ category_id: categoryId, slug }) }] };
    }

    // update_category
    const categoryId = String(args.category_id ?? "");
    if (!categoryId) return fail("VALIDATION_ERROR", "category_id is required.");
    if (typeof args.fields !== "object" || !args.fields) return fail("VALIDATION_ERROR", "fields must be an object.");
    const ALLOWED = ["name", "slug", "parent_id", "default_unit", "weight_tolerance", "sort_order", "is_active", "icon_url", "description"] as const;
    const raw = args.fields as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    for (const k of ALLOWED) if (k in raw) safe[k] = raw[k];
    if (Object.keys(safe).length === 0) return fail("VALIDATION_ERROR", "No valid fields provided.");
    if (supabase) {
      const { error } = await supabase.schema("listing_mcp").from("categories").update(safe).eq("category_id", categoryId);
      if (error) return fail("DB_ERROR", "Database operation failed");
    } else {
      const cur = categoryStore.get(categoryId);
      if (!cur) return fail("NOT_FOUND", "Category not found.");
      categoryStore.set(categoryId, { ...cur, ...safe });
    }
    await emitEvent("listing.category.updated", { category_id: categoryId });
    return { content: [{ type: "text", text: ok({ category_id: categoryId, updated: true }) }] };
  }

  if (tool === "list_categories") {
    const includeInactive = Boolean(args.include_inactive);
    const parentFilter = args.parent_id ? String(args.parent_id) : undefined;
    if (supabase) {
      let q = supabase
        .schema("listing_mcp")
        .from("categories")
        .select("category_id,name,slug,parent_id,default_unit,weight_tolerance,sort_order,is_active")
        .order("sort_order", { ascending: true });
      if (!includeInactive) q = q.eq("is_active", true);
      if (parentFilter) q = q.eq("parent_id", parentFilter);
      const { data, error } = await q;
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ categories: data ?? [] }) }] };
    }
    let rows = Array.from(categoryStore.values());
    if (!includeInactive) rows = rows.filter((c) => c.is_active !== false);
    if (parentFilter) rows = rows.filter((c) => c.parent_id === parentFilter);
    return { content: [{ type: "text", text: ok({ categories: rows }) }] };
  }

  if (tool === "get_category") {
    const categoryId = args.category_id ? String(args.category_id) : null;
    const slug = args.slug ? String(args.slug) : null;
    if (!categoryId && !slug) return fail("VALIDATION_ERROR", "category_id or slug is required.");
    if (supabase) {
      let q = supabase.schema("listing_mcp").from("categories").select("*");
      if (categoryId) q = q.eq("category_id", categoryId);
      else q = q.eq("slug", slug);
      const { data, error } = await q.maybeSingle();
      if (error) return fail("DB_ERROR", "Database operation failed");
      return { content: [{ type: "text", text: ok({ category: data ?? null }) }] };
    }
    if (categoryId) return { content: [{ type: "text", text: ok({ category: categoryStore.get(categoryId) ?? null }) }] };
    const found = Array.from(categoryStore.values()).find((c) => c.slug === slug) ?? null;
    return { content: [{ type: "text", text: ok({ category: found }) }] };
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
