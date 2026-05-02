"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * Mounts PostHog client analytics if NEXT_PUBLIC_POSTHOG_KEY is set.
 * No-op without a key, so dev / preview environments don't pollute analytics.
 *
 * The activation funnel (signup → email_verified → kyc_started → kyc_passed
 * → listing_created → first_sale_completed → escrow_released) is emitted by
 * the matching pages via `track(name, props)` from "@/lib/analytics".
 */
export function PostHogProvider() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    if ((posthog as unknown as { __loaded?: boolean }).__loaded) return;

    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: false,
    });
  }, []);

  return null;
}
