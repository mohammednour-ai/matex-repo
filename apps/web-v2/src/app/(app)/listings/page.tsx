"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import {
  Plus,
  Eye,
  Edit2,
  Archive,
  MoreVertical,
  Package,
  Gavel,
  DollarSign,
  Clock,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { Badge } from "@/components/ui/shadcn/badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState as EmptyIllustration } from "@/components/ui/EmptyState";
import { callTool, getUser } from "@/lib/api";
import { isFlagEnabled } from "@/lib/flags";
import { ListingsTable } from "@/components/listings/ListingsTable";

// ─── Types ───────────────────────────────────────────────────────────────────

type SaleMode = "fixed" | "bidding" | "auction";
type ListingStatus = "draft" | "active" | "sold" | "ended" | "archived";
type Tab = "all" | "active" | "draft" | "sold" | "ended";

type ListingCard = {
  listing_id: string;
  title: string;
  sale_mode: SaleMode;
  status: ListingStatus;
  asking_price?: number;
  starting_bid?: number;
  reserve_price?: number;
  category?: string;
  quantity?: number;
  unit?: string;
  thumbnail_url?: string;
  view_count: number;
  bids_count: number;
  created_at: string;
  updated_at?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPrice(listing: ListingCard): string {
  const price =
    listing.asking_price ??
    listing.starting_bid ??
    listing.reserve_price;
  if (!price) return "—";
  return `$${price.toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} CAD`;
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ─── Sale mode badge ──────────────────────────────────────────────────────────

function SaleModeBadge({ mode }: { mode: SaleMode }) {
  const config = ({
    fixed: { label: "Fixed Price", variant: "info" as const, icon: DollarSign },
    bidding: { label: "Bidding", variant: "warning" as const, icon: TrendingUp },
    auction: { label: "Auction", variant: "info" as const, icon: Gavel },
  } as Record<string, { label: string; variant: "info" | "warning"; icon: typeof DollarSign }>)[mode] ?? {
    label: mode ?? "Unknown",
    variant: "info" as const,
    icon: DollarSign,
  };
  const Icon = config.icon;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
        mode === "fixed" && "bg-brand-50 text-brand-700 ring-brand-600/20",
        mode === "bidding" && "bg-amber-50 text-amber-700 ring-amber-600/20",
        mode === "auction" && "bg-purple-50 text-purple-700 ring-purple-600/20"
      )}
    >
      <Icon className="w-2.5 h-2.5" />
      {config.label}
    </span>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ListingStatus,
  { label: string; variant: "success" | "info" | "gray" | "danger" | "warning" }
> = {
  draft: { label: "Draft", variant: "gray" },
  active: { label: "Active", variant: "success" },
  sold: { label: "Sold", variant: "info" },
  ended: { label: "Ended", variant: "warning" },
  archived: { label: "Archived", variant: "danger" },
};

// ─── Card menu ────────────────────────────────────────────────────────────────

function CardMenu({
  listing,
  onArchive,
}: {
  listing: ListingCard;
  onArchive: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        aria-label="More actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-7 z-20 w-40 bg-white rounded-xl border border-slate-200 shadow-lg py-1 overflow-hidden">
            <button
              onClick={() => {
                setOpen(false);
                router.push(`/listings/${listing.listing_id}`);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Eye className="w-4 h-4 text-slate-400" />
              View
            </button>
            <button
              onClick={() => {
                setOpen(false);
                router.push(`/listings/${listing.listing_id}/edit`);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Edit2 className="w-4 h-4 text-slate-400" />
              Edit
            </button>
            {listing.status !== "archived" && (
              <button
                onClick={() => {
                  setOpen(false);
                  onArchive(listing.listing_id);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <Archive className="w-4 h-4" />
                Archive
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Listing card ─────────────────────────────────────────────────────────────

function ListingCardItem({
  listing,
  onArchive,
}: {
  listing: ListingCard;
  onArchive: (id: string) => void;
}) {
  const router = useRouter();
  const statusConfig = STATUS_CONFIG[listing.status] ?? STATUS_CONFIG.draft;

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md hover:border-slate-300 transition-all duration-150 flex flex-col"
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-video bg-slate-100 cursor-pointer overflow-hidden"
        onClick={() => router.push(`/listings/${listing.listing_id}`)}
      >
        {listing.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.thumbnail_url}
            alt={
              listing.category
                ? `${listing.title} — ${listing.category}`
                : listing.title
            }
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2">
            <Package className="w-10 h-10" />
            <span className="text-xs">No photo</span>
          </div>
        )}

        {/* Status overlay badge */}
        <div className="absolute top-2 left-2">
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/listings/${listing.listing_id}`}
            className="text-sm font-semibold text-slate-800 hover:text-brand-600 transition-colors leading-snug line-clamp-2 flex-1"
          >
            {listing.title}
          </Link>
          <CardMenu listing={listing} onArchive={onArchive} />
        </div>

        {/* Sale mode + category */}
        <div className="flex items-center flex-wrap gap-1.5">
          <SaleModeBadge mode={listing.sale_mode} />
          {listing.category && (
            <span className="text-[10px] text-slate-400 bg-slate-50 rounded-full px-2 py-0.5 border border-slate-200">
              {listing.category}
            </span>
          )}
        </div>

        {/* Quantity */}
        {listing.quantity != null && (
          <p className="text-xs text-slate-500">
            {listing.quantity} {listing.unit ?? "units"}
          </p>
        )}

        {/* Price */}
        <p className="text-base font-bold text-slate-900">{formatPrice(listing)}</p>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-auto pt-2 border-t border-slate-100">
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Eye className="w-3 h-3" />
            {listing.view_count ?? 0} views
          </span>
          {listing.sale_mode !== "fixed" && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Gavel className="w-3 h-3" />
              {listing.bids_count ?? 0} bid{listing.bids_count !== 1 ? "s" : ""}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
            <Clock className="w-3 h-3" />
            {formatDate(listing.created_at)}
          </span>
        </div>
      </div>

      {/* Quick actions footer */}
      <div className="flex border-t border-slate-100">
        <Link
          href={`/listings/${listing.listing_id}`}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          View
        </Link>
        <div className="w-px bg-slate-100" />
        <Link
          href={`/listings/${listing.listing_id}/edit`}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Edit
        </Link>
        <div className="w-px bg-slate-100" />
        <button
          onClick={() => onArchive(listing.listing_id)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          disabled={listing.status === "archived"}
        >
          <Archive className="w-3.5 h-3.5" />
          Archive
        </button>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

const EMPTY_BY_TAB: Record<
  Tab,
  { image: string; title: string; description: string; showCreate: boolean }
> = {
  all: {
    image: "/illustrations/empty-listings.png",
    title: "No listings yet",
    description: "Create your first listing to start selling recycled materials on Matex.",
    showCreate: true,
  },
  active: {
    image: "/illustrations/empty-active-listings.png",
    title: "No active listings",
    description: "Publish a draft listing or create a new one to start receiving offers.",
    showCreate: true,
  },
  draft: {
    image: "/illustrations/empty-listings.png",
    title: "No drafts",
    description: "Save a listing as draft to continue editing it later.",
    showCreate: true,
  },
  sold: {
    image: "/illustrations/empty-sold.png",
    title: "No sold listings",
    description: "Listings you've completed will appear here.",
    showCreate: false,
  },
  ended: {
    image: "/illustrations/empty-active-listings.png",
    title: "No ended listings",
    description: "Expired or closed listings will appear here.",
    showCreate: false,
  },
};

function ListingsEmptyState({
  tab,
  onCreate,
}: {
  tab: Tab;
  onCreate: () => void;
}) {
  const config = EMPTY_BY_TAB[tab];
  return (
    <EmptyIllustration
      image={config.image}
      title={config.title}
      description={config.description}
      cta={config.showCreate ? { label: "Create listing", onClick: onCreate } : undefined}
      size="lg"
    />
  );
}

// ─── Summary stats ────────────────────────────────────────────────────────────

function SummaryStats({ listings }: { listings: ListingCard[] }) {
  const active = listings.filter((l) => l.status === "active").length;
  const draft = listings.filter((l) => l.status === "draft").length;
  const sold = listings.filter((l) => l.status === "sold").length;
  const totalViews = listings.reduce((sum, l) => sum + (l.view_count ?? 0), 0);

  const stats = [
    { label: "Active", value: active, color: "text-emerald-600" },
    { label: "Drafts", value: draft, color: "text-slate-600" },
    { label: "Sold", value: sold, color: "text-brand-600" },
    { label: "Total views", value: totalViews, color: "text-purple-600" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-white rounded-xl border border-slate-200 px-4 py-3 text-center"
        >
          <p className={clsx("text-2xl font-bold", s.color)}>{s.value}</p>
          <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden animate-pulse">
      <div className="aspect-video bg-slate-200" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-slate-200 rounded w-3/4" />
        <div className="h-3 bg-slate-200 rounded w-1/3" />
        <div className="h-5 bg-slate-200 rounded w-1/2" />
        <div className="h-3 bg-slate-200 rounded w-full" />
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Drafts" },
  { id: "sold", label: "Sold" },
  { id: "ended", label: "Ended" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

type ViewMode = "cards" | "table";

export default function MyListingsPage() {
  const tableViewEnabled = isFlagEnabled("listings_table_view");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [listings, setListings] = useState<ListingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [archiving, setArchiving] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await callTool<{ listings: ListingCard[] }>(
        "listing.get_my_listings",
        { seller_id: getUser()?.userId ?? "" }
      );
      const upData = (res.data?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
      const raw = (upData?.listings ?? res.data?.listings ?? []) as ListingCard[];
      setListings(Array.isArray(raw) ? raw : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load listings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const handleArchive = async (listingId: string) => {
    setArchiving(listingId);
    try {
      const res = await callTool("listing.archive_listing", { listing_id: listingId });
      if (!res.success) {
        throw new Error(res.error?.message ?? "Could not archive listing.");
      }
      setListings((prev) =>
        prev.map((l) =>
          l.listing_id === listingId ? { ...l, status: "archived" as ListingStatus } : l
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not archive listing.");
    } finally {
      setArchiving(null);
    }
  };

  const filteredListings = listings.filter((l) => {
    if (activeTab === "all") return l.status !== "archived";
    if (activeTab === "ended") return l.status === "ended" || l.status === "archived";
    return l.status === activeTab;
  });

  const tabCounts: Record<Tab, number> = {
    all: listings.filter((l) => l.status !== "archived").length,
    active: listings.filter((l) => l.status === "active").length,
    draft: listings.filter((l) => l.status === "draft").length,
    sold: listings.filter((l) => l.status === "sold").length,
    ended: listings.filter((l) => l.status === "ended" || l.status === "archived").length,
  };

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="My Listings"
        description="Manage and track your materials on the marketplace"
        actions={
          <Button onClick={() => router.push("/listings/create")} className="shrink-0 gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create listing</span>
            <span className="sm:hidden">Create</span>
          </Button>
        }
      />

      {/* Stats */}
      {!loading && listings.length > 0 && <SummaryStats listings={listings} />}

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={loadListings}
            className="ml-auto text-xs text-red-600 hover:underline font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-steel-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-steel-500 hover:border-steel-300 hover:text-steel-800"
            )}
          >
            {tab.label}
            {tabCounts[tab.id] > 0 && (
              <span
                className={clsx(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold min-w-[18px] text-center",
                  activeTab === tab.id
                    ? "bg-brand-100 text-brand-700"
                    : "bg-steel-100 text-steel-600"
                )}
              >
                {tabCounts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filteredListings.length === 0 ? (
        <ListingsEmptyState
          tab={activeTab}
          onCreate={() => router.push("/listings/create")}
        />
      ) : (
        <>
          {tableViewEnabled && (
            <div className="mb-3 flex justify-end">
              <div className="inline-flex rounded-lg border border-steel-200 bg-white p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setViewMode("cards")}
                  className={clsx(
                    "rounded-md px-3 py-1.5 transition-colors",
                    viewMode === "cards" ? "bg-brand-50 text-brand-700" : "text-steel-500 hover:text-steel-800",
                  )}
                >
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={clsx(
                    "rounded-md px-3 py-1.5 transition-colors",
                    viewMode === "table" ? "bg-brand-50 text-brand-700" : "text-steel-500 hover:text-steel-800",
                  )}
                >
                  Table
                </button>
              </div>
            </div>
          )}
          {tableViewEnabled && viewMode === "table" ? (
            <ListingsTable rows={filteredListings} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredListings.map((listing) => (
                <div
                  key={listing.listing_id}
                  className={clsx(archiving === listing.listing_id && "opacity-50 pointer-events-none")}
                >
                  <ListingCardItem
                    listing={listing}
                    onArchive={handleArchive}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Loading spinner for archiving */}
      {archiving && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
          <Spinner className="w-3.5 h-3.5" />
          Archiving listing…
        </div>
      )}
    </div>
  );
}
