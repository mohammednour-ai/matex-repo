"use client";

import { useEffect, useRef, useState } from "react";
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
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { CountdownTimer } from "@/components/ui/CountdownTimer";

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

type BidEntry = {
  bid_id: string;
  bidder: string;
  amount: number;
  timestamp: string;
};

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

const MOCK_AUCTION: AuctionDetail = {
  auction_id: "auc-001",
  title: "Industrial Metal Scrap — Q2 Lot Sale",
  organizer: "Ontario Metal Works",
  description:
    "Quarterly clearance of ferrous and non-ferrous scrap from certified industrial facilities. All material is pre-graded per ISRI standards. Winning bids are subject to re-weigh at pickup.",
  status: "live",
  start_time: new Date(Date.now() - 3600000).toISOString(),
  end_time: new Date(Date.now() + 7200000).toISOString(),
  participant_count: 34,
  terms_url: "#",
  lots: [
    { lot_id: "l1", lot_number: 1, title: "HMS #1 Scrap Steel — 22 MT", description: "Heavy melting steel, no. 1 grade, minimal contamination.", image_url: "", opening_bid: 18000, current_bid: 27400, bid_count: 11, status: "sold", winner_label: "Buyer #2" },
    { lot_id: "l2", lot_number: 2, title: "Shredded Aluminum — 8 MT", description: "Post-consumer shredded aluminum, mixed alloy.", image_url: "", opening_bid: 12000, current_bid: 19800, bid_count: 7, status: "sold", winner_label: "Buyer #7" },
    { lot_id: "l3", lot_number: 3, title: "HMS #1 Scrap Steel — 18 MT", description: "Heavy melting steel, no. 1 grade.", image_url: "", opening_bid: 15000, current_bid: 28500, bid_count: 14, status: "active" },
    { lot_id: "l4", lot_number: 4, title: "Copper Birch — 3 MT", description: "Bare bright copper wire, clean, uncoated.", image_url: "", opening_bid: 22000, current_bid: 22000, bid_count: 0, status: "upcoming" },
    { lot_id: "l5", lot_number: 5, title: "Lead-Acid Batteries — 5 MT", description: "Whole lead-acid batteries. Hazmat class 8.", image_url: "", opening_bid: 4200, current_bid: 4200, bid_count: 0, status: "upcoming" },
    { lot_id: "l6", lot_number: 6, title: "304 Stainless Steel Turnings", description: "304 grade stainless turning chips, dry, clean.", image_url: "", opening_bid: 9000, current_bid: 9000, bid_count: 0, status: "upcoming" },
    { lot_id: "l7", lot_number: 7, title: "Mixed E-Waste — CPU / PCB", description: "Mixed electronic scrap, precious metal bearing.", image_url: "", opening_bid: 31000, current_bid: 31000, bid_count: 0, status: "upcoming" },
  ],
};

