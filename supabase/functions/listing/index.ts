// Listing domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/listing-mcp/src/index.ts (DB branches).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { isPlatformAdmin } from "../_shared/auth.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "listing-edge";

function toSlug(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

async function assertListingOwner(
  supabase: SupabaseClient,
  listingId: string,
  actorId: string,
): Promise<{ ok: true; listing: { listing_id: string; seller_id: string; status: string } } | { ok: false; envelope: ReturnType<typeof failEnvelope> }> {
  const { data: listing, error } = await supabase
    .schema("listing_mcp")
    .from("listings")
    .select("listing_id,seller_id,status")
    .eq("listing_id", listingId)
    .maybeSingle();
  if (error) return { ok: false, envelope: failEnvelope("DB_ERROR", "Database operation failed") };
  if (!listing) return { ok: false, envelope: failEnvelope("NOT_FOUND", "Listing not found") };
  if (listing.seller_id !== actorId) {
    if (!(await isPlatformAdmin(supabase, actorId))) {
      return { ok: false, envelope: failEnvelope("FORBIDDEN", "Only the seller or a platform admin may modify this listing.") };
    }
  }
  return { ok: true, listing };
}

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function createListing({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const sellerId = String(args.seller_id ?? caller.userId);
  const title = String(args.title ?? "").trim();
  const description = String(args.description ?? "").trim();
  const quantity = Number(args.quantity ?? 0);
  if (!sellerId) return failEnvelope("VALIDATION_ERROR", "seller_id is required.");
  if (!title) return failEnvelope("VALIDATION_ERROR", "title is required.");
  if (!description) return failEnvelope("VALIDATION_ERROR", "description is required.");
  if (quantity <= 0) return failEnvelope("VALIDATION_ERROR", "quantity must be greater than 0.");

  let categoryId = args.category_id ? String(args.category_id) : "";
  if (!categoryId && args.category) {
    const slugOrName = String(args.category).trim();
    const { data: cat, error: catError } = await supabase
      .schema("listing_mcp")
      .from("categories")
      .select("category_id")
      .or(`slug.eq.${slugOrName},name.eq.${slugOrName}`)
      .limit(1)
      .maybeSingle();
    if (catError) return failEnvelope("DB_ERROR", "Database operation failed");
    if (cat?.category_id) categoryId = String(cat.category_id);
  }
  if (!categoryId) return failEnvelope("VALIDATION_ERROR", "category_id (or a known category slug/name) is required.");

  const allowedStatuses = ["draft", "pending_review"];
  const requestedStatus = args.status ? String(args.status) : "draft";
  const status = allowedStatuses.includes(requestedStatus) ? requestedStatus : "draft";

  const allowedPriceTypes = ["fixed", "auction", "negotiable"];
  const incomingPriceType = args.price_type ? String(args.price_type) : "fixed";
  const mappedPriceType = incomingPriceType === "bidding" ? "auction" : incomingPriceType;
  const priceType = allowedPriceTypes.includes(mappedPriceType) ? mappedPriceType : "fixed";

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
    ? args.pickup_address
    : { street: "", city: "", province: "ON", postal_code: "", country: "CA" };

  const listingId = generateId();
  const slug = `${toSlug(title || "listing")}-${listingId.slice(0, 8)}`;
  const insertPayload: Record<string, unknown> = {
    listing_id: listingId,
    seller_id: sellerId,
    title,
    slug,
    category_id: categoryId,
    subcategory_id: args.subcategory_id ? String(args.subcategory_id) : null,
    description,
    quantity,
    unit: String(args.unit ?? "kg"),
    price_type: priceType,
    asking_price: typeof args.asking_price === "number" ? args.asking_price : null,
    reserve_price: typeof args.reserve_price === "number" ? args.reserve_price : null,
    buy_now_price: typeof args.buy_now_price === "number" ? args.buy_now_price : null,
    quality_grade: args.quality_grade ? String(args.quality_grade) : null,
    quality_details: Object.keys(qualityDetails).length > 0 ? qualityDetails : null,
    certifications,
    environmental_permits: environmentalPermits,
    images: [],
    location: "SRID=4326;POINT(0 0)",
    pickup_address: pickupAddress,
    inspection_required: args.inspection_required === true,
    available_from: args.available_from ? String(args.available_from) : null,
    expires_at: args.expires_at ? String(args.expires_at) : null,
    status,
  };
  const { error } = await supabase.schema("listing_mcp").from("listings").insert(insertPayload);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "listing.listing.created", { listing_id: listingId, seller_id: sellerId });
  return okEnvelope({ listing_id: listingId, status });
}

async function updateListing({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const listingId = String(args.listing_id ?? "");
  const actorId = String(args.actor_id ?? caller.userId);
  if (!listingId) return failEnvelope("VALIDATION_ERROR", "listing_id is required.");
  if (!actorId) return failEnvelope("VALIDATION_ERROR", "actor_id is required.");
  if (typeof args.fields !== "object" || !args.fields) return failEnvelope("VALIDATION_ERROR", "fields must be an object.");

  const owner = await assertListingOwner(supabase, listingId, actorId);
  if (!owner.ok) return owner.envelope;

  const ALLOWED = ["title", "description", "asking_price", "quantity"] as const;
  const raw = args.fields as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const k of ALLOWED) if (k in raw) safe[k] = raw[k];
  if (Object.keys(safe).length === 0) {
    return failEnvelope("VALIDATION_ERROR", "No valid fields provided. Allowed: title, description, asking_price, quantity.");
  }

  const { error } = await supabase
    .schema("listing_mcp")
    .from("listings")
    .update({ ...safe, updated_at: now() })
    .eq("listing_id", listingId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "listing.listing.updated", { listing_id: listingId, actor_id: actorId });
  return okEnvelope({ listing_id: listingId, updated: true });
}

async function uploadImages({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const listingId = String(args.listing_id ?? "");
  const actorId = String(args.actor_id ?? caller.userId);
  if (!listingId) return failEnvelope("VALIDATION_ERROR", "listing_id is required.");
  if (!actorId) return failEnvelope("VALIDATION_ERROR", "actor_id is required.");
  if (!Array.isArray(args.images) || args.images.length === 0) {
    return failEnvelope("VALIDATION_ERROR", "images must be a non-empty array.");
  }
  const owner = await assertListingOwner(supabase, listingId, actorId);
  if (!owner.ok) return owner.envelope;

  const images = args.images.map((img: unknown, idx: number) => ({
    url: String((img as { url?: string }).url ?? img),
    order: idx + 1,
    alt_text: `Listing image ${idx + 1}`,
  }));
  const { error } = await supabase
    .schema("listing_mcp")
    .from("listings")
    .update({ images })
    .eq("listing_id", listingId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "listing.images.uploaded", { listing_id: listingId, images_count: images.length });
  return okEnvelope({ listing_id: listingId, images_count: images.length });
}

async function publishListing({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const listingId = String(args.listing_id ?? "");
  const actorId = String(args.actor_id ?? caller.userId);
  if (!listingId) return failEnvelope("VALIDATION_ERROR", "listing_id is required.");
  if (!actorId) return failEnvelope("VALIDATION_ERROR", "actor_id is required.");

  const owner = await assertListingOwner(supabase, listingId, actorId);
  if (!owner.ok) return owner.envelope;

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
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  if (!data) return failEnvelope("NOT_FOUND", "Listing not found");
  await emitEvent(supabase, SOURCE, "listing.listing.published", {
    listing_id: listingId,
    seller_id: data.seller_id,
    scheduled: isScheduled,
  });
  return okEnvelope({ listing_id: listingId, status: data.status, published_at: data.published_at });
}

async function archiveListing({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const listingId = String(args.listing_id ?? "");
  const actorId = String(args.actor_id ?? caller.userId);
  if (!listingId) return failEnvelope("VALIDATION_ERROR", "listing_id is required.");
  if (!actorId) return failEnvelope("VALIDATION_ERROR", "actor_id is required.");

  const owner = await assertListingOwner(supabase, listingId, actorId);
  if (!owner.ok) return owner.envelope;

  const { error } = await supabase
    .schema("listing_mcp")
    .from("listings")
    .update({ status: "cancelled", updated_at: now() })
    .eq("listing_id", listingId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "listing.listing.archived", { listing_id: listingId, actor_id: actorId });
  return okEnvelope({ listing_id: listingId, status: "archived" });
}

async function getListing({ args }: ToolRequest) {
  const supabase = serviceClient();
  const listingId = String(args.listing_id ?? "");
  if (!listingId) return failEnvelope("VALIDATION_ERROR", "listing_id is required.");
  const { data, error } = await supabase
    .schema("listing_mcp")
    .from("listings")
    .select("*")
    .eq("listing_id", listingId)
    .maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ listing: data ?? null });
}

async function getMyListings({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const sellerId = String(args.seller_id ?? caller.userId);
  if (!sellerId) return failEnvelope("VALIDATION_ERROR", "seller_id is required.");
  const limit = Math.min(Number(args.limit ?? 50), 100);
  const offset = Math.max(Number(args.offset ?? 0), 0);
  const statusFilter = args.status ? String(args.status) : "";
  let query = supabase
    .schema("listing_mcp")
    .from("listings")
    .select("*", { count: "exact" })
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data, error, count } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ listings: data ?? [], total: count ?? 0, limit, offset });
}

