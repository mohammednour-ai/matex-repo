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

export const inngest = new Inngest({ id: "matex-web" });

// ─── auction.scheduled_end ───────────────────────────────────────────────────
export const fnAuctionScheduledEnd = inngest.createFunction(
  {
    id: "auction-scheduled-end",
    retries: 3,
    triggers: [{ event: "auction.scheduled_end_due" }],
  },
  async ({ event, step }) => {
    const auctionId = String((event.data as { auction_id?: string })?.auction_id ?? "");
    await step.run("settle-highest-bid", async () => {
      // TODO: call auction-mcp.close_lot for each open lot in this auction.
      // The MCP server already has the locking + winner-finalization logic;
      // Inngest's job here is durability + retry.
      return { auction_id: auctionId, settled: true };
    });
    await step.run("create-escrow-hold", async () => {
      // TODO: call escrow-mcp.create_escrow for the winning bid.
      return { escrowed: true };
    });
    return { ok: true };
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
