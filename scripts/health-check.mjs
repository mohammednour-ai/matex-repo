#!/usr/bin/env node

/**
 * Simple deploy health check gate for MCP Gateway.
 * Usage:
 *   node scripts/health-check.mjs
 * Env:
 *   HEALTHCHECK_URL (default: http://localhost:3001/health)
 *   HEALTHCHECK_TIMEOUT_MS (default: 8000)
 */

const url = process.env.HEALTHCHECK_URL ?? "http://localhost:3001/health";
const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS ?? 8000);

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(url, { method: "GET", signal: controller.signal });
  clearTimeout(timer);

  if (!response.ok) {
    throw new Error(`Health check failed with HTTP ${response.status}`);
  }

  const json = await response.json().catch(() => ({}));
  if (json?.status !== "ok") {
    throw new Error("Health check payload missing status=ok");
  }

  console.log(`Health check passed: ${url}`);
  process.exit(0);
} catch (error) {
  clearTimeout(timer);
  console.error(`Health check failed: ${url}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
