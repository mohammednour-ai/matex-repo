// Server-side Sentry initialization (Node runtime, App Router routes).
// Activated only when SENTRY_DSN is set.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

if (dsn) {
  Sentry.init({
    dsn,
    environment: env,
    tracesSampleRate: 0.1,
  });
  // Init runs once per Node process; a single structured log line is the
  // right amount of noise. Stays out of access logs (it's stdout, not the
  // request middleware).
  console.info(`[sentry] server init (env=${env})`);
} else if (env === "production") {
  console.warn("[sentry] server DSN not set in production — server errors will NOT be captured.");
}
