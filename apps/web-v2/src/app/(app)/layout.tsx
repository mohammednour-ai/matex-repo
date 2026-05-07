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
  LineChart,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  UserCog,
  LogOut,
} from "lucide-react";
import { getUser } from "@/lib/api";
import { MatexCopilot } from "@/components/layout/MatexCopilot";
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
      { label: "Market Intelligence", href: "/market", icon: <LineChart size={iconSize} />, accent: true },
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
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-[linear-gradient(165deg,#0e1116_0%,#15191f_42%,#1a1f27_100%)] px-6">
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(150,165,190,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(150,165,190,0.04)_1px,transparent_1px)] bg-[length:24px_24px]"
          aria-hidden
        />
        <div className="relative flex flex-col items-center gap-3">
          <div className="h-11 w-11 rounded-2xl border-2 border-brand-500/30 border-t-brand-500 animate-spin shadow-[0_0_18px_-6px_rgba(232,119,34,0.30)]" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-night-300">
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
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-night-300">
                  Experience
                </p>
                <p className="mt-1 text-xs text-night-300">Production-grade workspace</p>
              </div>
            )}
            <button
              onClick={onToggle}
              className="rounded-2xl border border-white/10 bg-night-850/[0.04] p-2 text-night-300 transition-colors hover:text-white hover:bg-night-850/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
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
                    aria-label="Close navigation"
                    className="rounded-2xl border border-white/10 bg-night-850/[0.04] p-2 text-night-300 hover:bg-night-850/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <X size={18} />
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
      className="fixed left-4 top-4 z-30 rounded-2xl border border-night-700 bg-night-850/80 p-2.5 text-night-200 backdrop-blur transition-colors hover:border-brand-400/40 hover:text-white md:hidden"
    >
      <Menu size={20} />
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

  function handleSignOut() {
    localStorage.removeItem("matex_token");
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
          className="flex items-center gap-3 rounded-2xl border border-night-700 bg-night-850/80 px-2.5 py-2 text-left text-white shadow-lg backdrop-blur transition-all hover:border-brand-400/40 hover:bg-night-800/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-night-700 to-night-800 text-sm font-black text-white ring-1 ring-brand-500/30 shadow-[0_8px_20px_-10px_rgba(0,0,0,0.65)]">
            {userInitial}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-sm font-semibold text-night-100">
              {user?.email?.split("@")[0] ?? "Matex user"}
            </span>
            <span className="text-xs text-night-300">{companyLabel}</span>
          </span>
        </button>

        {avatarOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setAvatarOpen(false)}
              aria-hidden
            />
            <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-night-700 bg-night-900 py-1 shadow-2xl">
              <div className="border-b border-night-700/60 px-4 py-3">
                <p className="truncate text-sm font-semibold text-night-100">
                  {user?.email?.split("@")[0] ?? "Matex user"}
                </p>
                <p className="truncate text-xs text-night-300">{user?.email}</p>
              </div>
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setAvatarOpen(false);
                    router.push("/settings");
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-night-200 transition-colors hover:bg-night-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                >
                  <Settings size={15} />
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAvatarOpen(false);
                    handleSignOut();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-night-200 transition-colors hover:bg-night-800 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
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
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarWidth = collapsed ? COLLAPSED_W : EXPANDED_W;
  const isDashboard = pathname === "/dashboard" || pathname === "/dashboard/";

  return (
    <ClientAuthGuard>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <MobileMenuTrigger onOpen={() => setMobileOpen(true)} />
      <UserMenu />

      <main
        className={clsx(
          "app-shell-canvas min-h-screen transition-all duration-200",
          isDashboard && "dashboard-canvas",
        )}
        style={{ marginLeft: sidebarWidth }}
      >
        <div className="app-shell-canvas-texture" aria-hidden>
          <div className="metal-texture absolute inset-0" />
        </div>
        {isDashboard && (
          <div
            aria-hidden
            className="dashboard-og-watermark pointer-events-none absolute inset-0 z-0 opacity-[0.07] mix-blend-screen"
            style={{
              backgroundImage: "url('/grphs/Brand/og-social-share-image-b-og-share.jpg')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              maskImage:
                "radial-gradient(ellipse 90% 70% at 50% 40%, rgba(0,0,0,0.85), transparent 78%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 90% 70% at 50% 40%, rgba(0,0,0,0.85), transparent 78%)",
            }}
          />
        )}
        <div className="app-content-frame">
          <div key={pathname} className="page-enter">
            {children}
          </div>
        </div>
      </main>

      <MatexCopilot />
    </ClientAuthGuard>
  );
}
