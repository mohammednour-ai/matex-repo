// Edge runtime Sentry initialization. Loaded by @sentry/nextjs for any
// route segment opted into the Edge runtime. Today web-v2 doesn't use Edge
// for any user-facing routes, so this is a defensive stub.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
  });
}
