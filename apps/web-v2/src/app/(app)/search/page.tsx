"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Search,
  Heart,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  BookmarkPlus,
  SlidersHorizontal,
  X,
  Clock,
  Package,
  AlertCircle,
} from "lucide-react";
import clsx from "clsx";
import { callTool, getUser, extractId, type MCPResponse } from "@/lib/api";
import { Badge } from "@/components/ui/shadcn/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/Sheet";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { EmptyState as EmptyIllustration } from "@/components/ui/EmptyState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SaleMode = "fixed" | "bidding" | "auction";
type MaterialType = "scrap" | "surplus" | "both";
type SortOption = "newest" | "price_asc" | "price_desc" | "ending_soon";

type ListingResult = {
  listing_id: string;
  title: string;
  sale_mode: SaleMode;
  price: number;
  unit: string;
  quantity: number;
  material_grade: string;
  seller_province: string;
  inspection_required: boolean;
  photo_url?: string;
  created_at: string;
  // Bidding fields
  current_bid?: number;
  bid_count?: number;
  bidding_ends_at?: string;
  // Auction fields
  auction_session_date?: string;
  // Pricing context
  currency?: string;
};

type SavedSearch = {
  saved_search_id: string;
  name: string;
  query: string;
  filters: Record<string, unknown>;
  created_at: string;
};

const CANADIAN_PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland & Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Québec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
];

const MATERIAL_CATEGORIES: { name: string; icon: string | null }[] = [
  { name: "Ferrous Metals", icon: "/icons/categories/ferrous-metals.png" },
  { name: "Non-Ferrous Metals", icon: "/icons/categories/non-ferrous-metals.png" },
  { name: "Precious Metals", icon: "/icons/categories/precious-metals.png" },
  { name: "Plastics", icon: "/icons/categories/plastics.png" },
  { name: "Paper & Cardboard", icon: "/icons/categories/paper-cardboard.png" },
  { name: "E-Waste", icon: "/icons/categories/electronics.png" },
  { name: "Construction", icon: "/icons/categories/construction.png" },
  { name: "Rubber", icon: "/icons/categories/rubber.png" },
  { name: "Other", icon: null },
];

const SALE_MODE_CONFIG: Record<SaleMode, { label: string; variant: "success" | "info" | "warning"; color: string }> = {
  fixed: { label: "Fixed Price", variant: "success", color: "bg-emerald-500" },
  bidding: { label: "Bidding", variant: "info", color: "bg-blue-500" },
  auction: { label: "Auction", variant: "warning", color: "bg-amber-500" },
};

/** Gateway returns `{ upstream_response: { data: { results } } }` when forwarded to the HTTP adapter. */
function extractForwardedData(res: MCPResponse): Record<string, unknown> | undefined {
  const d = res.data as Record<string, unknown> | undefined;
  const up = d?.upstream_response as Record<string, unknown> | undefined;
  const inner = up?.data ?? d;
  return inner && typeof inner === "object" ? (inner as Record<string, unknown>) : undefined;
}

