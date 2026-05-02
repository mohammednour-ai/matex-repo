/**
 * Canonical analytics event schema. Imported by both the browser-side
 * `apps/web-v2/src/lib/analytics.ts` (posthog-js) and the server-side
 * `serverTrack()` helper in `./server-analytics.ts` (posthog-node) so the
 * event-name registry lives in one place.
 *
 * North-star metric: GMV through completed escrow releases — event
 * `escrow_released` with `amount_cents`.
 *
 * Naming rules:
 * - snake_case event names
 * - past-tense verbs (`signup_completed`, not `signup`)
 * - properties are arbitrary `Record<string, unknown>` at the type level,
 *   but the per-event property contracts below document the expected shape
 *   for each event so dashboards stay consistent
 */

export type FunnelEvent =
  | "signup_completed"
  | "email_verified"
  | "kyc_started"
  | "kyc_passed"
  | "listing_created"
  | "first_sale_completed"
  | "escrow_released";

export type EngagementEvent =
  | "auction_viewed"
  | "auction_bid_placed"
  | "search_performed"
  | "saved_search_created"
  | "freight_quote_requested";

export type AnalyticsEvent = FunnelEvent | EngagementEvent;

/**
 * Per-event property contracts. Use these as the second argument to
 * `track()` / `serverTrack()` so dashboards have the fields they expect.
 * Properties are documented as comments rather than enforced as types so
 * consumers don't fight the type system when adding ad-hoc context.
 *
 * | event                    | required props                                 |
 * |--------------------------|------------------------------------------------|
 * | signup_completed         | account_type: "buyer"\|"seller"\|"both"        |
 * | email_verified           | (none)                                         |
 * | kyc_started              | provider: "onfido"\|"persona"                  |
 * | kyc_passed               | tier: 1\|2\|3                                  |
 * | listing_created          | listing_id, sale_mode                          |
 * | first_sale_completed     | listing_id, amount_cents                       |
 * | escrow_released          | escrow_id, amount_cents                        |
 * | auction_viewed           | auction_id, lot_count                          |
 * | auction_bid_placed       | lot_id, amount, is_proxy                       |
 * | search_performed         | query, result_count, filter_count              |
 * | saved_search_created     | filter_count                                   |
 * | freight_quote_requested  | listing_id, carrier_count                      |
 */

export type AnalyticsTraits = {
  account_type?: "buyer" | "seller" | "both";
  is_platform_admin?: boolean;
  kyc_tier?: 1 | 2 | 3;
  province?: string;
  /** Free-form additional traits — anything PostHog accepts. */
  [key: string]: unknown;
};
