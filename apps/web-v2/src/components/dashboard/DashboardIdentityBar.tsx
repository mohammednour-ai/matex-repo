"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  CircleAlert,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import clsx from "clsx";
import { Badge } from "@/components/ui/shadcn/badge";

type KycVariant = "success" | "warning" | "danger" | "info" | "gray";

type DashboardIdentityBarProps = {
  email?: string;
  accountType?: string;
  kycLevel?: number;
  kycBadge?: { label: string; variant: KycVariant };
  /** Pre-formatted CAD strings (e.g. "$12,340.00") */
  walletDisplay?: string | null;
  escrowDisplay?: string | null;
  unreadCount?: number;
  /** Pulse-ticker slot rendered flush at the top of the hero
   *  (intended for the transparent-variant DashboardPulseStrip). */
  children?: ReactNode;
  /** Rest of the dashboard's page content — stat cards, market summary,
   *  quick actions, activity feed, etc. Rendered inside the same hero
   *  section so the identity-hero background spans the whole page. */
  pageContent?: ReactNode;
};

/**
 * Taller dashboard hero — gives the Canva industrial hero image room to show
 * AND folds the user identity (avatar / account dropdown / KYC tier / quick
 * balances / verification CTA) into a single strip inside the hero. The
 * global top-right UserMenu is hidden on /dashboard since this strip
 * supersedes it.
 */
