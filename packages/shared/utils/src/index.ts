/**
 * MATEX Shared Utilities
 */
import { createHash, randomUUID } from "node:crypto";

// ============================================================================
// ID Generation
// ============================================================================

export function generateId(): string {
  return randomUUID();
}

// ============================================================================
// Date/Time
// ============================================================================

export function now(): string {
  return new Date().toISOString();
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

// ============================================================================
// Currency
// ============================================================================

export function formatCAD(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

export function roundToTwoDecimals(num: number): number {
  return Math.round(num * 100) / 100;
}

// ============================================================================
// Commission Calculation
// ============================================================================

interface CommissionConfig {
  rate: number; // e.g. 0.035 for 3.5%
  minimum: number; // e.g. 25
  cap: number; // e.g. 5000
}

export function calculateCommission(amount: number, config: CommissionConfig): number {
  const commission = roundToTwoDecimals(amount * config.rate);
  return Math.min(Math.max(commission, config.minimum), config.cap);
}

// ============================================================================
// Weight Tolerance
// ============================================================================

export function isWithinTolerance(
  expected: number,
  actual: number,
  tolerancePct: number
): { within: boolean; deviation: number; deviationPct: number } {
  const deviation = actual - expected;
  const deviationPct = (deviation / expected) * 100;
  return {
    within: Math.abs(deviationPct) <= tolerancePct,
    deviation: roundToTwoDecimals(deviation),
    deviationPct: roundToTwoDecimals(deviationPct),
  };
}

// ============================================================================
// Validation
// ============================================================================

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidCanadianPhone(phone: string): boolean {
  return /^\+1[2-9]\d{9}$/.test(phone.replace(/[\s\-\(\)]/g, ""));
}

export function isValidPostalCode(code: string): boolean {
  return /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(code);
}

export function isValidBusinessNumber(bn: string): boolean {
  return /^\d{9}(RT\d{4})?$/.test(bn.replace(/[\s\-]/g, ""));
}

// ============================================================================
// Sanitization (for logging)
// ============================================================================

export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitive = ["password", "token", "secret", "credit_card", "sin", "ssn", "account_number"];
  const sanitized = { ...obj };

  for (const key of Object.keys(sanitized)) {
    if (sensitive.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = "[REDACTED]";
    }
  }

  return sanitized;
}

// ============================================================================
// Sanitization (for user-facing upstream errors)
// ============================================================================

const UPSTREAM_FALLBACK = "The service is temporarily unavailable. Please try again.";

const SAFE_ERROR_CODES: ReadonlySet<string> = new Set([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INVALID_STATE",
  "RATE_LIMITED",
  "ALREADY_EXISTS",
  "CONFLICT",
  "INSUFFICIENT_FUNDS",
  "EXPIRED",
]);

/**
 * Returns a user-safe error payload from an arbitrary upstream response body.
 * Database errors, stack traces, and column names are never echoed to the client.
 * Pass the raw upstream body separately to the logger; only the return value is safe to ship.
 */
export function sanitizeUpstreamError(
  upstreamBody: unknown,
  upstreamStatus: number
): { code: string; message: string } {
  if (upstreamBody && typeof upstreamBody === "object" && "error" in upstreamBody) {
    const e = (upstreamBody as { error?: { code?: string; message?: string } }).error;
    if (e?.code && SAFE_ERROR_CODES.has(e.code)) {
      const safeMessage = typeof e.message === "string" && e.message.length > 0 && e.message.length < 240
        ? e.message
        : UPSTREAM_FALLBACK;
      return { code: e.code, message: safeMessage };
    }
  }
  if (upstreamStatus >= 400 && upstreamStatus < 500) {
    return { code: "UPSTREAM_CLIENT_ERROR", message: UPSTREAM_FALLBACK };
  }
  return { code: "UPSTREAM_SERVER_ERROR", message: UPSTREAM_FALLBACK };
}

// ============================================================================
// Hashing
// ============================================================================

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ============================================================================
// Platform Config (runtime-configurable values from log_mcp.platform_config)
// ============================================================================

// Accepts the actual @supabase/supabase-js client without pulling its types into
// @matex/utils — we only need `schema().from().select().eq().maybeSingle()` to be callable.
// Typed as `any` so call sites can pass the real client without structural-type friction.
type SupabaseLike = any;

const _platformConfigCache = new Map<string, { value: number; expires_at: number }>();
const PLATFORM_CONFIG_TTL_MS = 60_000;

/**
 * Read a numeric value from log_mcp.platform_config. Returns the fallback
 * when the row is missing, the value cannot be parsed, or fails the validator.
 * Cached in-process for 60s to avoid hammering the DB on hot paths.
 */
export async function getPlatformConfigNumber(
  supabase: SupabaseLike | null,
  configKey: string,
  fallback: number,
  validator?: (n: number) => boolean,
): Promise<number> {
  const cached = _platformConfigCache.get(configKey);
  if (cached && cached.expires_at > Date.now()) return cached.value;
  if (!supabase) return fallback;
  try {
    const { data } = await supabase.schema("log_mcp").from("platform_config").select("config_value").eq("config_key", configKey).maybeSingle();
    const value = data?.config_value;
    if (value !== undefined && value !== null) {
      const parsed = parseFloat(String(value));
      if (Number.isFinite(parsed) && (!validator || validator(parsed))) {
        _platformConfigCache.set(configKey, { value: parsed, expires_at: Date.now() + PLATFORM_CONFIG_TTL_MS });
        return parsed;
      }
    }
  } catch {
    // fall through to fallback
  }
  return fallback;
}

export * from "./event-bus";
export { callServer } from "./inter-server";
export * from "./operational-rules";
export * from "./cross-border";
export { initSentry } from "./sentry";
export type { AnalyticsEvent, FunnelEvent, EngagementEvent, AnalyticsTraits } from "./analytics-events";
export { serverTrack, serverIdentify, serverAnalyticsShutdown } from "./server-analytics";
