// Search domain — Supabase Edge Function (Deno).
// Tool parity with packages/mcp-servers/search-mcp/src/index.ts (DB branches).
// Note: index_listing/remove_from_index are no-ops in DB-backed mode; the
// source of truth is listing_mcp.listings. They remain in the surface for
// parity but return success envelopes without side-effects.

import { failEnvelope, generateId, now, okEnvelope } from "../_shared/logic.ts";
import { serviceClient } from "../_shared/db.ts";
import { emitEvent } from "../_shared/events.ts";
import { serveDomain, type ToolRequest } from "../_shared/handler.ts";

const SOURCE = "search-edge";

async function ping() {
  return okEnvelope({ status: "ok", server: SOURCE, timestamp: now() });
}

async function searchMaterials({ args }: ToolRequest) {
  const supabase = serviceClient();
  const query = String(args.query ?? "").toLowerCase().trim();
  const limit = Math.min(Number(args.limit ?? 50), 100);
  const offset = Math.max(Number(args.offset ?? 0), 0);

  let dbQuery = supabase
    .schema("listing_mcp")
    .from("listings")
    .select(
      "listing_id,title,description,category_id,asking_price,status,quantity,unit,images,created_at",
      { count: "exact" },
    )
    .eq("status", "active")
    .range(offset, offset + limit - 1);
  if (query) dbQuery = dbQuery.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
  if (typeof args.price_min === "number") dbQuery = dbQuery.gte("asking_price", args.price_min);
  if (typeof args.price_max === "number") dbQuery = dbQuery.lte("asking_price", args.price_max);
  const { data, error, count } = await dbQuery;
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ results: data ?? [], total: count ?? 0, limit, offset });
}

async function geoSearch({ args }: ToolRequest) {
  const supabase = serviceClient();
  const lat = Number(args.lat ?? 0);
  const lng = Number(args.lng ?? 0);
  const radiusKm = Number(args.radius_km ?? 0);
  const limit = Math.min(Number(args.limit ?? 50), 100);
  const offset = Math.max(Number(args.offset ?? 0), 0);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusKm) || radiusKm <= 0) {
    return failEnvelope("VALIDATION_ERROR", "lat, lng, and radius_km must be valid numbers and radius_km > 0.");
  }
  const { data, error, count } = await supabase
    .schema("listing_mcp")
    .from("listings")
    .select("listing_id,title,description,category_id,asking_price,pickup_address,status", { count: "exact" })
    .eq("status", "active")
    .range(offset, offset + limit - 1);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ results: data ?? [], total: count ?? 0, limit, offset, note: "PostGIS radius filter pending migration" });
}

async function filterByCategory({ args }: ToolRequest) {
  const supabase = serviceClient();
  const category = String(args.category ?? "").toLowerCase();
  if (!category) return failEnvelope("VALIDATION_ERROR", "category is required.");
  const limit = Math.min(Number(args.limit ?? 50), 100);
  const offset = Math.max(Number(args.offset ?? 0), 0);
  const { data, error, count } = await supabase
    .schema("listing_mcp")
    .from("listings")
    .select("*", { count: "exact" })
    .eq("status", "active")
    .eq("category_id", category)
    .range(offset, offset + limit - 1);
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ results: data ?? [], total: count ?? 0, limit, offset });
}

async function saveSearch({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  if (!userId) return failEnvelope("VALIDATION_ERROR", "user_id is required.");
  const savedSearchId = generateId();
  const { error } = await supabase.schema("listing_mcp").from("saved_searches").insert({
    saved_search_id: savedSearchId,
    user_id: userId,
    query: String(args.query ?? ""),
    filters: (args.filters ?? {}) as Record<string, unknown>,
  });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  await emitEvent(supabase, SOURCE, "search.saved_search.created", { user_id: userId, saved_search_id: savedSearchId });
  return okEnvelope({ saved_search_id: savedSearchId });
}

async function getSavedSearches({ args, caller }: ToolRequest) {
  const supabase = serviceClient();
  const userId = String(args.user_id ?? caller.userId);
  const { data, error } = await supabase
    .schema("listing_mcp")
    .from("saved_searches")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return failEnvelope("DB_ERROR", "Database operation failed");
  return okEnvelope({ saved_searches: data ?? [], total: (data ?? []).length });
}

async function indexListing({ args }: ToolRequest) {
  // No-op in DB-backed mode: listing_mcp.listings is the source of truth.
  // Kept for tool-surface parity with search-mcp.
  return okEnvelope({ indexed: true, listing_id: String(args.listing_id ?? ""), note: "no-op in db mode" });
}

async function removeFromIndex({ args }: ToolRequest) {
  return okEnvelope({ removed: true, listing_id: String(args.listing_id ?? ""), note: "no-op in db mode" });
}

Deno.serve(serveDomain({
  ping,
  search_materials: searchMaterials,
  geo_search: geoSearch,
  filter_by_category: filterByCategory,
  save_search: saveSearch,
  get_saved_searches: getSavedSearches,
  index_listing: indexListing,
  remove_from_index: removeFromIndex,
}));
