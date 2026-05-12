"use client";

/**
 * First-time dashboard onboarding tour (P2-9).
 *
 * A small modal-style tour that walks a new user through the five top-of-funnel
 * surfaces (Search → Listings → Auctions → Messages → Wallet). Anchor-based
 * positioning would be more visually integrated but the dashboard layout
 * shifts considerably across breakpoints; a centered modal is durable and
 * keeps the rendering trivial.
 *
 * Trigger contract: `<OnboardingTour />` mounts inside the dashboard and
 * decides for itself whether to render. localStorage key
 * `matex_onboarding_complete=1` records that the user has either completed
 * or dismissed the tour. The Help & Copilot tab can offer a "Replay tour"
 * link that just deletes the key — out of scope for this PR.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Package, Gavel, MessageSquare, Wallet, X } from "lucide-react";

type Step = {
  icon: typeof Search;
  title: string;
  body: string;
  cta?: { label: string; href: string };
};

const STEPS: Step[] = [
  {
    icon: Search,
    title: "Discover materials",
    body:
      "Use Search to filter by material, grade, location, and pricing. Save searches to get alerts when new listings match.",
    cta: { label: "Open Search", href: "/search" },
  },
  {
    icon: Package,
    title: "Create listings",
    body:
      "Sellers list scrap and surplus inventory with photos, weights, and certifications. Buyers can request quotes or buy at the listed price.",
    cta: { label: "Browse Listings", href: "/listings" },
  },
  {
    icon: Gavel,
    title: "Bid in auctions",
    body:
      "Live auctions clear large lots quickly. Register for an auction lobby, then place bids in real-time during the event.",
    cta: { label: "View Auctions", href: "/auctions" },
  },
  {
    icon: MessageSquare,
    title: "Message counterparties",
    body:
      "Every deal has a thread for clarifications, document exchange, and weight reconciliation. Messages are auditable for compliance.",
    cta: { label: "Open Messages", href: "/messages" },
  },
  {
    icon: Wallet,
    title: "Wallet & escrow",
    body:
      "Funds move through Matex escrow — never directly between buyer and seller. Settings carry your KYC level, which gates higher trade limits.",
    cta: { label: "Open Settings", href: "/settings" },
  },
];

const STORAGE_KEY = "matex_onboarding_complete";

export function OnboardingTour() {
  // `open` starts false on both server and first client render to avoid the
  // hydration mismatch a localStorage read would cause. The mount effect
  // reads the key and flips open=true when it's missing.
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
      setOpen(true);
    } catch {
      // private-mode / disabled localStorage — fall through and don't show
      // the tour rather than re-prompting forever on every reload.
    }
  }, []);

  function dismiss(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* same fallthrough as on read */
    }
    setOpen(false);
  }

  if (!open) return null;
  const s = STEPS[step];
  const Icon = s.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <button
        type="button"
        aria-label="Dismiss tour"
        onClick={dismiss}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-md rounded-2xl border border-line bg-surfaceBg shadow-2xl">
        <button
          type="button"
          aria-label="Close"
          onClick={dismiss}
          className="absolute right-3 top-3 rounded-full p-1.5 text-fg-subtle hover:bg-elevated hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-4 p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-400">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                Welcome to Matex · {step + 1} of {STEPS.length}
              </p>
              <h2 id="onboarding-title" className="text-base font-bold text-fg">
                {s.title}
              </h2>
            </div>
          </div>

          <p className="text-sm text-fg-muted">{s.body}</p>

          <div className="flex items-center justify-between border-t border-line/60 pt-4">
            <div className="flex gap-1">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={
                    i === step
                      ? "h-1.5 w-6 rounded-full bg-brand-500"
                      : "h-1.5 w-1.5 rounded-full bg-line"
                  }
                  aria-hidden
                />
              ))}
            </div>
            <div className="flex gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((n) => Math.max(0, n - 1))}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-fg-muted hover:bg-elevated"
                >
                  Back
                </button>
              )}
              {s.cta && (
                <Link
                  href={s.cta.href}
                  onClick={dismiss}
                  className="rounded-lg bg-elevated px-3 py-1.5 text-xs font-semibold text-fg-muted hover:bg-night-700"
                >
                  {s.cta.label}
                </Link>
              )}
              <button
                type="button"
                onClick={() => (isLast ? dismiss() : setStep((n) => Math.min(STEPS.length - 1, n + 1)))}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                {isLast ? "Got it" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