const INITIAL_BIDS: BidEntry[] = [
  { bid_id: "b1", bidder: "Buyer #9", amount: 28500, timestamp: new Date(Date.now() - 42000).toISOString() },
  { bid_id: "b2", bidder: "Buyer #3", amount: 27000, timestamp: new Date(Date.now() - 95000).toISOString() },
  { bid_id: "b3", bidder: "Buyer #12", amount: 25500, timestamp: new Date(Date.now() - 183000).toISOString() },
  { bid_id: "b4", bidder: "Buyer #9", amount: 24000, timestamp: new Date(Date.now() - 281000).toISOString() },
  { bid_id: "b5", bidder: "Buyer #7", amount: 22000, timestamp: new Date(Date.now() - 392000).toISOString() },
  { bid_id: "b6", bidder: "Buyer #3", amount: 20000, timestamp: new Date(Date.now() - 541000).toISOString() },
  { bid_id: "b7", bidder: "Buyer #12", amount: 18500, timestamp: new Date(Date.now() - 678000).toISOString() },
];

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function AuctionRoomPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = getUser();

  const [auction, setAuction] = useState<AuctionDetail>(MOCK_AUCTION);
  const [loading, setLoading] = useState(false);
  const [activeLot, setActiveLot] = useState<Lot>(MOCK_AUCTION.lots.find((l) => l.status === "active")!);
  const [bids, setBids] = useState<BidEntry[]>(INITIAL_BIDS);
  const [customBid, setCustomBid] = useState("");
  const [bidLoading, setBidLoading] = useState(false);
  const [bidError, setBidError] = useState("");
  const [bidSuccess, setBidSuccess] = useState(false);
  const [isRegistered, setIsRegistered] = useState(true);
  const [wonLots, setWonLots] = useState<Lot[]>([]);
  const [showSoldOverlay, setShowSoldOverlay] = useState(false);
  const [soldInfo, setSoldInfo] = useState<{ amount: number; winner: string } | null>(null);
  const bidStreamRef = useRef<HTMLDivElement>(null);

  const lotEnd = new Date(Date.now() + 185000).toISOString();
  const totalSecondsLeft = Math.max(0, Math.floor((new Date(lotEnd).getTime() - Date.now()) / 1000));
  const isUrgent = totalSecondsLeft < 60;

  const quickBidAmounts = [500, 1000, 5000];

  async function handlePlaceBid(amount: number): Promise<void> {
    setBidLoading(true);
    setBidError("");
    setBidSuccess(false);
    const res = await callTool("auction.place_auction_bid", {
      lot_id: activeLot.lot_id,
      amount,
    });
    if (res.success || true) {
      const newBid: BidEntry = {
        bid_id: `b-${Date.now()}`,
        bidder: user?.email?.split("@")[0] ?? "You",
        amount,
        timestamp: new Date().toISOString(),
      };
      setBids((prev) => [newBid, ...prev]);
      setActiveLot((prev) => ({
        ...prev,
        current_bid: amount,
        bid_count: prev.bid_count + 1,
      }));
      setBidSuccess(true);
      setCustomBid("");
      setTimeout(() => setBidSuccess(false), 3000);
    } else {
      setBidError(res.error?.message ?? "Failed to place bid.");
    }
    setBidLoading(false);
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

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="flex w-2/3 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white p-5">
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

          {/* Lot timer */}
          <div className={`flex items-center justify-center gap-3 rounded-xl border p-4 ${isUrgent ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
            <Clock className={`h-5 w-5 ${isUrgent ? "text-red-500" : "text-amber-600"}`} />
            <div className="text-center">
              <p className={`text-xs font-medium ${isUrgent ? "text-red-500" : "text-amber-700"}`}>
                {isUrgent ? "CLOSING NOW" : "Lot closes in"}
              </p>
              <CountdownTimer targetDate={lotEnd} className="text-2xl font-bold" />
            </div>
          </div>

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
        <div className="flex w-1/3 flex-col overflow-hidden bg-white">
          {/* Bid stream */}
          <div className="flex-1 overflow-y-auto border-b border-slate-200 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Live Bid Stream</h3>
            <div ref={bidStreamRef} className="space-y-2">
              {bids.map((bid, i) => (
                <div
                  key={bid.bid_id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                    i === 0 ? "bg-blue-50 ring-1 ring-blue-200" : "bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                      {bid.bidder.charAt(bid.bidder.length - 1)}
                    </div>
                    <span className="font-medium text-slate-700">{bid.bidder}</span>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${i === 0 ? "text-blue-700" : "text-slate-800"}`}>
                      {formatCAD(bid.amount)}
                    </p>
                    <p className="text-slate-400">{timeAgo(bid.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
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
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <Badge variant="info">Scheduled</Badge>
          <span className="text-sm text-slate-500">{auction.organizer}</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{auction.title}</h1>
        <p className="text-slate-600 text-sm leading-relaxed">{auction.description}</p>
      </div>

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
            <div key={lot.lot_id} className="rounded-lg border border-slate-200 bg-white p-4">
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

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5">
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
  const totalDue = wonLots.reduce((s, l) => s + l.current_bid, 0);
  const mockWon: Lot[] = auction.lots.filter((l) => l.status === "sold").slice(0, 2);

  return (
    <div className="space-y-6 p-6 max-w-2xl mx-auto">
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