async function listListings({ args }: ToolRequest) {
  const supabase = serviceClient();
  const limit = Math.min(Number(args.limit ?? 50), 100);
  const offset = Math.max(Number(args.offset ?? 0), 0);
  const categoryFilter = args.category_id ? String(args.category_id) : "";
  const priceMin = typeof args.price_min === "number" ? args.price_min : undefined;
  const priceMax = typeof args.price_max === "number" ? args.price_max : undefined;
  let query = supabase
    .schema("listing_mcp")
    .from("listings")
    .select(
      "listing_id,seller_id,title,category_id,description,quantity,unit,price_type,asking_price,images,status,created_at,published_at",
      { count: "exact" },
    )
    .eq("status", "active")
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (categoryFilter) query = query.eq("category_id", categoryFilter);
  if (priceMin !== undefined) query = query.gte("asking_price", priceMin);
  if (priceMax !== undefined) query = query.lte("asking_price", priceMax);
  const { data, error, count } = await query;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ listings: data ?? [], total: count ?? 0, limit, offset });
}

async function addFavorite({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const listingId = String(args.listing_id ?? "");
  const userId = String(args.user_id ?? caller.userId);
  if (!listingId) return failEnvelope("VALIDATION_ERROR", "listing_id is required.");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const { error } = await supabase
    .schema("listing_mcp")
    .from("favorites")
    .upsert({ user_id: userId, listing_id: listingId, created_at: now() }, { onConflict: "user_id,listing_id" });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "listing.favorite.added", { listing_id: listingId, user_id: userId });
  return okEnvelope({ listing_id: listingId, user_id: userId, favorited: true });
}

