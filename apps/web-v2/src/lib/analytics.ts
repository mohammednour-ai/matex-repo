"use client";

import posthog from "posthog-js";

/**
 * Activation funnel + product analytics events. Names are stable; do not rename
 * without updating the PostHog dashboards.
 *
 * North-star metric: GMV through completed escrow releases (event:
 * `escrow_released` with `amount_cents`).
 */
export type FunnelEvent =
  | "signup_completed"
  | "email_verified"
  | "kyc_started"
  | "kyc_passed"
  | "listing_created"
  | "first_sale_completed"
  | "escrow_released";

export type AnalyticsEvent =
  | FunnelEvent
  | "auction_viewed"
  | "auction_bid_placed"
  | "search_performed"
  | "saved_search_created"
  | "freight_quote_requested";

export function track(event: AnalyticsEvent, properties?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // analytics must never throw into the UI
  }
}

export function identify(userId: string, traits?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    posthog.identify(userId, traits);
  } catch {
    // analytics must never throw into the UI
  }
}

export function resetIdentity(): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    posthog.reset();
  } catch {
    // analytics must never throw into the UI
  }
}
