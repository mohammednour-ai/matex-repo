// Browser-side Sentry initialization. Loaded automatically by @sentry/nextjs.
// Activated only when NEXT_PUBLIC_SENTRY_DSN is set; in dev with no DSN, this
// is a no-op so local builds aren't blocked on a missing key.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
    // Defense in depth: drop any event whose message looks like a leaked SQL
    // or upstream-error string. The gateway sanitizer (sanitizeUpstreamError)
    // is the primary guard; this catches anything that slips through.
    beforeSend(event) {
      const msg = event.message ?? "";
      if (/column\s+\S+\.\S+\s+does\s+not\s+exist/i.test(msg)) return null;
      if (/^Upstream returned \d{3}/i.test(msg)) return null;
      return event;
    },
  });
}
