"use client";

/**
 * <StripeProvider> — thin wrapper around @stripe/react-stripe-js's <Elements>
 * provider. Mounts only when a clientSecret is supplied and the publishable
 * key is configured.
 *
 * Pass the clientSecret returned by payments.create_payment_intent (PR 2).
 * The Elements provider then makes useStripe() / useElements() / <CardElement>
 * available to children that render the actual card form.
 *
 * Refs: docs/audit/2026-05-10/p0-1-stripe-elements-plan.md (PR 1).
 */

import { Elements } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { useMemo, type ReactNode } from "react";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe";

type Props = {
  clientSecret: string;
  children: ReactNode;
  /** Optional appearance overrides forwarded to Stripe's theming API. */
  appearance?: StripeElementsOptions["appearance"];
  /** Rendered when Stripe isn't configured for this environment. */
  fallback?: ReactNode;
};

const DEFAULT_APPEARANCE: StripeElementsOptions["appearance"] = {
  theme: "night",
  variables: {
    colorPrimary: "#3b82f6",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "8px",
  },
};

export function StripeProvider({
  clientSecret,
  children,
  appearance,
  fallback = null,
}: Props): JSX.Element | null {
  const stripePromise = useMemo(() => getStripeClient(), []);

  // Memoise options — Elements re-mounts (and re-fetches) when this object
  // identity changes, so a fresh object every render would trash the iframe.
  const options = useMemo<StripeElementsOptions>(
    () => ({ clientSecret, appearance: appearance ?? DEFAULT_APPEARANCE }),
    [clientSecret, appearance],
  );

  if (!isStripeConfigured() || !stripePromise) {
    return <>{fallback}</>;
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      {children}
    </Elements>
  );
}
