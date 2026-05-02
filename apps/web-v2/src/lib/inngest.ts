/**
 * Inngest client + durable function definitions (v4 API).
 *
 * The functions are gated on Inngest signing-key presence at deploy time
 * (Inngest serves them at /api/inngest only when the key is set). Without
 * a key the route still mounts but the platform won't trigger them — safe
 * default for dev/preview.
 *
 * Functions:
 *   - auction.scheduled_end  → settle highest bid, create escrow hold
 *   - escrow.release_timer   → 90-day fallback per Stripe Connect manual-payout window
 *   - kyc.poll_status        → poll Onfido / Persona until terminal state
 *   - email.daily_digest     → batch saved-search alerts
 *
 * The actual side-effect bodies are stubs that emit events into the existing
 * MatexEventBus (Redis Streams) for consumption by MCP servers. The
 * orchestration semantics — retry, backoff, idempotency — are owned by Inngest.
 */
import { Inngest } from "inngest";
import { callGatewayTool } from "./gateway-server";

export const inngest = new Inngest({ id: "matex-web" });

// All fields optional to match Inngest's JsonifyObject<T> step.run return
// type — readers below coerce with defaults.
type LotRow = {
  lot_id?: string;
  listing_id?: string;
  status?: string;
  current_highest_bid?: number;
  highest_bidder_id?: string;
};

// ─── auction.scheduled_end ───────────────────────────────────────────────────
// Reference end-to-end implementation for the four Inngest functions. The
// other three (escrow.release_timer, kyc.poll_status, email.daily_digest)
// follow the same `callGatewayTool` + per-entity `step.run` pattern.
export const fnAuctionScheduledEnd = inngest.createFunction(
  {
    id: "auction-scheduled-end",
    retries: 3,
    triggers: [{ event: "auction.scheduled_end_due" }],
  },
  async ({ event, step }) => {
    const auctionId = String((event.data as { auction_id?: string })?.auction_id ?? "");
    if (!auctionId) {
      return { ok: false, error: "missing auction_id" };
    }

    // 1. List open lots for this auction.
    const openLots: LotRow[] = await step.run("list-open-lots", async (): Promise<LotRow[]> => {
      const res = await callGatewayTool<{ lots?: LotRow[] }>("auction.get_auction", {
        auction_id: auctionId,
      });
      if (!res.success || !res.data) return [];
      return (res.data.lots ?? []).filter(
        (lot) => lot.status === "open" || lot.status === "active",
      );
    });

    // 2. Close each open lot. One step per lot so Inngest can retry an
    //    individual close without re-closing already-closed lots
    //    (auction-mcp.close_lot is idempotent at the DB level).
    const closed: Array<{ lotId: string; sold: boolean }> = [];
    for (const lot of openLots) {
      const lotId = String(lot.lot_id ?? "");
      if (!lotId) continue;
      const result = await step.run(`close-lot-${lotId}`, async () => {
        const res = await callGatewayTool<{ status?: string }>("auction.close_lot", {
          lot_id: lotId,
        });
        const isSold =
          res.success && res.data?.status === "sold" && Boolean(lot.highest_bidder_id);
        return { sold: Boolean(isSold) };
      });
      closed.push({ lotId, sold: Boolean(result.sold) });
    }

    // 3. For each sold lot: resolve seller from the listing, then create an
    //    escrow hold for the winning bid. order_id is derived from the lot
    //    so escrow.create_escrow can dedupe on retry.
    const escrows: Array<{ lotId: string; orderId: string; ok: boolean }> = [];
    for (const { lotId, sold } of closed) {
      const lot = openLots.find((l) => l.lot_id === lotId);
      if (!sold || !lot?.highest_bidder_id || !lot?.current_highest_bid) continue;
      const buyerId = String(lot.highest_bidder_id);
      const amount = Number(lot.current_highest_bid);
      const listingId = String(lot.listing_id ?? "");
      const escrowResult = await step.run(`create-escrow-${lotId}`, async () => {
        const orderId = `auction-${lotId}`;
        const listingRes = await callGatewayTool<{ seller_id?: string }>(
          "listing.get_listing",
          { listing_id: listingId },
        );
        const sellerId = String(listingRes.data?.seller_id ?? "");
        if (!sellerId) return { lotId, orderId, ok: false };
        const escrowRes = await callGatewayTool("escrow.create_escrow", {
          order_id: orderId,
          buyer_id: buyerId,
          seller_id: sellerId,
          amount,
          currency: "CAD",
        });
        return { lotId, orderId, ok: Boolean(escrowRes.success) };
      });
      escrows.push({
        lotId: String(escrowResult.lotId ?? lotId),
        orderId: String(escrowResult.orderId ?? `auction-${lotId}`),
        ok: Boolean(escrowResult.ok),
      });
    }

    return {
      ok: true,
      auction_id: auctionId,
      lots_closed: closed.length,
      lots_sold: closed.filter((c) => c.sold).length,
      escrows_created: escrows.filter((e) => e.ok).length,
    };
  },
);

// ─── escrow.release_timer ────────────────────────────────────────────────────
export const fnEscrowReleaseTimer = inngest.createFunction(
  {
    id: "escrow-release-timer",
    retries: 3,
    triggers: [{ event: "escrow.release_timer_due" }],
  },
  async ({ event, step }) => {
    const escrowId = String((event.data as { escrow_id?: string })?.escrow_id ?? "");
    await step.run("check-acceptance-window", async () => {
      // TODO: if buyer hasn't accepted within 14 days post-delivery, auto-release
      // to seller (subject to dispute hold).
      return { escrow_id: escrowId };
    });
    return { ok: true };
  },
);

// ─── kyc.poll_status ─────────────────────────────────────────────────────────
export const fnKycPollStatus = inngest.createFunction(
  {
    id: "kyc-poll-status",
    retries: 5,
    triggers: [{ event: "kyc.poll_status_requested" }],
  },
  async ({ event, step }) => {
    const userId = String((event.data as { user_id?: string })?.user_id ?? "");
    const status = await step.run("poll-provider", async () => {
      // TODO: call onfido-bridge or persona-bridge to fetch latest status.
      return "in_progress" as "in_progress" | "verified" | "failed";
    });
    if (status === "in_progress") {
      await step.sleep("wait-before-next-poll", "5m");
      // Re-emit the event to retry. (In a fuller impl we'd use step.invoke.)
    }
    return { user_id: userId, status };
  },
);

// ─── email.daily_digest ──────────────────────────────────────────────────────
export const fnEmailDailyDigest = inngest.createFunction(
  {
    id: "email-daily-digest",
    retries: 2,
    triggers: [{ cron: "0 13 * * *" }], // 13:00 UTC ≈ 09:00 ET
  },
  async ({ step }) => {
    const recipients = await step.run("collect-saved-search-subscribers", async () => {
      // TODO: query saved_searches with notify_via='email'.
      return [] as Array<{ user_id: string; email: string }>;
    });
    for (const r of recipients) {
      await step.run(`send-${r.user_id}`, async () => {
        // TODO: hand off to notifications-mcp / SendGrid.
        return { user_id: r.user_id };
      });
    }
    return { sent: recipients.length };
  },
);

export const inngestFunctions = [
  fnAuctionScheduledEnd,
  fnEscrowReleaseTimer,
  fnKycPollStatus,
  fnEmailDailyDigest,
];
