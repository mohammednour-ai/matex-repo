"use client";

import posthog from "posthog-js";
import type { AnalyticsEvent } from "@matex/utils";

/**
 * Browser-side analytics. The canonical event-name registry lives in
 * `@matex/utils/src/analytics-events.ts`; server-side captures (gateway,
 * Inngest functions, MCP servers) import the same names so dashboards
 * stay consistent.
 *
 * North-star metric: GMV through completed escrow releases (event:
 * `escrow_released` with `amount_cents`).
 */
export type { FunnelEvent, EngagementEvent, AnalyticsEvent, AnalyticsTraits } from "@matex/utils";

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
