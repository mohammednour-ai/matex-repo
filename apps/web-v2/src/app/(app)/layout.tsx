"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  Search,
  Gavel,
  MessageSquare,
  ShoppingCart,
  Shield,
  Truck,
  Calendar,
  FileText,
  Settings,
  BarChart3,
  LineChart,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  UserCog,
  LogOut,
  HelpCircle,
  FileSearch,
} from "lucide-react";
import { clearSession, getUser } from "@/lib/api";
import { MatexCopilot } from "@/components/layout/MatexCopilot";
import { PwaInstallBanner } from "@/components/ui/PwaInstallBanner";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import clsx from "clsx";

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  accent?: boolean;
};

type NavSection = {
  heading?: string;
  items: NavItem[];
};

type CurrentUser = ReturnType<typeof getUser>;

const iconSize = 18;

const NAV_SECTIONS: NavSection[] = [
  {
    // Top section ordered as the user-journey: discover → list → bid → talk → pay
    items: [
      { label: "Overview", href: "/dashboard", icon: <LayoutDashboard size={iconSize} /> },
      { label: "Search", href: "/search", icon: <Search size={iconSize} /> },
      { label: "Listings", href: "/listings", icon: <Package size={iconSize} /> },
      { label: "Auctions", href: "/auctions", icon: <Gavel size={iconSize} />, accent: true },
      { label: "Messages", href: "/messages", icon: <MessageSquare size={iconSize} /> },
      { label: "Checkout", href: "/checkout", icon: <ShoppingCart size={iconSize} /> },
    ],
  },
  {
    heading: "Operations",
    items: [
      { label: "Escrow", href: "/escrow", icon: <Shield size={iconSize} /> },
      { label: "Logistics", href: "/logistics", icon: <Truck size={iconSize} /> },
      { label: "Inspections", href: "/inspections", icon: <Calendar size={iconSize} /> },
      { label: "Contracts", href: "/contracts", icon: <FileText size={iconSize} /> },
      { label: "Compliance", href: "/compliance", icon: <FileSearch size={iconSize} /> },
    ],
  },
  {
    heading: "Insights",
    items: [
      { label: "Market Intelligence", href: "/market", icon: <LineChart size={iconSize} />, accent: true },
      { label: "Analytics", href: "/analytics", icon: <BarChart3 size={iconSize} /> },
    ],
  },
  {
    heading: "Account",
    items: [
      { label: "Settings", href: "/settings", icon: <Settings size={iconSize} /> },
      { label: "Help & AI Copilot", href: "/chat", icon: <HelpCircle size={iconSize} /> },
    ],
  },
];

const ADMIN_NAV_ITEM: NavItem = {
  label: "Platform admin",
  href: "/admin",
  icon: <UserCog size={iconSize} />,
  accent: true,
};

function ClientAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // `ready` starts false on both server and first client render to avoid
  // hydration mismatch. After mount we read localStorage and either redirect
  // to /login or flip ready=true to render the app shell.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("matex_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="app-shell-canvas relative flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <div
          className="pointer-events-none absolute inset-0 bg-[length:24px_24px]"
          style={{
            backgroundImage:
              "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
          }}
          aria-hidden
        />
        <div className="relative flex flex-col items-center gap-3">
          <div className="h-11 w-11 rounded-2xl border-2 border-brand-500/30 border-t-brand-500 animate-spin shadow-[0_0_18px_-6px_rgba(232,119,34,0.30)]" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fg-subtle">
            Loading Matex
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const COLLAPSED_W = 72;
const EXPANDED_W = 312;

