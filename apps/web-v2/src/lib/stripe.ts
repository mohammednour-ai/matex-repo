/**
 * Stripe.js client loader. Singleton — loadStripe() makes a network round-trip
 * the first time it's called, so we cache the resulting Promise across the
 * whole app and let consumers `await` it where they mount Elements.
 *
 * Returns null when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY isn't set so callers can
 * render a graceful "card payments unavailable" state in dev environments
 * without crashing. In production the absence of the key is a config error;
 * the surrounding UI is responsible for surfacing that.
 *
 * Refs: docs/audit/2026-05-10/p0-1-stripe-elements-plan.md (PR 1).
 */

import { loadStripe, type Stripe } from "@stripe/stripe-js";

let cached: Promise<Stripe | null> | null = null;

export function getStripeClient(): Promise<Stripe | null> | null {
  // process.env access is statically replaced at build time for NEXT_PUBLIC_
  // vars, so this works in both server and client bundles.
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) return null;
  if (cached) return cached;
  cached = loadStripe(publishableKey);
  return cached;
}

/**
 * True when a publishable key is configured for this build. Use to gate UI
 * (e.g. show "Card payments are not configured" rather than mounting an
 * empty Elements provider).
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}