export function DashboardIdentityBar({
  email,
  accountType,
  kycLevel = 0,
  kycBadge,
  walletDisplay,
  escrowDisplay,
  unreadCount,
  children,
  pageContent,
}: DashboardIdentityBarProps = {}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const userInitial = email?.charAt(0).toUpperCase() ?? "M";
  const accountLabel =
    accountType === "buyer"
      ? "Buyer"
      : accountType === "seller"
        ? "Seller"
        : accountType === "both"
          ? "Hybrid"
          : "Member";
  const showKycCta = kycLevel < 2;
  const hasQuickStats =
    Boolean(walletDisplay) ||
    Boolean(escrowDisplay) ||
    (unreadCount !== undefined && unreadCount > 0);

  async function handleSignOut() {
    setMenuOpen(false);
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("matex_token");
      window.localStorage.removeItem("matex_user");
    }
    router.replace("/login");
  }

  return (
    <section
      className="dashboard-identity-bar relative overflow-hidden rounded-2xl border border-night-700 bg-[linear-gradient(135deg,#1a1f27,#20262f_45%,#15191f_100%)] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.55)] ring-1 ring-white/5"
      aria-labelledby="dashboard-identity-heading"
    >
      {/* Hero image — fills the entire hero section so the identity-hero
          serves as the full background, not just a top band. object-cover
          + object-right keeps the figure anchored to the visible side
          even when the section grows tall with page content. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <Image
          src="/grphs/Dashboard/identity-hero-d-hero.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-right opacity-[0.95] brightness-110"
          aria-hidden
          priority
        />
      </div>
      {/* Top diagonal legibility wash — covers the whole section but
          lighter than before so the image reads more of itself through. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,rgba(10,10,11,0.62)_0%,rgba(15,17,21,0.40)_38%,rgba(15,17,21,0.10)_70%,rgba(15,17,21,0)_100%)]"
        aria-hidden
      />
      {/* Right-side text-mute wash — the source image has "Industrial
          Materials Exchange / Connecting Buyers and Sellers" baked into
          the upper-right area. A subtle right-anchored fade pushes that
          headline back into the surface so it reads as atmospheric
          detail rather than competing with the welcome overlay. */}
      <div
        className="pointer-events-none absolute right-0 top-0 hidden h-[400px] w-[55%] bg-[radial-gradient(ellipse_at_top_right,rgba(15,17,21,0.55)_0%,rgba(15,17,21,0.25)_45%,rgba(15,17,21,0)_75%)] sm:block sm:h-[480px] lg:h-[520px]"
        aria-hidden
      />
      {/* Vertical fade to dark — pixel-anchored stops, pushed deeper so
          the image stays visible for a longer band (matches the new
          full-section image fill). Resolves to opaque by ~1500px so page
          content below the hero zone reads on a solid dark canvas. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(15,17,21,0)_0px,rgba(15,17,21,0)_900px,rgba(15,17,21,0.35)_1050px,rgba(15,17,21,0.75)_1220px,rgba(15,17,21,0.93)_1380px,rgba(20,23,28,0.98)_1500px)]"
        aria-hidden
      />
      {/* Steel grain texture (subtle, kept) */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.05]" aria-hidden>
        <div className="metal-texture absolute inset-0" />
      </div>
      {/* Brand wash (top-right) + blueprint accent — pinned to the hero zone,
          not the new full-page bottom, so they don't drift out of context. */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-[-5rem] top-[28rem] h-48 w-48 rounded-full bg-info-500/10 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-col gap-6 px-5 py-6 sm:px-7 sm:py-8 lg:px-9 lg:py-10">
        {/* Pulse ticker slot — sits flush at the very top of the hero, fully
            transparent (no frame), so the LME / Matex prices and headlines
            read as part of the hero surface itself. Negative top margin
            pulls it closer to the hero's top edge. */}
        {children && <div className="-mt-2 w-full sm:-mt-3 lg:-mt-4">{children}</div>}

        {/* Spacer — pushes the welcome heading + identity row + KYC strip
            + CTAs down into the lower portion of the image area, where
            the legibility wash is darker. Gives the image the dominant
            visual weight in the upper hero, content reads below it. */}
        <div className="h-[200px] sm:h-[260px] lg:h-[320px]" aria-hidden />

        {/* Matex identity (left) + avatar/account menu (top-right) */}
        <div className="flex items-start justify-between gap-4">
          {/* The hero image already carries the "Industrial Materials
              Exchange" headline + "Connecting Buyers and Sellers" tagline.
              The component overlay only adds personalized workspace context
              so the page doesn't double up on brand copy. */}
          <div className="min-w-0 max-w-md">
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-brand-400">
              Matex Workspace
            </p>
            <h2
              id="dashboard-identity-heading"
              className="mt-1.5 text-2xl font-black leading-[1.05] tracking-tight text-white sm:text-[28px]"
            >
              {email ? `Welcome back, ${email.split("@")[0]}.` : "Welcome back."}
            </h2>
            <p className="mt-2.5 max-w-sm text-sm leading-relaxed text-night-200">
              Scrap & surplus · Escrow-backed settlement ·{" "}
              <span className="font-medium text-info-400">MCP-connected</span>
            </p>
          </div>

          {/* Avatar + account menu — top-right of the hero. Dropdown opens
              left-aligned to keep it inside the hero on narrower viewports. */}
          {email && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Account menu"
                aria-expanded={menuOpen}
                aria-haspopup="true"
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-night-950/55 px-2.5 py-2 text-left backdrop-blur-md transition-colors hover:border-brand-400/40 hover:bg-night-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
              >
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/80 to-brand-700/80 text-base font-black text-white ring-1 ring-brand-500/40 shadow-[0_8px_20px_-10px_rgba(232,119,34,0.55)]"
                >
                  {userInitial}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block truncate text-sm font-semibold text-night-100">
                    {email.split("@")[0]}
                  </span>
                  <span className="block truncate text-xs text-night-300">
                    {accountLabel}
                  </span>
                </span>
                <ChevronDown
                  size={16}
                  aria-hidden
                  className={clsx(
                    "hidden shrink-0 text-night-400 transition-transform duration-200 sm:block",
                    menuOpen && "rotate-180 text-night-200",
                  )}
                />
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                    aria-hidden
                  />
                  <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-night-700 bg-night-900 py-1 shadow-2xl">
                    <div className="border-b border-night-700/60 px-4 py-3">
                      <p className="truncate text-sm font-semibold text-night-100">
                        {email.split("@")[0]}
                      </p>
                      <p className="truncate text-xs text-night-300">{email}</p>
                    </div>
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push("/settings");
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-night-200 transition-colors hover:bg-night-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                      >
                        <Settings size={15} />
                        Settings
                      </button>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-night-200 transition-colors hover:bg-night-800 hover:text-danger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                      >
                        <LogOut size={15} />
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Spacer pushes the verification strip + CTAs to the bottom of the taller hero */}
        <div className="flex-1" aria-hidden />

        {/* KYC verification strip — sized to its content, anchored left.
            Shows the tier badge, quick balances, and the shortened verify CTA. */}
        {email && (kycBadge || hasQuickStats || showKycCta) && (
          <div className="flex w-fit max-w-full flex-col gap-3 self-start rounded-2xl border border-white/10 bg-night-950/55 px-4 py-3 backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* KYC tier — only show the badge when actually verified.
                  When kycLevel < 2, the shortened verify CTA below already
                  surfaces the unverified state; showing both is redundant. */}
              {kycBadge && !showKycCta && (
                <Badge variant={kycBadge.variant} className="shrink-0">
                  {kycBadge.label}
                </Badge>
              )}

              {/* Quick stats — sit next to the badge, content-width */}
              {hasQuickStats && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {walletDisplay && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <Wallet className="h-3.5 w-3.5 text-night-400" />
                      <span className="font-bold tabular-nums text-night-100">
                        {walletDisplay}
                      </span>
                    </div>
                  )}
                  {escrowDisplay && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="h-3.5 w-3.5 text-night-400" />
                      <span className="font-bold tabular-nums text-night-100">
                        {escrowDisplay}
                      </span>
                    </div>
                  )}
                  {unreadCount !== undefined && unreadCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <MessageSquare className="h-3.5 w-3.5 text-night-400" />
                      <span className="font-bold tabular-nums text-night-100">
                        {unreadCount}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Shortened verification nudge — only when KYC < 2 */}
            {showKycCta && (
              <Link
                href="/settings"
                className="flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm text-night-100 transition-colors hover:border-brand-500/50 hover:bg-brand-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
              >
                <CircleAlert className="h-4 w-4 shrink-0 text-brand-400" />
                <span className="min-w-0 flex-1 font-medium">
                  Verify your account to unlock larger trades
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-300">
                  Settings <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            )}
          </div>
        )}

        {/* Primary CTAs */}
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <Link
            href="/listings/create"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-500/40 bg-brand-500/15 px-5 py-2.5 text-sm font-bold text-brand-200 shadow-[0_8px_24px_-10px_rgba(232,119,34,0.45)] backdrop-blur-sm transition-all hover:border-brand-500/60 hover:bg-brand-500/25 hover:text-brand-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            <Plus className="h-4 w-4" />
            Create Listing
            <ArrowRight className="h-3.5 w-3.5 opacity-70" />
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-night-700 bg-night-800/70 px-5 py-2.5 text-sm font-semibold text-night-100 backdrop-blur-sm transition-all hover:border-brand-500/30 hover:bg-night-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            <Search className="h-4 w-4" />
            Browse Materials
          </Link>
        </div>

        {/* The rest of the dashboard — stat cards, market summary, quick
            actions, activity feed, upcoming events — rendered inside the
            same hero section so the identity-hero background spans the
            entire page. */}
        {pageContent && (
          <div className="mt-4 space-y-7 sm:mt-6 sm:space-y-8">{pageContent}</div>
        )}
      </div>
    </section>
  );
}
