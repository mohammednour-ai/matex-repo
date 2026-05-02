"use client";

import { Toaster } from "@/components/ui/shadcn/sonner";

/**
 * Single mount point for the global toast system. Imported by the root layout.
 * Replaces ad-hoc `setError(string)` patterns that previously rendered inline
 * `<div className="text-red-500">…</div>` blocks scattered across pages.
 *
 * Usage:
 *   import { toast } from "sonner";
 *   toast.success("Listing saved");
 *   toast.error("Could not save listing");
 *
 * For longer-form errors with a request id (returned by the gateway sanitizer),
 * prefer `import { showError } from "@/lib/toast"`.
 */
export function ToastProvider() {
  return <Toaster />;
}