async function removeFavorite({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const listingId = String(args.listing_id ?? "");
  const userId = String(args.user_id ?? caller.userId);
  if (!listingId) return failEnvelope("VALIDATION_ERROR", "listing_id is required.");
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const { error } = await supabase
    .schema("listing_mcp")
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("listing_id", listingId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "listing.favorite.removed", { listing_id: listingId, user_id: userId });
  return okEnvelope({ listing_id: listingId, user_id: userId, favorited: false });
}

async function listFavorites({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const limit = Math.min(Number(args.limit ?? 50), 100);
  const offset = Math.max(Number(args.offset ?? 0), 0);
  const { data, error, count } = await supabase
    .schema("listing_mcp")
    .from("favorites")
    .select("listing_id,created_at", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ favorites: data ?? [], total: count ?? 0, limit, offset });
}

async function createCategory({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const actorId = String(args.actor_id ?? caller.userId);
  if (!actorId) return failEnvelope("VALIDATION_ERROR", "actor_id is required.");
  if (!(await isPlatformAdmin(supabase, actorId))) {
    return failEnvelope("FORBIDDEN", "Only platform admins may manage categories.");
  }
  const name = String(args.name ?? "").trim();
  if (!name) return failEnvelope("VALIDATION_ERROR", "name is required.");
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
  const { error } = await supabase.schema("listing_mcp").from("categories").insert(payload);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "listing.category.created", { category_id: categoryId, name, slug });
  return okEnvelope({ category_id: categoryId, slug });
}

async function updateCategory({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const actorId = String(args.actor_id ?? caller.userId);
  if (!actorId) return failEnvelope("VALIDATION_ERROR", "actor_id is required.");
  if (!(await isPlatformAdmin(supabase, actorId))) {
    return failEnvelope("FORBIDDEN", "Only platform admins may manage categories.");
  }
  const categoryId = String(args.category_id ?? "");
  if (!categoryId) return failEnvelope("VALIDATION_ERROR", "category_id is required.");
  if (typeof args.fields !== "object" || !args.fields) return failEnvelope("VALIDATION_ERROR", "fields must be an object.");
  const ALLOWED = ["name", "slug", "parent_id", "default_unit", "weight_tolerance", "sort_order", "is_active", "icon_url", "description"] as const;
  const raw = args.fields as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const k of ALLOWED) if (k in raw) safe[k] = raw[k];
  if (Object.keys(safe).length === 0) return failEnvelope("VALIDATION_ERROR", "No valid fields provided.");
  const { error } = await supabase.schema("listing_mcp").from("categories").update(safe).eq("category_id", categoryId);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "listing.category.updated", { category_id: categoryId });
  return okEnvelope({ category_id: categoryId, updated: true });
}

