/**
 * Sentry initialization helper shared across the gateway and the 24 MCP
 * servers. Each call site does:
 *
 *   const SERVER_NAME = "auction-mcp";
 *   initSentry(SERVER_NAME);
 *
 * Behaviour:
 * - Reads `SENTRY_DSN` from the environment. No DSN ⇒ no events, no overhead
 *   (the SDK is required lazily and `init()` is never called).
 * - Tags every event with `serverName` so a single Sentry project receives
 *   events from all servers but they remain filterable.
 * - Idempotent: a second call with the same serverName is a no-op so unit
 *   tests that import the server module multiple times don't double-init.
 */

const initialized = new Set<string>();

export function initSentry(serverName: string): void {
  if (!process.env.SENTRY_DSN) return;
  if (initialized.has(serverName)) return;
  initialized.add(serverName);

  // Lazy-require so consumers without SENTRY_DSN never pay the SDK load cost
  // and so this module can be imported in environments (e.g. the web build)
  // that don't have @sentry/node available.

  const Sentry = require("@sentry/node") as typeof import("@sentry/node");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
    serverName,
  });
}
