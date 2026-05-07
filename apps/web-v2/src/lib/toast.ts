"use client";

import { createElement } from "react";
import { toast } from "sonner";

type ErrorLike = { code?: string; message?: string; requestId?: string } | string | undefined;

/** Branded grphs status badges as toast icons. */
const ICON_ERROR = createElement("img", {
  src: "/grphs/Notifications/error-badge-n-error.png",
  alt: "",
  width: 22,
  height: 22,
  style: { width: 22, height: 22, objectFit: "contain" },
});
const ICON_SUCCESS = createElement("img", {
  src: "/grphs/Notifications/success-badge-n-success.png",
  alt: "",
  width: 22,
  height: 22,
  style: { width: 22, height: 22, objectFit: "contain" },
});
const ICON_WARNING = createElement("img", {
  src: "/grphs/Notifications/warning-badge-n-warning.png",
  alt: "",
  width: 22,
  height: 22,
  style: { width: 22, height: 22, objectFit: "contain" },
});

/** Generic safety redaction message produced by `normalizeError()` in lib/api.ts. */
const REDACTED_GENERIC = "The service is temporarily unavailable. Please try again.";

/**
 * Friendlier text per error code. When the gateway tags an error with one of
 * these codes the user gets actionable guidance instead of the generic mask.
 * Falls back to the gateway-provided message (or generic) for unknown codes.
 */
const CODE_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Your session has expired. Please sign in again.",
  AUTH_REQUIRED: "Your session has expired. Please sign in again.",
  RATE_LIMITED: "Too many requests. Wait a moment and try again.",
  VALIDATION_FAILED: "Some required fields are missing or invalid. Check the form and try again.",
  NOT_FOUND: "We couldn't find what you were looking for.",
  GATEWAY_UNREACHABLE: "Can't reach the Matex services right now. Check your connection and retry.",
  ORIGIN_NOT_ALLOWED: "This origin isn't allowed to make requests. Contact support.",
  CORS_BLOCKED: "Browser blocked the request (CORS). Reload and try again.",
};

/**
 * Show a sanitized error toast. The gateway already redacts upstream details
 * (see packages/shared/utils/src/index.ts:sanitizeUpstreamError); this helper
 * only formats it. If a `requestId` is present, append it so support can
 * correlate against Sentry / gateway logs.
 */
export function showError(err: ErrorLike, fallback = "Something went wrong. Please try again."): void {
  if (!err) {
    toast.error(fallback, { icon: ICON_ERROR });
    return;
  }
  if (typeof err === "string") {
    toast.error(err, { icon: ICON_ERROR });
    return;
  }

  // Code-specific override beats the (possibly redacted) generic message.
  const codeMessage = err.code ? CODE_MESSAGES[err.code] : undefined;
  // If the upstream message is the redaction placeholder AND we have no code-
  // specific text, fall back to the caller-provided fallback so the toast at
  // least mentions what action failed.
  const baseMessage =
    codeMessage
      ?? (err.message && err.message !== REDACTED_GENERIC ? err.message : fallback);

  const ref = err.requestId ? `  ·  ref ${err.requestId.slice(0, 6)}` : "";
  toast.error(`${baseMessage}${ref}`, { icon: ICON_ERROR });
}

export function showSuccess(message: string): void {
  toast.success(message, { icon: ICON_SUCCESS });
}

export function showWarning(message: string): void {
  toast.warning(message, { icon: ICON_WARNING });
}