async function listCategories({ args }: ToolRequest) {
  const supabase = serviceClient();
  const includeInactive = Boolean(args.include_inactive);
  const parentFilter = args.parent_id ? String(args.parent_id) : "";
  let q = supabase
    .schema("listing_mcp")
    .from("categories")
    .select("category_id,name,slug,parent_id,default_unit,weight_tolerance,sort_order,is_active")
    .order("sort_order", { ascending: true });
  if (!includeInactive) q = q.eq("is_active", true);
  if (parentFilter) q = q.eq("parent_id", parentFilter);
  const { data, error } = await q;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ categories: data ?? [] });
}

async function getCategory({ args }: ToolRequest) {
  const supabase = serviceClient();
  const categoryId = args.category_id ? String(args.category_id) : "";
  const slug = args.slug ? String(args.slug) : "";
  if (!categoryId && !slug) return failEnvelope("VALIDATION_ERROR", "category_id or slug is required.");
  let q = supabase.schema("listing_mcp").from("categories").select("*");
  if (categoryId) q = q.eq("category_id", categoryId);
  else q = q.eq("slug", slug);
  const { data, error } = await q.maybeSingle();
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ category: data ?? null });
}

Deno.serve(serveDomain({
  ping,
  create_listing: createListing,
  update_listing: updateListing,
  upload_images: uploadImages,
  publish_listing: publishListing,
  archive_listing: archiveListing,
  get_listing: getListing,
  get_my_listings: getMyListings,
  list_listings: listListings,
  add_favorite: addFavorite,
  remove_favorite: removeFavorite,
  list_favorites: listFavorites,
  create_category: createCategory,
  update_category: updateCategory,
  list_categories: listCategories,
  get_category: getCategory,
}));
