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

export function sanitizeUpstreamError(
  upstreamBody: unknown,
  upstreamStatus: number,
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
