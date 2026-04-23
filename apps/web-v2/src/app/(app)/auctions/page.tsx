"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gavel, Search, Users, Package, TrendingUp, Clock } from "lucide-react";
import { callTool } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

type AuctionStatus = "live" | "upcoming" | "completed";

type Auction = {
  auction_id: string;
  title: string;
  organizer: string;
  lot_count: number;
  start_time: string;
  end_time: string;
  total_gmv: number;
  status: AuctionStatus;
  registered: boolean;
};

type RawAuction = Partial<Auction> & {
  auction_id: string;
  organizer_name?: string;
  organizer_id?: string;
  lot_count?: number;
  status?: AuctionStatus | string;
};

function deriveStatus(raw: RawAuction): AuctionStatus {
  const rawStatus = String(raw.status ?? "").toLowerCase();
  if (rawStatus === "live" || rawStatus === "upcoming" || rawStatus === "completed") {
    return rawStatus;
  }
  const now = Date.now();
  const start = raw.start_time ? new Date(raw.start_time).getTime() : now;
  const end = raw.end_time ? new Date(raw.end_time).getTime() : now;
  if (now < start) return "upcoming";
  if (now > end) return "completed";
  return "live";
}

function normalizeAuction(raw: RawAuction): Auction {
  return {
    auction_id: raw.auction_id,
    title: raw.title ?? `Auction ${raw.auction_id.slice(0, 8)}`,
    organizer: raw.organizer ?? raw.organizer_name ?? raw.organizer_id ?? "Organizer",
    lot_count: Number(raw.lot_count ?? 0),
    start_time: raw.start_time ?? new Date().toISOString(),
    end_time: raw.end_time ?? new Date().toISOString(),
    total_gmv: Number(raw.total_gmv ?? 0),
    status: deriveStatus(raw),
    registered: Boolean(raw.registered),
  };
}

type Tab = "live" | "upcoming" | "completed";

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AuctionPage() {
  const [tab, setTab] = useState<Tab>("live");
  const [search, setSearch] = useState("");
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const res = await callTool("auction.list_auctions", {});
      if (cancelled) return;
      if (res.success) {
        const d = res.data as unknown as { auctions?: RawAuction[] };
        setAuctions(Array.isArray(d?.auctions) ? d.auctions.map(normalizeAuction) : []);
      } else {
        setError(res.error?.message ?? "Could not load auctions.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = auctions.filter(
    (a) =>
      a.status === tab &&
      (search === "" ||
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.organizer.toLowerCase().includes(search.toLowerCase()))
  );

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "live", label: "Live Now", count: auctions.filter((a) => a.status === "live").length },
    { key: "upcoming", label: "Upcoming", count: auctions.filter((a) => a.status === "upcoming").length },
    { key: "completed", label: "Completed", count: auctions.filter((a) => a.status === "completed").length },
  ];

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Auctions"
        description="Bid on recycled material lots from verified sellers across Canada."
        actions={
          <div className="relative w-full min-w-0 sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" />
            <input
              type="search"
              placeholder="Search auctions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-steel-200/80 bg-white/95 py-2 pl-9 pr-3 text-sm text-steel-900 shadow-sm placeholder:text-steel-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
            />
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-2xl border border-steel-200/80 bg-steel-100/80 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-white text-steel-900 shadow-sm"
                : "text-steel-500 hover:text-steel-800"
            }`}
          >
            {t.key === "live" && t.count > 0 && (
              <span className="flex h-2 w-2">
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
            )}
            {t.label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                tab === t.key ? "bg-brand-100 text-brand-700" : "bg-steel-200 text-steel-500"
              }`}
            >
              {loading && t.key === "live" ? "…" : t.count}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Auction cards */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner className="h-7 w-7 text-blue-500" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          image={tab === "completed" ? "/illustrations/auction-complete.png" : "/illustrations/auction-lobby.png"}
          title={`No ${tab} auctions`}
          description={
            tab === "live"
              ? "Nothing is live right now. Check the upcoming tab or come back soon."
              : tab === "upcoming"
              ? "No auctions are scheduled yet."
              : "Completed auctions and results will appear here."
          }
          size="lg"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((auction) => (
            <AuctionCard key={auction.auction_id} auction={auction} />
          ))}
        </div>
      )}
    </div>
  );
}

function AuctionCard({ auction }: { auction: Auction }) {
  const isLive = auction.status === "live";
  const isCompleted = auction.status === "completed";

  return (
    <div className="group marketplace-card relative flex flex-col p-5 transition-shadow hover:shadow-md">
      {/* Live badge */}
      {isLive && (
        <div className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-0.5">
          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          <span className="text-xs font-bold uppercase tracking-wider text-white">Live</span>
        </div>
      )}

      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Gavel className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-slate-900 text-sm leading-snug pr-12">{auction.title}</h3>
          <p className="mt-0.5 text-xs text-slate-500 truncate">{auction.organizer}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat icon={<Package className="h-3.5 w-3.5" />} label="Lots" value={String(auction.lot_count)} />
        <Stat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Est. GMV" value={formatCAD(auction.total_gmv)} />
        <Stat
          icon={<Clock className="h-3.5 w-3.5" />}
          label={isLive ? "Closes" : isCompleted ? "Ended" : "Starts"}
          value={
            isLive ? (
              <CountdownTimer targetDate={auction.end_time} className="text-xs" />
            ) : isCompleted ? (
              formatDate(auction.end_time)
            ) : (
              formatDate(auction.start_time)
            )
          }
        />
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
        {auction.registered ? (
          <Badge variant="success">Registered</Badge>
        ) : (
          <Badge variant="gray">Open</Badge>
        )}
        <Link href={`/auction/${auction.auction_id}`}>
          <Button size="sm" variant={isCompleted ? "secondary" : "primary"}>
            {isLive ? "Join" : isCompleted ? "View Results" : "Register"}
          </Button>
        </Link>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-slate-400">{icon}<span className="text-[10px] uppercase tracking-wide font-medium">{label}</span></div>
      <div className="text-xs font-semibold text-slate-800">{value}</div>
    </div>
  );
}