function extractSearchResults(res: MCPResponse): ListingResult[] {
  const inner = extractForwardedData(res);
  const results = inner?.results;
  if (Array.isArray(results)) return results as ListingResult[];
  return [];
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Listing Card
// ---------------------------------------------------------------------------
function ListingCard({
  listing,
  onMessageSeller,
  onSave,
}: {
  listing: ListingResult;
  onMessageSeller: (listingId: string, title: string) => void;
  onSave: (listingId: string) => void;
}) {
  const saleConfig = SALE_MODE_CONFIG[listing.sale_mode];
  const gradientColors = [
    "from-slate-200 to-slate-300",
    "from-blue-100 to-blue-200",
    "from-emerald-100 to-emerald-200",
    "from-amber-100 to-amber-200",
  ];
  const gradientIdx = listing.listing_id.charCodeAt(0) % gradientColors.length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      {/* Photo */}
      <div className="relative h-44">
        {listing.photo_url ? (
          <img src={listing.photo_url} alt={listing.title} className="w-full h-full object-cover" />
        ) : (
          <div className={clsx("w-full h-full bg-gradient-to-br flex items-center justify-center", gradientColors[gradientIdx])}>
            <Package size={36} className="text-gray-400" />
          </div>
        )}
        {/* Sale mode badge */}
        <span className={clsx("absolute top-2 left-2 text-white text-xs font-semibold px-2 py-0.5 rounded-full", saleConfig.color)}>
          {saleConfig.label}
        </span>
        {/* Save button */}
        <button
          onClick={() => onSave(listing.listing_id)}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center hover:bg-white transition-colors shadow-sm"
          aria-label="Save listing"
        >
          <Heart size={14} className="text-gray-500 hover:text-red-500 transition-colors" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1 gap-2">
        {/* Title + Province */}
        <div className="flex items-start gap-2">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug flex-1 line-clamp-2">{listing.title}</h3>
          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
            {listing.seller_province}
          </span>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-brand-600">
            ${listing.price.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-gray-500">CAD / {listing.unit}</span>
        </div>

        {/* Specs row */}
        <div className="flex flex-wrap gap-1.5 text-xs text-gray-600">
          <span className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">{listing.material_grade}</span>
          <span className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">
            {listing.quantity.toLocaleString()} {listing.unit}
          </span>
        </div>

        {/* Inspection badge */}
        {listing.inspection_required && (
          <Badge variant="warning" className="self-start">Inspection Required</Badge>
        )}

        {/* Bidding-specific info */}
        {listing.sale_mode === "bidding" && listing.bidding_ends_at && (
          <div className="flex items-center justify-between text-xs bg-blue-50 rounded-lg px-3 py-2">
            <div>
              <p className="text-gray-500">Current Bid</p>
              <p className="font-semibold text-blue-700">
                ${(listing.current_bid ?? listing.price).toLocaleString("en-CA", { minimumFractionDigits: 2 })} CAD
              </p>
              <p className="text-gray-400 mt-0.5">{listing.bid_count ?? 0} bids</p>
            </div>
            <div className="text-right">
              <p className="text-gray-500">Ends in</p>
              <CountdownTimer targetDate={listing.bidding_ends_at} />
            </div>
          </div>
        )}

        {/* Auction-specific info */}
        {listing.sale_mode === "auction" && listing.auction_session_date && (
          <div className="flex items-center justify-between text-xs bg-amber-50 rounded-lg px-3 py-2">
            <div>
              <p className="text-gray-500">Session</p>
              <p className="font-medium text-amber-800">
                {new Date(listing.auction_session_date).toLocaleDateString("en-CA", {
                  month: "short", day: "numeric", year: "numeric",
                })}
              </p>
            </div>
            <Link
              href={`/auction?session=${listing.auction_session_date}`}
              className="text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded-md transition-colors"
            >
              Register →
            </Link>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-auto pt-2">
          <Link
            href={`/listings/${listing.listing_id}`}
            className="flex-1 text-center text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 py-1.5 rounded-lg transition-colors"
          >
            View Details
          </Link>
          <button
            onClick={() => onMessageSeller(listing.listing_id, listing.title)}
            className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 px-2 py-1.5 rounded-lg transition-colors"
            aria-label="Message seller"
          >
            <MessageSquare size={13} />
            <span>Message</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter Sidebar
// ---------------------------------------------------------------------------
function FilterSidebar({
  query,
  setQuery,
  categories,
  setCategories,
  materialType,
  setMaterialType,
  provinces,
  setProvinces,
  priceMin,
  setPriceMin,
  priceMax,
  setPriceMax,
  weightMin,
  setWeightMin,
  weightMax,
  setWeightMax,
  weightUnit,
  setWeightUnit,
  saleModes,
  setSaleModes,
  inspectionOnly,
  setInspectionOnly,
  sort,
  setSort,
  onSearch,
  onSaveSearch,
  savingSearch,
}: {
  query: string;
  setQuery: (v: string) => void;
  categories: string[];
  setCategories: (v: string[]) => void;
  materialType: MaterialType;
  setMaterialType: (v: MaterialType) => void;
  provinces: string[];
  setProvinces: (v: string[]) => void;
  priceMin: string;
  setPriceMin: (v: string) => void;
  priceMax: string;
  setPriceMax: (v: string) => void;
  weightMin: string;
  setWeightMin: (v: string) => void;
  weightMax: string;
  setWeightMax: (v: string) => void;
  weightUnit: string;
  setWeightUnit: (v: string) => void;
  saleModes: SaleMode[];
  setSaleModes: (v: SaleMode[]) => void;
  inspectionOnly: boolean;
  setInspectionOnly: (v: boolean) => void;
  sort: SortOption;
  setSort: (v: SortOption) => void;
  onSearch: () => void;
  onSaveSearch: () => void;
  savingSearch: boolean;
}) {
  function toggleCategory(cat: string) {
    setCategories(
      categories.includes(cat) ? categories.filter((c) => c !== cat) : [...categories, cat]
    );
  }
  function toggleProvince(code: string) {
    setProvinces(
      provinces.includes(code) ? provinces.filter((p) => p !== code) : [...provinces, code]
    );
  }
  function toggleSaleMode(mode: SaleMode) {
    setSaleModes(
      saleModes.includes(mode) ? saleModes.filter((m) => m !== mode) : [...saleModes, mode]
    );
  }

  return (
    <aside className="marketplace-card sticky top-24 h-fit max-h-[calc(100vh-7rem)] w-[260px] flex-shrink-0 space-y-5 overflow-y-auto p-4">
      {/* Search query */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Search</label>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            placeholder="Materials, grades…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); onSearch(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Category</label>
        <div className="flex flex-wrap gap-1.5">
          {MATERIAL_CATEGORIES.map((cat) => {
            const active = categories.includes(cat.name);
            return (
              <button
                key={cat.name}
                onClick={() => toggleCategory(cat.name)}
                className={clsx(
                  "inline-flex items-center gap-1.5 text-xs pl-1.5 pr-2.5 py-1 rounded-full border transition-colors",
                  active
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-brand-400",
                )}
              >
                {cat.icon ? (
                  <span
                    className={clsx(
                      "flex h-5 w-5 items-center justify-center rounded-full overflow-hidden",
                      active ? "bg-white/20" : "bg-steel-50",
                    )}
                  >
                    <Image src={cat.icon} alt="" width={20} height={20} className="object-contain" />
                  </span>
                ) : null}
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Material type */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Material Type</label>
        <div className="space-y-1">
          {(["scrap", "surplus", "both"] as MaterialType[]).map((t) => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="material_type"
                value={t}
                checked={materialType === t}
                onChange={() => setMaterialType(t)}
                className="text-brand-600 focus:ring-brand-400"
              />
              <span className="text-sm text-gray-700 capitalize">{t === "both" ? "Scrap & Surplus" : t}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Province */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Province</label>
        <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
          {CANADIAN_PROVINCES.map((p) => (
            <label key={p.code} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={provinces.includes(p.code)}
                onChange={() => toggleProvince(p.code)}
                className="rounded text-brand-600 focus:ring-brand-400"
              />
              <span className="text-xs text-gray-700">{p.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Price range */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Price (CAD)</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder="Min"
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <span className="text-gray-400 text-xs flex-shrink-0">to</span>
          <input
            type="number"
            min={0}
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder="Max"
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
      </div>

      {/* Weight range */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Weight</label>
          <select
            value={weightUnit}
            onChange={(e) => setWeightUnit(e.target.value)}
            className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-brand-400 text-gray-600"
          >
            {["kg", "lb", "tonne", "MT"].map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={weightMin}
            onChange={(e) => setWeightMin(e.target.value)}
            placeholder="Min"
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <span className="text-gray-400 text-xs flex-shrink-0">to</span>
          <input
            type="number"
            min={0}
            value={weightMax}
            onChange={(e) => setWeightMax(e.target.value)}
            placeholder="Max"
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
      </div>

      {/* Sale mode */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Sale Mode</label>
        <div className="space-y-1">
          {(["fixed", "bidding", "auction"] as SaleMode[]).map((mode) => (
            <label key={mode} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saleModes.includes(mode)}
                onChange={() => toggleSaleMode(mode)}
                className="rounded text-brand-600 focus:ring-brand-400"
              />
              <span className={clsx("inline-block w-2 h-2 rounded-full flex-shrink-0", SALE_MODE_CONFIG[mode].color)} />
              <span className="text-sm text-gray-700">{SALE_MODE_CONFIG[mode].label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Inspection required */}
      <div>
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Inspection Required</span>
          <div
            role="switch"
            aria-checked={inspectionOnly}
            onClick={() => setInspectionOnly(!inspectionOnly)}
            className={clsx(
              "relative w-10 h-5 rounded-full transition-colors cursor-pointer",
              inspectionOnly ? "bg-brand-600" : "bg-gray-200"
            )}
          >
            <span
              className={clsx(
                "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                inspectionOnly ? "translate-x-5" : "translate-x-0.5"
              )}
            />
          </div>
        </label>
      </div>

      {/* Sort */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Sort By</label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400 text-gray-700 bg-white"
        >
          <option value="newest">Newest First</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="ending_soon">Ending Soon</option>
        </select>
      </div>

      {/* Divider */}
      <hr className="border-gray-100" />

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={onSearch}
          className="w-full py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
        >
          Apply Filters
        </button>
        <button
          onClick={onSaveSearch}
          disabled={savingSearch}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <BookmarkPlus size={14} />
          {savingSearch ? "Saving…" : "Save This Search"}
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Saved Searches Panel
// ---------------------------------------------------------------------------
function SavedSearchesPanel({
  searches,
  onLoad,
}: {
  searches: SavedSearch[];
  onLoad: (s: SavedSearch) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!searches.length) return null;

  return (
    <div className="marketplace-card mb-5 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <BookmarkPlus size={15} className="text-brand-600" />
          <span>Saved Searches</span>
          <span className="bg-brand-100 text-brand-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
            {searches.length}
          </span>
        </div>
        {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>
      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {searches.map((s) => (
            <button
              key={s.saved_search_id}
              onClick={() => onLoad(s)}
              className="w-full text-left px-4 py-2.5 hover:bg-brand-50 transition-colors flex items-center justify-between group"
            >
              <div>
                <p className="text-sm font-medium text-gray-800 group-hover:text-brand-700">{s.name || s.query || "Untitled Search"}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  <Clock size={10} className="inline mr-1" />
                  {new Date(s.created_at).toLocaleDateString("en-CA")}
                </p>
              </div>
              <span className="text-xs text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity">Load →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------
const SUGGESTED_SEARCHES = [
  "Copper scrap",
  "Aluminum billets",
  "Steel coil",
  "Stainless 304",
  "Brass fittings",
  "Iron ore",
];

function SearchEmptyState({ query, onSuggest }: { query: string; onSuggest?: (q: string) => void }) {
  return (
    <div className="space-y-6">
      <EmptyIllustration
        image="/illustrations/empty-search.png"
        title="No listings found"
        description={
          query
            ? `No results for "${query}". Try adjusting your filters or broadening your search.`
            : "No materials match your current filters. Try removing some to see more results."
        }
        size="lg"
      />
      {onSuggest && (
        <div className="mx-auto max-w-lg text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-steel-500">
            Try searching for
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTED_SEARCHES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggest(s)}
                className="rounded-full border border-steel-200 bg-white px-4 py-1.5 text-sm text-steel-700 shadow-sm transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filter state
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [categories, setCategories] = useState<string[]>([]);
  const [materialType, setMaterialType] = useState<MaterialType>("both");
  const [provinces, setProvinces] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [weightMin, setWeightMin] = useState("");
  const [weightMax, setWeightMax] = useState("");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [saleModes, setSaleModes] = useState<SaleMode[]>([]);
  const [inspectionOnly, setInspectionOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>("newest");

  // Results state
  const [results, setResults] = useState<ListingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savingSearch, setSavingSearch] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const debouncedQuery = useDebounce(query, 500);
  const hasTriggeredInitial = useRef(false);

  // Load saved searches on mount
  useEffect(() => {
    async function loadSavedSearches() {
      const user = getUser();
      if (!user) return;
      const res = await callTool("search.get_saved_searches", { user_id: user.userId });
      const inner = extractForwardedData(res);
      const list = inner?.saved_searches;
      if (res.success && Array.isArray(list)) {
        setSavedSearches(list as SavedSearch[]);
      }
    }
    loadSavedSearches();
  }, []);

  const runSearch = useCallback(async (overrideQuery?: string) => {
    setLoading(true);
    setSearched(true);

    const searchQuery = overrideQuery !== undefined ? overrideQuery : query;
    const args: Record<string, unknown> = {
      query: searchQuery,
      sort_by: sort,
    };
    if (categories.length) args.categories = categories;
    if (materialType !== "both") args.material_type = materialType;
    if (provinces.length) args.provinces = provinces;
    if (priceMin) args.price_min = parseFloat(priceMin);
    if (priceMax) args.price_max = parseFloat(priceMax);
    if (weightMin) args.weight_min = parseFloat(weightMin);
    if (weightMax) args.weight_max = parseFloat(weightMax);
    if (weightMin || weightMax) args.weight_unit = weightUnit;
    if (saleModes.length) args.sale_modes = saleModes;
    if (inspectionOnly) args.inspection_required = true;

    const res = await callTool("search.search_materials", args);
    if (res.success) {
      setResults(extractSearchResults(res));
    } else {
      setResults([]);
    }
    setLoading(false);
  }, [query, sort, categories, materialType, provinces, priceMin, priceMax, weightMin, weightMax, weightUnit, saleModes, inspectionOnly]);

  // Auto-search on mount
  useEffect(() => {
    if (!hasTriggeredInitial.current) {
      hasTriggeredInitial.current = true;
      runSearch(query);
    }
  }, []);

  // Debounce re-search on query change
  useEffect(() => {
    if (hasTriggeredInitial.current) {
      runSearch(debouncedQuery);
    }
  }, [debouncedQuery]);

  async function handleMessageSeller(listingId: string, title: string) {
    const user = getUser();
    if (!user) return;
    const res = await callTool("messaging.create_thread", {
      listing_id: listingId,
      subject: `Inquiry about: ${title}`,
    });
    if (res.success) {
      const threadId = extractId(res, "thread_id");
      router.push(threadId ? `/messages?thread=${threadId}` : "/messages");
    }
  }

  async function handleSaveListing(listingId: string) {
    await callTool("listing.add_favorite", { listing_id: listingId });
  }

  async function handleSaveSearch() {
    const user = getUser();
    if (!user) return;
    setSavingSearch(true);
    const name = query || `Search ${new Date().toLocaleDateString("en-CA")}`;
    await callTool("search.save_search", {
      name,
      query,
      filters: { categories, materialType, provinces, priceMin, priceMax, weightMin, weightMax, saleModes, inspectionOnly, sort },
    });
    setSavingSearch(false);
    // Refresh saved searches
    const res = await callTool("search.get_saved_searches", { user_id: user.userId });
    const inner = extractForwardedData(res);
    const list = inner?.saved_searches;
    if (res.success && Array.isArray(list)) setSavedSearches(list as SavedSearch[]);
  }

  function handleLoadSavedSearch(s: SavedSearch) {
    setQuery(s.query ?? "");
    const f = s.filters as Record<string, unknown>;
    if (Array.isArray(f.categories)) setCategories(f.categories as string[]);
    if (f.materialType) setMaterialType(f.materialType as MaterialType);
    if (Array.isArray(f.provinces)) setProvinces(f.provinces as string[]);
    if (f.priceMin) setPriceMin(String(f.priceMin));
    if (f.priceMax) setPriceMax(String(f.priceMax));
    if (Array.isArray(f.saleModes)) setSaleModes(f.saleModes as SaleMode[]);
    if (f.inspectionOnly) setInspectionOnly(f.inspectionOnly as boolean);
    if (f.sort) setSort(f.sort as SortOption);
    setTimeout(() => runSearch(s.query ?? ""), 0);
  }

  const filterSidebarProps = {
    query, setQuery,
    categories, setCategories,
    materialType, setMaterialType,
    provinces, setProvinces,
    priceMin, setPriceMin,
    priceMax, setPriceMax,
    weightMin, setWeightMin,
    weightMax, setWeightMax,
    weightUnit, setWeightUnit,
    saleModes, setSaleModes,
    inspectionOnly, setInspectionOnly,
    sort, setSort,
    onSearch: runSearch,
    onSaveSearch: handleSaveSearch,
    savingSearch,
  };

  return (
    <div className="min-h-[calc(100vh-5rem)]">
      <AppPageHeader
        title="Browse Materials"
        description="Find recycled materials from verified Canadian suppliers"
        actions={
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-steel-200/80 bg-white/95 px-3 py-2 text-sm font-medium text-steel-800 shadow-sm md:hidden"
            onClick={() => setFilterOpen(true)}
          >
            <SlidersHorizontal size={15} />
            Filters
          </button>
        }
      />

      <div className="flex gap-6 items-start">
        {/* Desktop filter sidebar */}
        <div className="hidden md:block">
          <FilterSidebar {...filterSidebarProps} />
        </div>

        {/* Mobile filter drawer (uses the shared Sheet primitive built on
            Radix Dialog — keyboard nav, focus trap, escape-to-close all free). */}
        <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-sm overflow-y-auto md:hidden"
          >
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <FilterSidebar {...filterSidebarProps} />
          </SheetContent>
        </Sheet>

        {/* Results */}
        <div className="flex-1 min-w-0">
          {/* Saved searches */}
          <SavedSearchesPanel searches={savedSearches} onLoad={handleLoadSavedSearch} />

          {/* Results header */}
          {searched && !loading && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-900">{results.length}</span> result{results.length !== 1 ? "s" : ""}
                {query && <> for <span className="font-medium text-brand-700">"{query}"</span></>}
              </p>
              {results.length > 0 && (
                <span className="text-xs text-gray-400">
                  Sorted: {sort === "newest" ? "Newest" : sort === "price_asc" ? "Price ↑" : sort === "price_desc" ? "Price ↓" : "Ending Soon"}
                </span>
              )}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
                  <div className="h-44 bg-gray-100" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-6 bg-gray-100 rounded w-1/2" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-8 bg-gray-100 rounded w-full mt-4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Results grid */}
          {!loading && results.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.map((listing) => (
                <ListingCard
                  key={listing.listing_id}
                  listing={listing}
                  onMessageSeller={handleMessageSeller}
                  onSave={handleSaveListing}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && searched && results.length === 0 && (
            <SearchEmptyState
              query={query}
              onSuggest={(s) => { setQuery(s); void runSearch(s); }}
            />
          )}

          {/* Initial pre-search */}
          {!loading && !searched && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-brand-50 flex items-center justify-center mb-4">
                <Search size={28} className="text-brand-500" />
              </div>
              <p className="text-sm text-gray-500">Use the filters to find recycled materials</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
