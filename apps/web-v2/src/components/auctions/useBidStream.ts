"use client";

import { useEffect, useRef } from "react";
import { callTool } from "@/lib/api";
import type { BidStreamEntry } from "./BidStream";

type UseBidStreamArgs = {
  /** Active lot id; polling restarts when this changes. Pass null to stop. */
  lotId: string | null;
  /** Polling cadence in ms (default 5000). Used when SSE is unavailable. */
  intervalMs?: number;
  /** Called whenever the poll or SSE yields new bid entries. The hook merges
   *  based on `bid_id`, so callers should append-or-replace into their state. */
  onBids: (entries: BidStreamEntry[]) => void;
  /** Called with the latest current_bid + bid_count from `auction.get_auction`,
   *  used to keep the headline price/count fresh between user-placed bids. */
  onLotUpdate?: (current_bid: number, bid_count: number) => void;
  /** Auction id (for the get_auction refresh + SSE subscription). When omitted,
   *  the hook only tries `auction.list_bids` over polling. */
  auctionId?: string | null;
};

/**
 * Subscribes to live bids for the active lot.
 *
 * Transport selection (P1-7b):
 *   1. If `auctionId` is present AND `EventSource` is available, open
 *      `/api/auctions/{auctionId}/bid-stream` — server-sent events from the
 *      Redis event bus deliver `bidding.bid.placed` events with sub-second
 *      latency.
 *   2. If the SSE connection errors before first `bid` event, or
 *      EventSource isn't supported (older browsers), fall back to polling
 *      `auction.list_bids` at `intervalMs` with ±20% jitter.
 *
 * Either way, the top-line price/count is kept fresh with a separate slow
 * poll of `auction.get_auction` (every 5x the bid cadence). Bids placed by
 * the local user surface optimistically via the caller's own state writes.
 */
export function useBidStream({
  lotId,
  intervalMs = 2000,
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
    let pollTimer: number | null = null;
    let lotRefreshTimer: number | null = null;
    let evtSource: EventSource | null = null;

    async function fetchBids() {
      // auction.list_bids returns `{ lot_id, bids: [...], count }`; or a
      // bare array depending on upstream. Accept both.
      const bidsRes = await callTool("auction.list_bids", { lot_id: lotId, limit: 50 });
      if (cancelled || !bidsRes.success || !bidsRes.data) return;
      const raw = bidsRes.data as Record<string, unknown> | Array<Record<string, unknown>>;
      const rows: Array<Record<string, unknown>> = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { bids?: unknown }).bids)
          ? (raw as { bids: Array<Record<string, unknown>> }).bids
          : [];
      const entries: BidStreamEntry[] = rows.map((row, i) => ({
        bid_id: String(row.bid_id ?? `srv-${i}`),
        bidder: String(row.bidder ?? row.bidder_id ?? "Anonymous"),
        amount: Number(row.amount ?? 0),
        timestamp: String(row.timestamp ?? row.created_at ?? new Date().toISOString()),
      }));
      if (entries.length > 0) onBidsRef.current(entries);
    }

    async function refreshLot() {
      if (!auctionId || !onLotUpdateRef.current) return;
      const auctionRes = await callTool("auction.get_auction", { auction_id: auctionId });
      if (cancelled || !auctionRes.success || !auctionRes.data) return;
      const lots = (auctionRes.data as { lots?: Array<Record<string, unknown>> }).lots;
      const lot = Array.isArray(lots) ? lots.find((l) => String(l.lot_id) === lotId) : undefined;
      if (lot) {
        onLotUpdateRef.current(Number(lot.current_bid ?? 0), Number(lot.bid_count ?? 0));
      }
    }

    function startPolling() {
      function tick() {
        if (cancelled) return;
        void fetchBids();
        const jitter = intervalMs * (0.8 + Math.random() * 0.4);
        pollTimer = window.setTimeout(tick, jitter);
      }
      tick();
    }

    function startLotRefresh() {
      // Slow lot-level refresh (5x bid cadence) keeps the top-line current_bid
      // / bid_count fresh without thundering. Runs in both transports —
      // SSE forwards bid events but doesn't carry the recomputed totals.
      function tick() {
        if (cancelled) return;
        void refreshLot();
        lotRefreshTimer = window.setTimeout(tick, intervalMs * 5);
      }
      tick();
    }

    function startSse() {
      if (!auctionId || typeof window.EventSource === "undefined") {
        startPolling();
        return;
      }
      let receivedAny = false;
      try {
        evtSource = new EventSource(`/api/auctions/${auctionId}/bid-stream`);
      } catch {
        startPolling();
        return;
      }

      evtSource.addEventListener("bid", (e) => {
        receivedAny = true;
        try {
          const payload = JSON.parse((e as MessageEvent).data) as Record<string, unknown>;
          if (String(payload.lot_id ?? "") !== lotId) return;
          onBidsRef.current([
            {
              bid_id: String(payload.bid_id ?? `sse-${Date.now()}`),
              bidder: String(payload.bidder ?? payload.bidder_id ?? "Anonymous"),
              amount: Number(payload.amount ?? 0),
              timestamp: String(payload.timestamp ?? new Date().toISOString()),
            },
          ]);
        } catch {
          /* malformed payload — skip; polling fallback would catch the bid */
        }
      });

      evtSource.addEventListener("error", () => {
        // EventSource auto-retries on its own. We only fall back to polling
        // if we never received a single bid event — once SSE has worked
        // we trust it to recover.
        if (!receivedAny && !cancelled) {
          evtSource?.close();
          evtSource = null;
          startPolling();
        }
      });
    }

    // Always do an immediate fetch so the timeline isn't empty while SSE
    // is opening — once the connection is alive future bids land via SSE
    // and this initial fetch isn't repeated.
    void fetchBids();
    startSse();
    startLotRefresh();

    return () => {
      cancelled = true;
      if (pollTimer != null) window.clearTimeout(pollTimer);
      if (lotRefreshTimer != null) window.clearTimeout(lotRefreshTimer);
      if (evtSource) evtSource.close();
    };
  }, [lotId, auctionId, intervalMs]);
}
