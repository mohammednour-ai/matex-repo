"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export type BidStreamEntry = {
  bid_id: string;
  bidder: string;
  amount: number;
  timestamp: string;
  /** Optional flag forwarded by callers when this entry was just placed via
   *  the local user's "Place Bid" action — used to apply a one-shot
   *  highlight animation. */
  fresh?: boolean;
};

type BidStreamProps = {
  bids: BidStreamEntry[];
  /** Compared against `bid.bidder` to render the "you" badge for bids the
   *  current user placed. Pass the email-prefix the backend stamps on the
   *  bid payload (today: `email.split('@')[0]`). */
  currentUserKey?: string | null;
  className?: string;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Live bid-stream feed for the auction console. The newest bid sits at the
 * top with a brand-coloured highlight; subsequent bids fade into a neutral
 * grey row.
 *
 * The component is presentation-only — the parent owns the data fetch / poll
 * loop and feeds an ordered (newest-first) array. Forward-compatible with
 * the not-yet-shipped `auction.list_bids` MCP tool: when bids start arriving
 * from other bidders, no UI change is needed.
 */
export function BidStream({ bids, currentUserKey, className }: BidStreamProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const lastTopId = useRef<string | null>(null);

  // Auto-scroll the feed to the top when a new bid arrives.
  useEffect(() => {
    const top = bids[0];
    if (top && top.bid_id !== lastTopId.current) {
      lastTopId.current = top.bid_id;
      topRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [bids]);

  return (
    <div className={cn("space-y-2", className)} ref={topRef}>
      {bids.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
          No bids yet. Be the first.
        </div>
      )}
      {bids.map((bid, i) => {
        const isTop = i === 0;
        const isYou = currentUserKey ? bid.bidder === currentUserKey : false;
        const initial = (bid.bidder.match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase();
        return (
          <div
            key={bid.bid_id}
            className={cn(
              "flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-all",
              isTop
                ? "bg-blue-50 ring-1 ring-blue-200 animate-in fade-in slide-in-from-top-1"
                : "bg-slate-50",
            )}
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                  isTop ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600",
                )}
              >
                {initial}
              </div>
              <span className="font-medium text-slate-700 flex items-center gap-1.5">
                {bid.bidder}
                {isYou && (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                    You
                  </span>
                )}
              </span>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  "font-bold tabular-nums",
                  isTop ? "text-blue-700" : "text-slate-800",
                )}
              >
                {formatCAD(bid.amount)}
              </p>
              <p className="text-slate-400">{timeAgo(bid.timestamp)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
