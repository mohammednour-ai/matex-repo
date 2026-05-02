"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Gavel,
  Users,
  ChevronRight,
  FileText,
  Bot,
  Trophy,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { callTool, getUser, extractId } from "@/lib/api";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Spinner } from "@/components/ui/shadcn/spinner";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { BidStream, type BidStreamEntry } from "@/components/auctions/BidStream";
import { LotProgressBar } from "@/components/auctions/LotProgressBar";
import { useBidStream } from "@/components/auctions/useBidStream";

type AuctionStatus = "scheduled" | "live" | "completed";
type LotStatus = "upcoming" | "active" | "sold" | "unsold";

type Lot = {
  lot_id: string;
  lot_number: number;
  title: string;
  description: string;
  image_url: string;
  opening_bid: number;
  current_bid: number;
  bid_count: number;
  status: LotStatus;
  winner_label?: string;
};

type BidEntry = BidStreamEntry;

type AuctionDetail = {
  auction_id: string;
  title: string;
  organizer: string;
  description: string;
  status: AuctionStatus;
  start_time: string;
  end_time: string;
  participant_count: number;
  lots: Lot[];
  terms_url?: string;
};

type RawLot = Partial<Lot> & { lot_id: string; lot_number?: number };

function normalizeLot(raw: RawLot, idx: number): Lot {
  const statusRaw = String(raw.status ?? "").toLowerCase();
  const status: LotStatus =
    statusRaw === "sold" || statusRaw === "unsold" || statusRaw === "active" || statusRaw === "upcoming"
      ? statusRaw
      : "upcoming";
  return {
    lot_id: raw.lot_id,
    lot_number: Number(raw.lot_number ?? idx + 1),
    title: raw.title ?? `Lot ${idx + 1}`,
    description: raw.description ?? "",
    image_url: raw.image_url ?? "",
    opening_bid: Number(raw.opening_bid ?? 0),
    current_bid: Number(raw.current_bid ?? raw.opening_bid ?? 0),
    bid_count: Number(raw.bid_count ?? 0),
    status,
    winner_label: raw.winner_label,
  };
}

function deriveAuctionStatus(startIso: string, endIso: string): AuctionStatus {
  const now = Date.now();
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (now < start) return "scheduled";
  if (now > end) return "completed";
  return "live";
}

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

