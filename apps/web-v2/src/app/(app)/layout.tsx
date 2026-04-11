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
  ChevronLeft,
  ChevronRight,
  Bell,
  Menu,
  X,
  UserCog,
} from "lucide-react";
import { getUser } from "@/lib/api";
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

const iconSize = 18;

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Overview", href: "/dashboard", icon: <LayoutDashboard size={iconSize} /> },
      { label: "Listings", href: "/listings", icon: <Package size={iconSize} /> },
      { label: "Search", href: "/search", icon: <Search size={iconSize} /> },
      { label: "Auctions", href: "/auction", icon: <Gavel size={iconSize} />, accent: true },
      { label: "Messages", href: "/messages", icon: <MessageSquare size={iconSize} /> },
      { label: "Checkout", href: "/checkout", icon: <ShoppingCart size={iconSize} /> },
    ],
  },
  {
    heading: "Operations",
    items: [
      { label: "Escrow", href: "/escrow", icon: <Shield size={iconSize} /> },
      { label: "Logistics", href: "/logistics", icon: <Truck size={iconSize} /> },
      { label: "Inspections", href: "/inspection", icon: <Calendar size={iconSize} /> },
      { label: "Contracts", href: "/contracts", icon: <FileText size={iconSize} /> },
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
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("matex_token");
    if (!token) {
      router.replace("/login");
    } else {
      setChecked(true);
    }
  }, [router]);

  if (!checked) {
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
  useEffect(() => {
    setShowAdminNav(Boolean(getUser()?.isPlatformAdmin));
  }, [pathname]);
  const width = collapsed ? COLLAPSED_W : EXPANDED_W;

  const logo = (
    <Link
      href="/dashboard"
      className="flex min-w-0 flex-shrink-0 items-center"
      onClick={onMobileClose}
    >
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
      <span className="sr-only">Matex — Industrial Materials Exchange</span>
    </Link>
  );

  const navLinks = (isMobile: boolean) => (
    <>
      {NAV_SECTIONS.map((section, si) => (
        <div key={si} className="mb-1">
          {section.heading && !collapsed && !isMobile && (
            <p className="px-4 mb-2 mt-4 text-[10px] font-bold uppercase tracking-[0.15em] text-steel-500">
              {section.heading}
            </p>
          )}
          {section.heading && isMobile && (
            <p className="px-4 mb-2 mt-4 text-[10px] font-bold uppercase tracking-[0.15em] text-steel-500">
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
                "flex items-center gap-3 mx-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-brand-600/20 text-brand-400 shadow-sm"
                  : item.accent
                  ? "text-accent-400 hover:bg-accent-500/10 hover:text-accent-300"
                  : "text-steel-400 hover:bg-white/5 hover:text-steel-200",
              ].join(" ")}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {(isMobile || !collapsed) && (
                <span className="truncate whitespace-nowrap">{item.label}</span>
              )}
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400" />
              )}
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
                  "flex items-center gap-3 mx-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-brand-600/20 text-brand-400 shadow-sm"
                    : item.accent
                    ? "text-accent-400 hover:bg-accent-500/10 hover:text-accent-300"
                    : "text-steel-400 hover:bg-white/5 hover:text-steel-200",
                ].join(" ")}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {(isMobile || !collapsed) && <span className="truncate whitespace-nowrap">{item.label}</span>}
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400" />}
              </Link>
            );
          })()}
        </div>
      )}
    </>
  );

  const sidebarContent = (
    <div
      className="flex flex-col h-full bg-steel-950 transition-all duration-200 ease-in-out overflow-hidden"
      style={{ width }}
    >
      <div
        className="flex items-center h-16 px-4 border-b border-white/5 flex-shrink-0"
        style={{ minWidth: width }}
      >
        {logo}
      </div>

      <nav className="flex-1 py-3 overflow-y-auto overflow-x-hidden">
        {navLinks(false)}
      </nav>

      <div className="hidden md:flex justify-end p-2 border-t border-white/5 flex-shrink-0">
        <button
          onClick={onToggle}
          className="p-1.5 rounded-md text-steel-500 hover:text-steel-300 hover:bg-white/5 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
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
            <div className="flex flex-col h-full bg-steel-950">
              <div className="flex items-center justify-between h-16 px-4 border-b border-white/5">
                <Link href="/dashboard" className="flex items-center" onClick={onMobileClose}>
                  <Image
                    src="/MatexLogo.png"
                    alt="Matex"
                    width={200}
                    height={64}
                    className="h-9 w-auto max-w-[10rem] object-contain object-left drop-shadow-md"
                    priority
                  />
                </Link>
                <button
                  onClick={onMobileClose}
                  className="p-1.5 rounded-md text-steel-400 hover:text-white hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>
              <nav className="flex-1 py-3 overflow-y-auto">
                {navLinks(true)}
              </nav>
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

  const pageTitle = (() => {
    const segment = pathname.split("/")[1];
    if (!segment) return "Overview";
    return segment.charAt(0).toUpperCase() + segment.slice(1);
  })();

  function handleSignOut() {
    localStorage.removeItem("matex_token");
    router.replace("/login");
  }

  return (
    <header
      className="app-glass-header fixed top-0 right-0 z-20 flex h-16 items-center gap-4 px-4 transition-all duration-200 sm:px-6"
      style={{ left: sidebarWidth }}
    >
      <button
        className="rounded-xl p-1.5 text-steel-400 transition-colors hover:bg-white/10 hover:text-white md:hidden"
        onClick={onMobileMenuOpen}
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      <h1 className="app-page-title hidden sm:block">{pageTitle}</h1>

      <div className="ml-2 hidden max-w-sm flex-1 sm:block">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel-500"
          />
          <input
            type="search"
            placeholder="Search materials, orders..."
            className="app-header-search"
            aria-label="Search materials and orders"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="relative rounded-xl p-2 text-steel-400 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Notifications"
        >
          <Bell size={18} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-500 ring-2 ring-steel-950" />
        </button>

        <button
          type="button"
          onClick={handleSignOut}
          title="Sign out"
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white shadow-md shadow-brand-900/30 transition-all hover:from-brand-600 hover:to-brand-800"
        >
          M
        </button>
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
        className="app-shell-canvas min-h-screen pt-16 transition-all duration-200"
        style={{ marginLeft: sidebarWidth }}
      >
        <div className="app-shell-canvas-texture" aria-hidden>
          <div className="metal-texture absolute inset-0" />
        </div>
        <div className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10">
          {children}
        </div>
      </main>

      <MatexCopilot />
    </ClientAuthGuard>
  );
}
