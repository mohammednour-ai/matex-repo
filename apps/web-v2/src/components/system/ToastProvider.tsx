"use client";

import { Toaster } from "react-hot-toast";

/**
 * Single mount point for the global toast system. Imported by the root layout.
 * Replaces ad-hoc `setError(string)` patterns that previously rendered inline
 * `<div className="text-red-500">…</div>` blocks scattered across pages.
 *
 * Usage:
 *   import { toast } from "react-hot-toast";
 *   toast.success("Listing saved");
 *   toast.error("Could not save listing");
 *
 * For longer-form errors with a request id (returned by the gateway sanitizer),
 * prefer `import { showError } from "@/lib/toast"`.
 */
export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: "#0f1320",
          color: "#fff",
          fontSize: "0.875rem",
          padding: "0.75rem 1rem",
          borderRadius: "0.75rem",
          boxShadow: "0 10px 30px -10px rgba(0,0,0,.45)",
        },
        success: { iconTheme: { primary: "#10b981", secondary: "#fff" } },
        error: { iconTheme: { primary: "#ef4444", secondary: "#fff" } },
      }}
    />
  );
}