function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const [showAdminNav, setShowAdminNav] = useState(false);
  const [user, setUser] = useState<CurrentUser>(null);
  useEffect(() => {
    setShowAdminNav(Boolean(getUser()?.isPlatformAdmin));
    setUser(getUser());
  }, [pathname]);
  // Esc closes the mobile drawer when it's open. Click-outside backdrop is
  // already wired; this gives keyboard users an equivalent affordance.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onMobileClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen, onMobileClose]);
  const width = collapsed ? COLLAPSED_W : EXPANDED_W;

  const logo = (
    <Link
      href="/dashboard"
      className="flex min-w-0 flex-shrink-0 items-center"
      onClick={onMobileClose}
    >
      <Image
        src="/LogoOrangeTrns.png"
        alt="Matex"
        width={320}
        height={110}
        className={
          collapsed
            ? "h-16 w-16 object-contain object-center drop-shadow-[0_0_14px_rgba(232,119,34,0.22)]"
            : "h-28 w-auto max-w-[17rem] object-contain object-left drop-shadow-[0_0_14px_rgba(232,119,34,0.22)] sm:h-32 sm:max-w-[18rem]"
        }
        priority
      />
    </Link>
  );

  const navLinks = (isMobile: boolean) => (
    <>
      {NAV_SECTIONS.map((section, si) => (
        <div key={si} className="mb-1">
          {section.heading && !collapsed && !isMobile && (
            <p className="app-nav-heading">
              {section.heading}
            </p>
          )}
          {section.heading && isMobile && (
            <p className="app-nav-heading">
              {section.heading}
            </p>
          )}
          {section.items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed && !isMobile ? item.label : undefined}
                onClick={onMobileClose}
                className={[
                  "app-nav-link",
                  active
                    ? "app-nav-link-active"
                    : item.accent
                      ? "app-nav-link-accent"
                      : "",
                ].join(" ")}
              >
                <span className="app-nav-icon-wrap">{item.icon}</span>
                {(isMobile || !collapsed) && (
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                )}
                {active && <span className="app-nav-dot" />}
              </Link>
            );
          })}
        </div>
      ))}
      {showAdminNav && (
        <div className="mb-1 mt-2 border-t border-white/5 pt-2">
          {(() => {
            const item = ADMIN_NAV_ITEM;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed && !isMobile ? item.label : undefined}
                onClick={onMobileClose}
                className={[
                  "app-nav-link",
                  active ? "app-nav-link-active" : item.accent ? "app-nav-link-accent" : "",
                ].join(" ")}
              >
                <span className="app-nav-icon-wrap">{item.icon}</span>
                {(isMobile || !collapsed) && <span className="truncate whitespace-nowrap">{item.label}</span>}
                {active && <span className="app-nav-dot" />}
              </Link>
            );
          })()}
        </div>
      )}
    </>
  );

  const sidebarContent = (
    <div
      className="app-shell-sidebar transition-all duration-200 ease-in-out"
      style={{ width }}
    >
      <div className="app-shell-sidebar-content">
        <div
          className="app-sidebar-logo-wrap flex-shrink-0"
          style={{ minWidth: width }}
        >
          {logo}
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          {navLinks(false)}
        </nav>

        <div className="hidden flex-shrink-0 border-t border-white/5 p-3 md:block">
          <div className={collapsed ? "flex justify-center" : "flex items-center justify-between gap-3"}>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-fg-subtle">
                  Experience
                </p>
                <p className="mt-1 text-xs text-fg-subtle">Production-grade workspace</p>
              </div>
            )}
            <button
              onClick={onToggle}
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-surfaceBg/[0.04] text-fg-subtle transition-colors hover:text-fg hover:bg-surfaceBg/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden>
        <div className="metal-texture absolute inset-0" />
      </div>
    </div>
  );

  return (
    <>
      <aside
        className="hidden md:flex fixed top-0 left-0 h-screen z-30 flex-col"
        style={{ width }}
      >
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Main navigation"
        >
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onMobileClose}
            aria-hidden
          />
          <aside className="relative flex flex-col z-50" style={{ width: EXPANDED_W }}>
            <div className="app-shell-sidebar">
              <div className="app-shell-sidebar-content">
                <div className="app-sidebar-logo-wrap flex items-center justify-between">
                  <Link href="/dashboard" className="flex items-center gap-3" onClick={onMobileClose}>
                    <Image
                      src="/LogoOrangeTrns.png"
                      alt="Matex"
                      width={320}
                      height={110}
                      className="h-28 w-auto max-w-[17rem] object-contain object-left drop-shadow-[0_0_14px_rgba(232,119,34,0.22)] sm:h-32 sm:max-w-[18rem]"
                      priority
                    />
                  </Link>
                  <button
                    onClick={onMobileClose}
                    type="button"
                    aria-label="Close navigation"
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-surfaceBg/[0.04] text-fg-subtle hover:bg-surfaceBg/[0.08] hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <X size={18} aria-hidden />
                  </button>
                </div>
                <nav className="flex-1 py-3 overflow-y-auto">
                  {navLinks(true)}
                </nav>
              </div>
              <div className="pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden>
                <div className="metal-texture absolute inset-0" />
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function MobileMenuTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open navigation"
      className="fixed left-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-surfaceBg/80 text-fg-muted backdrop-blur transition-colors hover:border-brand-400/40 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:hidden"
    >
      <Menu size={20} aria-hidden />
    </button>
  );
}

function UserMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);

  useEffect(() => {
    setUser(getUser());
  }, [pathname]);

  // On /dashboard, the account menu is folded into <DashboardIdentityBar />'s
  // identity strip so there's no duplicate avatar in the top-right.
  if (pathname === "/dashboard" || pathname === "/dashboard/") return null;

  async function handleSignOut() {
    // Awaiting the DELETE matters: it clears the HttpOnly matex_session
    // cookie that the middleware checks. If we kicked router.replace
    // before this resolved, a quick back-button navigation could land
    // the user back on a protected page because the cookie is still
    // valid for a few hundred ms after sign-out. The original .catch(() => {})
    // swallowed errors silently; we keep that since sign-out should
    // succeed locally even when the server-side clear fails.
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch {
      // Network drop on sign-out — local state is still cleared below
      // and the cookie has a short Max-Age. Surface nothing to the user.
    }
    clearSession();
    router.replace("/login");
  }

  const userInitial = user?.email?.charAt(0).toUpperCase() ?? "M";
  const companyLabel =
    user?.accountType === "buyer"
      ? "Buyer"
      : user?.accountType === "seller"
        ? "Seller"
        : "Hybrid";

  return (
    <div className="fixed right-4 top-4 z-30">
      <div className="relative">
        <button
          type="button"
          onClick={() => setAvatarOpen((o) => !o)}
          aria-label="Account menu"
          aria-expanded={avatarOpen}
          aria-haspopup="true"
          className="flex items-center gap-3 rounded-2xl border border-line bg-surfaceBg/80 px-2.5 py-2 text-left text-white shadow-lg backdrop-blur transition-all hover:border-brand-400/40 hover:bg-elevated/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-night-700 to-night-800 text-sm font-black text-white ring-1 ring-brand-500/30 shadow-[0_8px_20px_-10px_rgba(0,0,0,0.65)]">
            {userInitial}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-sm font-semibold text-fg">
              {user?.email?.split("@")[0] ?? "Matex user"}
            </span>
            <span className="text-xs text-fg-subtle">{companyLabel}</span>
          </span>
        </button>

        {avatarOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setAvatarOpen(false)}
              aria-hidden
            />
            <div className="absolute right-0 top-full z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-canvas py-1 shadow-2xl">
              <div className="border-b border-line/60 px-4 py-3">
                <p className="truncate text-sm font-semibold text-fg">
                  {user?.email?.split("@")[0] ?? "Matex user"}
                </p>
                <p className="truncate text-xs text-fg-subtle">{user?.email}</p>
              </div>
              <div className="border-b border-line/60 px-4 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-fg-disabled">
                  Theme
                </p>
                <ThemeToggle />
              </div>
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setAvatarOpen(false);
                    router.push("/settings");
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-fg-muted transition-colors hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                >
                  <Settings size={15} aria-hidden />
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAvatarOpen(false);
                    handleSignOut();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-fg-muted transition-colors hover:bg-elevated hover:text-danger-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                >
                  <LogOut size={15} aria-hidden />
                  Sign out
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const SIDEBAR_COLLAPSED_KEY = "matex_sidebar_collapsed";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Sidebar collapsed state persists across reloads (P2-1). We start
  // with `false` on the server + initial client render to avoid a
  // hydration mismatch, then hydrate from localStorage in a layout
  // effect. The width transition CSS hides the one-frame change.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
        setCollapsed(true);
      }
    } catch {
      // Private mode / storage disabled — fall through with the default.
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  const sidebarWidth = collapsed ? COLLAPSED_W : EXPANDED_W;
  const isDashboard = pathname === "/dashboard" || pathname === "/dashboard/";

  // Re-trigger the page-enter CSS animation on route change WITHOUT
  // remounting children. Removing/re-adding the class + a forced reflow
  // restarts the keyframes; React subtree state stays intact so navigation
  // doesn't refire all the page-level data fetches.
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    el.classList.remove("page-enter");
    // Force reflow so the next class addition restarts the animation.
    void el.offsetWidth;
    el.classList.add("page-enter");
  }, [pathname]);

  return (
    <ClientAuthGuard>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
      >
        Skip to main content
      </a>

      <Sidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <header role="banner">
        <MobileMenuTrigger onOpen={() => setMobileOpen(true)} />
        <UserMenu />
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className={clsx(
          "app-shell-canvas min-h-screen transition-[margin] duration-200 focus:outline-none",
          isDashboard && "dashboard-canvas",
        )}
        style={{ marginLeft: sidebarWidth }}
      >
        <div className="app-shell-canvas-texture" aria-hidden>
          <div className="metal-texture absolute inset-0" />
        </div>
        {isDashboard && (
          // Fixed to the viewport (not the scroll container) so the
          // animation only ever has to paint a viewport-sized area —
          // independent of page height, decoupled from scroll.
          <div
            aria-hidden
            className="dashboard-og-watermark pointer-events-none absolute inset-0 z-0 bg-industrial-grain opacity-[0.10]"
            style={{
              maskImage:
                "radial-gradient(ellipse 35% 50% at 60% 50%, rgba(0,0,0,0.95), transparent 78%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 35% 50% at 60% 50%, rgba(0,0,0,0.95), transparent 78%)",
            }}
          />
        )}
        <div className="app-content-frame">
          <div ref={pageRef} className="page-enter">
            {children}
          </div>
        </div>
      </main>

      <MatexCopilot />
      <PwaInstallBanner />
    </ClientAuthGuard>
  );
}