export default function AuctionRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = getUser();

  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeLot, setActiveLot] = useState<Lot | null>(null);
  const [bids, setBids] = useState<BidEntry[]>([]);
  const [customBid, setCustomBid] = useState("");
  const [bidLoading, setBidLoading] = useState(false);
  const [bidError, setBidError] = useState("");
  const [bidSuccess, setBidSuccess] = useState(false);
  // Proxy bidding (max-bid): the system will keep bidding for the user up to
  // this ceiling whenever they get outbid. Persisted locally for the session;
  // forwarded to the backend on each bid as `max_proxy_bid`.
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [proxyMax, setProxyMax] = useState("");
  const [isRegistered, setIsRegistered] = useState(false);
  const [wonLots] = useState<Lot[]>([]);

  // Real-time bid feed. Polls `auction.list_bids` (when shipped) every 5s,
  // merges new entries by id, and keeps `current_bid` / `bid_count` in sync
  // via `auction.get_auction`.
  useBidStream({
    lotId: activeLot?.lot_id ?? null,
    auctionId: auction?.auction_id ?? null,
    onBids: (incoming) => {
      setBids((prev) => {
        const seen = new Set(prev.map((b) => b.bid_id));
        const fresh = incoming.filter((b) => !seen.has(b.bid_id));
        if (fresh.length === 0) return prev;
        // Newest-first ordering by timestamp
        return [...fresh, ...prev].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
      });
    },
    onLotUpdate: (currentBid, bidCount) => {
      setActiveLot((prev) =>
        prev ? { ...prev, current_bid: currentBid, bid_count: bidCount } : prev,
      );
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      const res = await callTool("auction.get_auction", { auction_id: params.id });
      if (cancelled) return;
      if (res.success) {
        const d = res.data as unknown as {
          auction?: Partial<AuctionDetail> & { start_time?: string; end_time?: string };
          lots?: RawLot[];
        };
        const a = d?.auction;
        if (!a) {
          setLoadError("Auction not found.");
          setLoading(false);
          return;
        }
        const lots = Array.isArray(d?.lots) ? d.lots.map(normalizeLot) : [];
        const start = a.start_time ?? new Date().toISOString();
        const end = a.end_time ?? new Date().toISOString();
        const detail: AuctionDetail = {
          auction_id: a.auction_id ?? params.id,
          title: a.title ?? "Auction",
          organizer: a.organizer ?? "Organizer",
          description: a.description ?? "",
          status: (a.status as AuctionStatus) ?? deriveAuctionStatus(start, end),
          start_time: start,
          end_time: end,
          participant_count: Number(a.participant_count ?? 0),
          lots,
          terms_url: a.terms_url,
        };
        setAuction(detail);
        const active = lots.find((l) => l.status === "active") ?? lots[0] ?? null;
        setActiveLot(active);
      } else {
        setLoadError(res.error?.message ?? "Could not load auction.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const lotEnd = auction?.end_time ?? new Date().toISOString();
  const totalSecondsLeft = Math.max(0, Math.floor((new Date(lotEnd).getTime() - Date.now()) / 1000));
  const isUrgent = totalSecondsLeft < 60;

  const quickBidAmounts = [500, 1000, 5000];

  async function handlePlaceBid(amount: number): Promise<void> {
    if (!activeLot) return;
    setBidLoading(true);
    setBidError("");
    setBidSuccess(false);
    const proxyArg =
      proxyEnabled && proxyMax !== "" && Number(proxyMax) > amount
        ? { max_proxy_bid: Number(proxyMax) }
        : {};
    const res = await callTool("auction.place_auction_bid", {
      lot_id: activeLot.lot_id,
      amount,
      ...proxyArg,
    });
    if (res.success) {
      const newBid: BidEntry = {
        bid_id: extractId(res, "bid_id") || `b-${Date.now()}`,
        bidder: user?.email?.split("@")[0] ?? "You",
        amount,
        timestamp: new Date().toISOString(),
      };
      setBids((prev) => [newBid, ...prev]);
      setActiveLot((prev) => (prev ? { ...prev, current_bid: amount, bid_count: prev.bid_count + 1 } : prev));
      setBidSuccess(true);
      setCustomBid("");
      setTimeout(() => setBidSuccess(false), 3000);
    } else {
      setBidError(res.error?.message ?? "Failed to place bid.");
    }
    setBidLoading(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-6 w-6 text-brand-500" />
      </div>
    );
  }

  if (loadError || !auction) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-slate-400" />
        <h2 className="text-lg font-semibold text-slate-900">{loadError || "Auction not found"}</h2>
        <p className="mt-2 text-sm text-slate-500">Go back to the auctions list and try another event.</p>
        <Link href="/auctions" className="mt-5 inline-block">
          <Button size="sm" variant="secondary">Back to auctions</Button>
        </Link>
      </div>
    );
  }

  if (!activeLot) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <Gavel className="mx-auto mb-3 h-10 w-10 text-slate-400" />
        <h2 className="text-lg font-semibold text-slate-900">No lots in this auction yet</h2>
        <Link href="/auctions" className="mt-5 inline-block">
          <Button size="sm" variant="secondary">Back to auctions</Button>
        </Link>
      </div>
    );
  }

  if (auction.status === "scheduled") {
    return <LobbyView auction={auction} isRegistered={isRegistered} onRegister={() => setIsRegistered(true)} />;
  }

  if (auction.status === "completed") {
    return <PostAuctionView auction={auction} wonLots={wonLots} />;
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-2 w-2">
            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </div>
          <span className="font-semibold text-slate-900 text-sm">{auction.title}</span>
          <Badge variant="danger">LIVE</Badge>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {auction.participant_count} participants
          </span>
          <span className="text-xs">Auction ends: <CountdownTimer targetDate={auction.end_time} /></span>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left panel — full width on mobile, 2/3 desktop */}
        <div className="flex w-full flex-col gap-4 overflow-y-auto border-b border-slate-200 bg-white p-5 lg:w-2/3 lg:border-b-0 lg:border-r">
          {/* Lot header */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-700">
              Lot {activeLot.lot_number} of {auction.lots.length} —{" "}
              <span className="text-slate-900">{activeLot.title}</span>
            </h2>
            <Badge variant={isUrgent ? "danger" : "warning"}>Active</Badge>
          </div>

          {/* Lot image */}
          <div className="h-52 w-full overflow-hidden rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
            <Package className="h-20 w-20 text-slate-300" />
          </div>

          {/* Current bid */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
            <p className="text-sm font-medium text-slate-500 mb-1">Current Bid</p>
            <p className="text-5xl font-extrabold text-blue-600">{formatCAD(activeLot.current_bid)}</p>
            <p className="mt-1 text-sm text-slate-500">{activeLot.bid_count} bids placed</p>
          </div>

          {/* Lot timer + progress */}
          <div className={`space-y-3 rounded-xl border p-4 ${isUrgent ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex items-center justify-center gap-3">
              <Clock className={`h-5 w-5 ${isUrgent ? "text-red-500" : "text-amber-600"}`} />
              <div className="text-center">
                <p className={`text-xs font-medium ${isUrgent ? "text-red-500" : "text-amber-700"}`}>
                  {isUrgent ? "CLOSING NOW" : "Lot closes in"}
                </p>
                <CountdownTimer targetDate={lotEnd} className="text-2xl font-bold" />
              </div>
            </div>
            <LotProgressBar startTime={auction.start_time} endTime={lotEnd} />
          </div>

          {/* Your-bid status pill (visible once the user has bid). The pill
              compares the email-prefix the bid stream stamps as the bidder
              against the latest bid; the gateway should replace this with a
              server-known user_id match once user identity is in the bid
              payload. */}
          {bids.length > 0 && user?.email && (() => {
            const youKey = user.email.split("@")[0];
            const youAreHighBidder = bids[0]?.bidder === youKey;
            const youHaveBid = bids.some((b) => b.bidder === youKey);
            if (!youHaveBid) return null;
            return (
              <div
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                  youAreHighBidder
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-warning-50 text-warning-800"
                }`}
              >
                {youAreHighBidder ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    You are the high bidder
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4" />
                    You have been outbid
                    {proxyEnabled && Number(proxyMax) > activeLot.current_bid && (
                      <span className="ml-auto text-xs font-medium text-warning-700">
                        Proxy will rebid up to {formatCAD(Number(proxyMax))}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* Bidding controls */}
          {isRegistered ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                {quickBidAmounts.map((inc) => (
                  <button
                    key={inc}
                    disabled={bidLoading}
                    onClick={() => handlePlaceBid(activeLot.current_bid + inc)}
                    className="flex-1 rounded-lg border border-blue-200 bg-blue-50 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                  >
                    +{formatCAD(inc)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={activeLot.current_bid + 100}
                  step={100}
                  placeholder={`Min ${formatCAD(activeLot.current_bid + 100)}`}
                  value={customBid}
                  onChange={(e) => setCustomBid(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <Button
                  size="lg"
                  loading={bidLoading}
                  disabled={!customBid || Number(customBid) <= activeLot.current_bid}
                  onClick={() => handlePlaceBid(Number(customBid))}
                  className="whitespace-nowrap"
                >
                  Place Bid
                </Button>
              </div>
              {bidError && <p className="text-xs text-red-600">{bidError}</p>}
              {bidSuccess && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <CheckCircle className="h-4 w-4" /> Bid placed successfully!
                </div>
              )}

              {/* Proxy bidding (max bid). Forwarded as `max_proxy_bid` on
                  the next placed bid; the auction MCP keeps re-bidding up to
                  this ceiling when the user is outbid. */}
              <details className="rounded-lg border border-slate-200 bg-white p-2 text-xs">
                <summary className="cursor-pointer select-none text-slate-600 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={proxyEnabled}
                    onChange={(e) => setProxyEnabled(e.target.checked)}
                    className="mr-2 align-middle"
                  />
                  Set a maximum (proxy bid)
                </summary>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={activeLot.current_bid + 100}
                    step={100}
                    placeholder={`Max ${formatCAD(activeLot.current_bid + 1000)}`}
                    value={proxyMax}
                    onChange={(e) => setProxyMax(e.target.value)}
                    disabled={!proxyEnabled}
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                  <span className="text-[10px] text-slate-500">
                    Bids automatically up to this ceiling.
                  </span>
                </div>
              </details>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
              <AlertCircle className="mx-auto mb-2 h-6 w-6 text-slate-400" />
              <p className="text-sm text-slate-500">You are in <strong>watch-only</strong> mode.</p>
              <Button size="sm" variant="secondary" className="mt-3" onClick={() => setIsRegistered(true)}>
                Register to Bid
              </Button>
            </div>
          )}

          {/* AI Advisor */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-800 mb-0.5">AI Advisor</p>
                <p className="text-xs text-blue-700">
                  Current price is <strong>8% below</strong> the Matex Price Index for HMS #1 Scrap Steel.
                  Based on recent transactions, consider bidding up to{" "}
                  <strong className="text-blue-900">{formatCAD(31000)}</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex w-full flex-col overflow-hidden bg-white lg:w-1/3">
          {/* Bid stream */}
          <div className="flex-1 overflow-y-auto border-b border-slate-200 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Live Bid Stream
            </h3>
            <BidStream bids={bids} currentUserKey={user?.email?.split("@")[0] ?? null} />
          </div>

          {/* Lot list */}
          <div className="overflow-y-auto p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">All Lots</h3>
            <div className="space-y-1.5">
              {auction.lots.map((lot) => (
                <button
                  key={lot.lot_id}
                  onClick={() => lot.status !== "upcoming" && setActiveLot(lot)}
                  className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition ${
                    lot.lot_id === activeLot.lot_id
                      ? "bg-blue-50 ring-1 ring-blue-300"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-600 w-8">#{lot.lot_number}</span>
                      <span className="font-medium text-slate-800 truncate max-w-[130px]">{lot.title}</span>
                    </div>
                    {lot.status === "sold" && lot.winner_label && (
                      <p className="mt-0.5 pl-10 text-[10px] text-emerald-600">Sold to {lot.winner_label}</p>
                    )}
                  </div>
                  <LotStatusBadge status={lot.status} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LotStatusBadge({ status }: { status: LotStatus }) {
  const map: Record<LotStatus, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-amber-100 text-amber-700" },
    sold: { label: "Sold", className: "bg-emerald-100 text-emerald-700" },
    upcoming: { label: "Upcoming", className: "bg-slate-100 text-slate-500" },
    unsold: { label: "Unsold", className: "bg-red-100 text-red-600" },
  };
  const { label, className } = map[status];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}>{label}</span>;
}

function LobbyView({
  auction,
  isRegistered,
  onRegister,
}: {
  auction: AuctionDetail;
  isRegistered: boolean;
  onRegister: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AppPageHeader
        title={auction.title}
        description={`${auction.organizer} — ${auction.description}`}
        actions={<Badge variant="info">Scheduled</Badge>}
      />

      <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-8 text-center">
        <p className="text-sm font-medium text-blue-600 mb-3">Auction Begins In</p>
        <CountdownTimer targetDate={auction.start_time} className="text-5xl font-extrabold text-blue-700 justify-center" />
        <div className="mt-4 flex items-center justify-center gap-4 text-sm text-slate-500">
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{auction.participant_count} registered</span>
          <span className="flex items-center gap-1.5"><Package className="h-4 w-4" />{auction.lots.length} lots</span>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">Lot Preview</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {auction.lots.map((lot) => (
            <div key={lot.lot_id} className="marketplace-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">Lot #{lot.lot_number}</p>
                  <p className="text-sm font-semibold text-slate-800">{lot.title}</p>
                  <p className="text-xs text-slate-500 mt-1">Opening: {formatCAD(lot.opening_bid)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="marketplace-card flex items-center justify-between p-5">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Auction Terms & Conditions</span>
        </div>
        <Button size="sm" variant="secondary">Download PDF</Button>
      </div>

      {isRegistered ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle className="h-5 w-5 text-emerald-600" />
          <p className="text-sm font-medium text-emerald-800">You&apos;re registered for this auction.</p>
        </div>
      ) : (
        <Button size="lg" className="w-full" onClick={onRegister}>
          Register Now <ChevronRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function PostAuctionView({ auction, wonLots }: { auction: AuctionDetail; wonLots: Lot[] }) {
  const mockWon: Lot[] = auction.lots.filter((l) => l.status === "sold").slice(0, 2);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {mockWon.length > 0 && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
          <Trophy className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
          <h2 className="text-xl font-bold text-emerald-800">Congratulations!</h2>
          <p className="text-sm text-emerald-700 mt-1">
            You won {mockWon.length} lot{mockWon.length > 1 ? "s" : ""} with a total of{" "}
            <strong>{formatCAD(mockWon.reduce((s, l) => s + l.current_bid, 0))}</strong>
          </p>
          <Link href="/escrow/create?order_id=ord-001">
            <Button size="lg" className="mt-4">
              Proceed to Escrow <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">Won Lots</h2>
        <div className="space-y-2">
          {mockWon.map((lot) => (
            <div key={lot.lot_id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Lot #{lot.lot_number} — {lot.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">Winning bid</p>
              </div>
              <p className="text-lg font-bold text-blue-600">{formatCAD(lot.current_bid)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Next Steps</h3>
        <ol className="space-y-3">
          {[
            "Fund escrow within 24 hours",
            "Inspection booking (if required)",
            "Arrange logistics with seller",
            "Escrow released upon delivery confirmation",
          ].map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="text-sm text-slate-700 pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Package({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}
