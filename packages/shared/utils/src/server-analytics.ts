/**
 * Server-side PostHog client. Used by the gateway and any MCP server that
 * needs to record events the browser can't see (e.g. background-job
 * outcomes, escrow releases triggered by Inngest, KYC status callbacks).
 *
 * Activation: set `POSTHOG_API_KEY` in the environment. No key ⇒ all calls
 * are no-ops (the SDK is never required, no network traffic). Optional
 * `POSTHOG_HOST` overrides the default EU host.
 *
 * Browser-side analytics live in `apps/web-v2/src/lib/analytics.ts` and
 * use `posthog-js`; the event-name registry in `./analytics-events.ts`
 * is shared between the two so dashboards stay consistent.
 *
 * Example — wire from a successful gateway tool dispatch:
 *
 *   const result = await routeToolRequest(claims, body, ipAddress);
 *   if (result.success && body.tool === "auction.place_auction_bid") {
 *     serverTrack("auction_bid_placed", claims.sub, {
 *       lot_id: body.args.lot_id,
 *       amount: body.args.amount,
 *       is_proxy: Boolean(body.args.max_proxy_bid),
 *     });
 *   }
 *
 * Example — wire from a MatexEventBus subscriber:
 *
 *   eventBus.subscribe("escrow.released", async (payload) => {
 *     serverTrack("escrow_released", String(payload.buyer_id ?? ""), {
 *       escrow_id: payload.escrow_id,
 *       amount_cents: payload.amount_cents,
 *     });
 *   });
 */

import type { AnalyticsEvent, AnalyticsTraits } from "./analytics-events";

type PostHogClient = {
  capture: (args: { distinctId: string; event: string; properties?: Record<string, unknown> }) => void;
  identify: (args: { distinctId: string; properties?: Record<string, unknown> }) => void;
  shutdown: () => Promise<void>;
};

let cachedClient: PostHogClient | null = null;
let initAttempted = false;

function getClient(): PostHogClient | null {
  if (cachedClient) return cachedClient;
  if (initAttempted) return null;
  initAttempted = true;

  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return null;

  // Lazy-require so processes without the env var never load the SDK.

  const { PostHog } = require("posthog-node") as typeof import("posthog-node");
  cachedClient = new PostHog(apiKey, {
    host: process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com",
    flushAt: 20,
    flushInterval: 10_000,
  }) as unknown as PostHogClient;
  return cachedClient;
}

/**
 * Capture an event for the given user. `distinctId` should match the
 * `distinct_id` PostHog has for the user from the browser side
 * (typically the Supabase user_id) so server + client events stitch.
 */
export function serverTrack(
  event: AnalyticsEvent,
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  const client = getClient();
  if (!client) return;
  if (!distinctId) return;
  try {
    client.capture({ distinctId, event, properties });
  } catch {
    // analytics must never throw into a request path
  }
}

/**
 * Attach traits to the given user (corporate registration, KYC tier, etc.)
 * Mirrors `posthog-js.identify` but server-side.
 */
export function serverIdentify(distinctId: string, traits?: AnalyticsTraits): void {
  const client = getClient();
  if (!client) return;
  if (!distinctId) return;
  try {
    client.identify({ distinctId, properties: traits });
  } catch {
    // analytics must never throw into a request path
  }
}

/**
 * Flushes the client and tears it down. Call from process exit hooks
 * (Railway sends SIGTERM) so in-flight events aren't dropped. No-op
 * when the client was never initialised.
 */
export async function serverAnalyticsShutdown(): Promise<void> {
  if (!cachedClient) return;
  try {
    await cachedClient.shutdown();
  } catch {
    // best-effort
  }
}
