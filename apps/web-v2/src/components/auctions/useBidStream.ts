"use client";

import { useEffect, useRef } from "react";
import { callTool } from "@/lib/api";
import type { BidStreamEntry } from "./BidStream";

type UseBidStreamArgs = {
  /** Active lot id; polling restarts when this changes. Pass null to stop. */
  lotId: string | null;
  /** Polling cadence in ms (default 5000). */
  intervalMs?: number;
  /** Called whenever the poll yields new bid entries. The hook merges based
   *  on `bid_id`, so callers should append-or-replace into their state. */
  onBids: (entries: BidStreamEntry[]) => void;
  /** Called with the latest current_bid + bid_count from `auction.get_auction`,
   *  used to keep the headline price/count fresh between user-placed bids. */
  onLotUpdate?: (current_bid: number, bid_count: number) => void;
  /** Auction id (for the get_auction refresh). Optional — when omitted, the
   *  hook only tries `auction.list_bids`. */
  auctionId?: string | null;
};

/**
 * Polls for new bids on the active lot and (optionally) refreshes the
 * top-line current_bid / bid_count by re-fetching the auction.
 *
 * Forward-compatible: the `auction.list_bids` MCP tool is not yet shipped.
 * When `callTool` returns `success: false` we silently skip — the UI still
 * reflects bids the local user places, plus the periodic top-line refresh.
 * Once the tool ships in auction-mcp, real-time bids from other bidders
 * start flowing with no UI change.
 */
export function useBidStream({
  lotId,
  intervalMs = 5000,
  onBids,
  onLotUpdate,
  auctionId,
}: UseBidStreamArgs): void {
  const onBidsRef = useRef(onBids);
  const onLotUpdateRef = useRef(onLotUpdate);
  onBidsRef.current = onBids;
  onLotUpdateRef.current = onLotUpdate;

  useEffect(() => {
    if (!lotId) return;
    let cancelled = false;

    async function tick() {
      // Bid history poll. The auction-mcp tool returns `{ lot_id, bids: [...], count }`;
      // the gateway may also return `data` as a bare array if a different upstream
      // ever serves this. Accept either shape.
      const bidsRes = await callTool("auction.list_bids", { lot_id: lotId, limit: 50 });
      if (!cancelled && bidsRes.success && bidsRes.data) {
        const raw = bidsRes.data as Record<string, unknown> | Array<Record<string, unknown>>;
        const rows: Array<Record<string, unknown>> = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as { bids?: unknown }).bids)
            ? ((raw as { bids: Array<Record<string, unknown>> }).bids)
            : [];
        const entries: BidStreamEntry[] = rows.map((row, i) => ({
          bid_id: String(row.bid_id ?? `srv-${i}`),
          bidder: String(row.bidder ?? row.bidder_id ?? "Anonymous"),
          amount: Number(row.amount ?? 0),
          timestamp: String(row.timestamp ?? row.created_at ?? new Date().toISOString()),
        }));
        if (entries.length > 0) onBidsRef.current(entries);
      }

      // Top-line refresh
      if (auctionId && onLotUpdateRef.current) {
        const auctionRes = await callTool("auction.get_auction", { auction_id: auctionId });
        if (!cancelled && auctionRes.success && auctionRes.data) {
          const lots = (auctionRes.data as { lots?: Array<Record<string, unknown>> }).lots;
          const lot = Array.isArray(lots)
            ? lots.find((l) => String(l.lot_id) === lotId)
            : undefined;
          if (lot) {
            onLotUpdateRef.current(Number(lot.current_bid ?? 0), Number(lot.bid_count ?? 0));
          }
        }
      }
    }

    // Fire immediately + then on interval
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [lotId, auctionId, intervalMs]);
}
