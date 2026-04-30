"use client";

import { useEffect, useState } from "react";
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
  ChevronLeft,
  ChevronRight,
  Bell,
  Menu,
  X,
  UserCog,
  LogOut,
  Sparkles,
} from "lucide-react";
import { callTool, getUser } from "@/lib/api";
import { MatexCopilot } from "@/components/layout/MatexCopilot";

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
    items: [
      { label: "Overview", href: "/dashboard", icon: <LayoutDashboard size={iconSize} /> },
      { label: "Listings", href: "/listings", icon: <Package size={iconSize} /> },
      { label: "Search", href: "/search", icon: <Search size={iconSize} /> },
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
    ],
  },
  {
    heading: "Insights",
    items: [
      { label: "Analytics", href: "/analytics", icon: <BarChart3 size={iconSize} /> },
    ],
  },
  {
    heading: "Account",
    items: [
      { label: "Settings", href: "/settings", icon: <Settings size={iconSize} /> },
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
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-steel-950 px-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          aria-hidden
        >
          <div className="metal-texture absolute inset-0" />
        </div>
        <div className="relative flex flex-col items-center gap-3">
          <div className="h-11 w-11 rounded-2xl border-2 border-brand-500/40 border-t-brand-500 animate-spin shadow-[0_0_20px_-4px_rgba(234,88,12,0.45)]" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-steel-500">
            Loading Matex
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const COLLAPSED_W = 68;
const EXPANDED_W = 256;

function getPageMeta(pathname: string): { title: string; subtitle: string; eyebrow: string } {
  const segment = pathname.split("/")[1] || "dashboard";
  switch (segment) {
    case "dashboard":
      return {
        title: "Overview",
        subtitle: "Stay on top of marketplace activity, execution, and next actions.",
        eyebrow: "Control Center",
      };
    case "listings":
      return {
        title: "Listings",
        subtitle: "Manage inventory, visibility, and buyer-ready supply.",
        eyebrow: "Sell",
      };
    case "search":
      return {
        title: "Search",
        subtitle: "Source verified materials with industrial-grade confidence.",
        eyebrow: "Buy",
      };
    case "auctions":
      return {
        title: "Auctions",
        subtitle: "Track live bidding opportunities and market movement.",
        eyebrow: "Market",
      };
    case "messages":
      return {
        title: "Messages",
        subtitle: "Keep negotiations, approvals, and buyer conversations moving.",
        eyebrow: "Inbox",
      };
    case "checkout":
      return {
        title: "Checkout",
        subtitle: "Monitor deal execution, payment, and order progression.",
        eyebrow: "Orders",
      };
    case "escrow":
      return {
        title: "Escrow",
        subtitle: "Review protected transactions and secure payment milestones.",
        eyebrow: "Operations",
      };
    case "logistics":
      return {
        title: "Logistics",
        subtitle: "Coordinate dispatch, transport, and delivery readiness.",
        eyebrow: "Operations",
      };
    case "inspections":
      return {
        title: "Inspections",
        subtitle: "Plan visits, checks, and technical verification events.",
        eyebrow: "Operations",
      };
    case "contracts":
      return {
        title: "Contracts",
        subtitle: "Centralize commercial paperwork and trading terms.",
        eyebrow: "Governance",
      };
    case "analytics":
      return {
        title: "Analytics",
        subtitle: "Platform-wide metrics on users, listings, orders, and revenue.",
        eyebrow: "Insights",
      };
    case "settings":
      return {
        title: "Settings",
        subtitle: "Manage company identity, KYC, and platform preferences.",
        eyebrow: "Account",
      };
    case "admin":
      return {
        title: "Platform admin",
        subtitle: "Configure internal controls and platform-wide oversight.",
        eyebrow: "Admin",
      };
    default:
      return {
        title: segment.charAt(0).toUpperCase() + segment.slice(1),
        subtitle: "Operate faster with a clean, unified Matex workspace.",
        eyebrow: "Workspace",
      };
  }
}

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
  const width = collapsed ? COLLAPSED_W : EXPANDED_W;
  const accountLabel =
    user?.accountType === "buyer"
      ? "Buyer workspace"
      : user?.accountType === "seller"
        ? "Seller workspace"
        : "Marketplace workspace";
  const emailLabel = user?.email ?? "Industrial materials exchange";

  const logo = (
    <Link
      href="/dashboard"
      className="flex min-w-0 flex-shrink-0 items-center gap-3"
      onClick={onMobileClose}
    >
      <span className="app-sidebar-logo-badge">
        <Image
          src="/MatexLogo.png"
          alt="Matex"
          width={200}
          height={64}
          className={
            collapsed
              ? "h-9 w-9 rounded-md object-cover object-left drop-shadow-md"
              : "h-10 w-auto max-w-[11rem] object-contain object-left drop-shadow-md"
          }
          priority
        />
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-[0.26em] text-brand-300">
            Matex Platform
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-steel-200">
            Industrial Exchange
          </span>
        </span>
      )}
      <span className="sr-only">Matex — Industrial Materials Exchange</span>
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

        {!collapsed && (
          <div className="px-3 pt-4">
            <div className="app-sidebar-meta">
              <p className="app-sidebar-meta-label">Workspace</p>
              <p className="app-sidebar-meta-value">{accountLabel}</p>
              <p className="mt-1 truncate text-xs text-steel-400">{emailLabel}</p>
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          {navLinks(false)}
        </nav>

        <div className="hidden flex-shrink-0 border-t border-white/5 p-3 md:block">
          <div className={collapsed ? "flex justify-center" : "flex items-center justify-between gap-3"}>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-steel-500">
                  Experience
                </p>
                <p className="mt-1 text-xs text-steel-300">Premium hybrid industrial UI</p>
              </div>
            )}
            <button
              onClick={onToggle}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-steel-400 transition-colors hover:text-white hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
        <div className="fixed inset-0 z-40 md:hidden flex">
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
                    <span className="app-sidebar-logo-badge">
                      <Image
                        src="/MatexLogo.png"
                        alt="Matex"
                        width={200}
                        height={64}
                        className="h-9 w-auto max-w-[10rem] object-contain object-left drop-shadow-md"
                        priority
                      />
                    </span>
                    <span>
                      <span className="block text-[10px] font-bold uppercase tracking-[0.26em] text-brand-300">
                        Matex Platform
                      </span>
                      <span className="block text-sm font-semibold text-steel-200">
                        Industrial Exchange
                      </span>
                    </span>
                  </Link>
                  <button
                    onClick={onMobileClose}
                    aria-label="Close navigation"
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-2 text-steel-400 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="px-3 pt-4">
                  <div className="app-sidebar-meta">
                    <p className="app-sidebar-meta-label">Workspace</p>
                    <p className="app-sidebar-meta-value">{accountLabel}</p>
                    <p className="mt-1 truncate text-xs text-steel-400">{emailLabel}</p>
                  </div>
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

function Header({
  sidebarWidth,
  onMobileMenuOpen,
}: {
  sidebarWidth: number;
  onMobileMenuOpen: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser>(null);
  const [searchValue, setSearchValue] = useState("");
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const pageMeta = getPageMeta(pathname);

  useEffect(() => {
    setUser(getUser());
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    async function loadUnread(): Promise<void> {
      const u = getUser();
      if (!u?.userId) return;
      const res = await callTool("notifications.get_notifications", {
        user_id: u.userId,
        unread_only: true,
        limit: 50,
      });
      if (cancelled || !res.success) return;
      const data = res.data as unknown as {
        notifications?: { read?: boolean }[];
        total_unread?: number;
      };
      const count = Array.isArray(data?.notifications)
        ? data.notifications.filter((n) => !n.read).length
        : Number(data?.total_unread ?? 0);
      setUnreadNotifications(Number.isFinite(count) ? count : 0);
    }
    void loadUnread();
    const id = window.setInterval(() => void loadUnread(), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pathname]);

  function handleSearch(e: React.FormEvent): void {
    e.preventDefault();
    const q = searchValue.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  function handleSignOut() {
    localStorage.removeItem("matex_token");
    router.replace("/login");
  }

  const userInitial = user?.email?.charAt(0).toUpperCase() ?? "M";
  const companyLabel = user?.accountType === "buyer" ? "Buyer" : user?.accountType === "seller" ? "Seller" : "Hybrid";

  return (
    <header
      className="app-glass-header fixed top-0 right-0 z-20 h-20 transition-all duration-200"
      style={{ left: sidebarWidth }}
    >
      <div className="app-header-surface">
        <button
          className="rounded-2xl border border-white/10 bg-white/[0.06] p-2.5 text-steel-300 transition-colors hover:bg-white/[0.1] hover:text-white md:hidden"
          onClick={onMobileMenuOpen}
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>

        <div className="min-w-0">
          <div className="hidden text-[10px] font-bold uppercase tracking-[0.24em] text-brand-300 sm:block">
            {pageMeta.eyebrow}
          </div>
          <h1 className="app-page-title truncate">{pageMeta.title}</h1>
          <p className="app-page-sub hidden truncate sm:block">{pageMeta.subtitle}</p>
        </div>

        <form onSubmit={handleSearch} className="ml-2 hidden max-w-md flex-1 xl:block">
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-steel-500"
            />
            <input
              type="search"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search materials, listings, orders..."
              className="app-header-search"
              aria-label="Search materials and orders"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="app-header-chip">
            <Sparkles className="h-3.5 w-3.5 text-brand-300" />
            Matex {companyLabel}
          </div>

          <button
            type="button"
            className="app-header-icon-button relative"
            aria-label={
              unreadNotifications > 0
                ? `Notifications (${unreadNotifications} unread)`
                : "Notifications"
            }
            onClick={() => router.push("/notifications")}
          >
            <Bell size={18} />
            {unreadNotifications > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-steel-950">
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            )}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setAvatarOpen((o) => !o)}
              aria-label="Account menu"
              aria-expanded={avatarOpen}
              aria-haspopup="true"
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-2.5 py-2 text-left text-white transition-all hover:border-white/20 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent-500 text-sm font-black text-white shadow-[0_12px_24px_-12px_rgba(249,115,22,0.75)]">
                {userInitial}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block truncate text-sm font-semibold text-steel-100">
                  {user?.email?.split("@")[0] ?? "Matex user"}
                </span>
                <span className="text-xs text-steel-400">{companyLabel}</span>
              </span>
            </button>

            {avatarOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setAvatarOpen(false)}
                  aria-hidden
                />
                <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-steel-900 py-1 shadow-2xl">
                  <div className="border-b border-white/5 px-4 py-3">
                    <p className="truncate text-sm font-semibold text-steel-100">
                      {user?.email?.split("@")[0] ?? "Matex user"}
                    </p>
                    <p className="truncate text-xs text-steel-400">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => { setAvatarOpen(false); router.push("/settings"); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-steel-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                    >
                      <Settings size={15} />
                      Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAvatarOpen(false); handleSignOut(); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-steel-300 transition-colors hover:bg-white/[0.06] hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                    >
                      <LogOut size={15} />
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarWidth = collapsed ? COLLAPSED_W : EXPANDED_W;

  return (
    <ClientAuthGuard>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <Header
        sidebarWidth={sidebarWidth}
        onMobileMenuOpen={() => setMobileOpen(true)}
      />

      <main
        className="app-shell-canvas min-h-screen pt-20 transition-all duration-200"
        style={{ marginLeft: sidebarWidth }}
      >
        <div className="app-shell-canvas-texture" aria-hidden>
          <div className="metal-texture absolute inset-0" />
        </div>
        <div className="app-content-frame">
          {children}
        </div>
      </main>

      <MatexCopilot />
    </ClientAuthGuard>
  );
}
