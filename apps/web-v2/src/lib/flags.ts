"use client";

/**
 * Lightweight feature-flag registry.
 *
 * Today the flags are evaluated from environment variables. When PostHog is
 * wired up (see docs/deferred-work.md → B2), swap the body of `useFlag` to
 * call `posthog.isFeatureEnabled(name)` and keep the env-var path as the
 * server-side / SSR fallback.
 *
 * Flag names match the plan (matex-senior-wise-shore.md → §B3):
 *   - auctions_v2
 *   - freight_quote_widget
 *   - bilingual_ui
 *   - qc_market_open
 *   - ai_copilot
 *   - listings_table_view
 *   - typesense_search
 */

export type FlagName =
  | "auctions_v2"
  | "freight_quote_widget"
  | "bilingual_ui"
  | "qc_market_open"
  | "ai_copilot"
  | "listings_table_view"
  | "typesense_search";

const ENV_PREFIX = "NEXT_PUBLIC_FLAG_";

function envValue(name: FlagName): string | undefined {
  // Next inlines NEXT_PUBLIC_* at build time, so this works in the browser.
  // Any non-empty value other than "false"/"0" enables the flag.
  const key = `${ENV_PREFIX}${name.toUpperCase()}`;
  return (process.env as Record<string, string | undefined>)[key];
}

export function isFlagEnabled(name: FlagName): boolean {
  const v = envValue(name);
  if (v === undefined || v === "") return false;
  const normalized = v.toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "off";
}

/** React hook form. Stable (env-driven) — safe to use in render. */
export function useFlag(name: FlagName): boolean {
  return isFlagEnabled(name);
}
