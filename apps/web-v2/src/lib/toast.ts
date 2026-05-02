"use client";

import toast from "react-hot-toast";

type ErrorLike = { code?: string; message?: string; requestId?: string } | string | undefined;

/**
 * Show a sanitized error toast. The gateway already redacts upstream details
 * (see packages/shared/utils/src/index.ts:sanitizeUpstreamError); this helper
 * only formats it. If a `requestId` is present, append it so support can
 * correlate against Sentry / gateway logs.
 */
export function showError(err: ErrorLike, fallback = "Something went wrong. Please try again."): void {
  if (!err) {
    toast.error(fallback);
    return;
  }
  if (typeof err === "string") {
    toast.error(err);
    return;
  }
  const message = err.message ?? fallback;
  const ref = err.requestId ? ` (ref: ${err.requestId.slice(0, 8)})` : "";
  toast.error(`${message}${ref}`);
}

export function showSuccess(message: string): void {
  toast.success(message);
}
