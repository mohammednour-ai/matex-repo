"use client";

import { Toaster as SonnerToaster } from "sonner";
import { cn } from "@/lib/cn";

/**
 * Mounts Sonner's <Toaster> with Matex defaults. Replaces the
 * `react-hot-toast` Toaster mounted in `components/system/ToastProvider.tsx`
 * once the migration in PR #13 lands.
 *
 * Use the helpers in `src/lib/toast.ts` to surface toasts; they delegate to
 * `sonner` so callsites don't import the toaster library directly.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: cn(
            "group rounded-xl border border-sky-200 bg-white shadow-lg",
            "text-sm text-sky-950",
          ),
          title: "font-semibold",
          description: "text-sky-700",
          actionButton: cn(
            "bg-brand-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold",
          ),
          cancelButton: cn(
            "bg-sky-100 text-sky-800 px-3 py-1.5 rounded-lg text-xs font-semibold",
          ),
        },
      }}
    />
  );
}
