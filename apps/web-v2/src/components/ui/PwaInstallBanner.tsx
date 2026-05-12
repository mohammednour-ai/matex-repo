"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "matex_pwa_install_dismissed";
const FRESH_KEY = "matex_freshly_registered";

/**
 * One-shot PWA install banner. Shows once per browser, only after a fresh
 * registration (the auth flow sets `matex_freshly_registered=1` in
 * localStorage), and only when the browser actually offers a
 * `beforeinstallprompt` event. Dismiss or accept → never shows again.
 */
export function PwaInstallBanner(): JSX.Element | null {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already running as an installed PWA → nothing to offer.
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(display-mode: standalone)").matches) return;
    // Previously dismissed → respect that.
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    // Only for freshly registered users — keep noise off the casual browse path.
    if (localStorage.getItem(FRESH_KEY) !== "1") return;

    const handler = (e: Event): void => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function persistDismiss(): void {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
      localStorage.removeItem(FRESH_KEY);
    } catch {
      /* storage unavailable — banner is in-memory only */
    }
  }

  function handleDismiss(): void {
    setVisible(false);
    persistDismiss();
  }

  async function handleInstall(): Promise<void> {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setVisible(false);
    persistDismiss();
  }

  if (!visible || !deferred) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="pwa-install-title"
      className="fixed bottom-6 right-6 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-brand-500/40 bg-surfaceBg p-5 shadow-2xl backdrop-blur"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-fg-subtle hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <X size={16} aria-hidden />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <div
          aria-hidden
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-brand-500/40 bg-brand-500/15 text-brand-400"
        >
          <Download size={24} />
        </div>
        <div className="min-w-0">
          <p id="pwa-install-title" className="text-sm font-semibold text-fg">
            Install Matex as an app
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            Faster access from your home screen, fewer round-trips to the browser tab bar.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleInstall}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Download size={14} aria-hidden /> Install
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-xl border border-line bg-canvas px-4 py-2 text-sm font-semibold text-fg-muted hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
