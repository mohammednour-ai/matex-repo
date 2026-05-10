"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[web-v2] app route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
        Something went wrong
      </p>
      <h1 className="text-2xl font-semibold text-fg">
        We couldn&apos;t load this page
      </h1>
      <p className="max-w-md text-sm text-fg-muted">
        The service is temporarily unavailable. Try again, or head back to the
        dashboard.
      </p>
      {error?.digest ? (
        <code className="rounded-lg bg-elevated px-2 py-1 text-xs text-fg-muted">
          ref: {error.digest}
        </code>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold text-fg-muted hover:bg-canvas"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
