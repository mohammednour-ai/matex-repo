"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Truck,
  Package,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Users,
  FileText,
} from "lucide-react";
import clsx from "clsx";
import { getUser, clearSession, type YardUser } from "@/lib/api";

type NavItem = { label: string; href: string; icon: React.ReactNode; accent?: boolean };

const NAV: NavItem[] = [
  { label: "Dashboard",     href: "/dashboard",      icon: <LayoutDashboard size={18} /> },
  { label: "Intake",        href: "/intake",          icon: <Truck size={18} />, accent: true },
  { label: "Sellers",       href: "/sellers",         icon: <Users size={18} /> },
  { label: "Lots",          href: "/lots",            icon: <Package size={18} /> },
  { label: "Pricing",       href: "/pricing",         icon: <DollarSign size={18} /> },
  { label: "Cat Converters",href: "/cat-converters",  icon: <ShieldAlert size={18} /> },
  { label: "Reports",       href: "/reports",         icon: <BarChart3 size={18} /> },
  { label: "Audit Log",     href: "/audit",           icon: <FileText size={18} /> },
  { label: "Settings",      href: "/settings",        icon: <Settings size={18} /> },
];

const COLLAPSED_W = 68;
const EXPANDED_W = 240;

function ClientAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = window.localStorage.getItem("yardops_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center industrial-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-2xl border-2 border-brand-500/30 border-t-brand-500 spin-brand" aria-label="Loading" />
          <p className="text-xs font-bold uppercase tracking-widest text-night-400">Loading YardOps</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<YardUser | null>(null);
  useEffect(() => { setUser(getUser()); }, [pathname]);

  async function handleSignOut() {
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    clearSession();
    router.replace("/login");
  }

  const width = collapsed ? COLLAPSED_W : EXPANDED_W;

  const navLinks = (
    <nav aria-label="Main navigation">
      {NAV.map((item) => {
        const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onMobileClose}
            title={collapsed ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "yard-nav-link mb-0.5",
              active && "yard-nav-link-active",
              !active && item.accent && "text-brand-400 hover:text-brand-300",
            )}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-night-700/60 p-3">
      {!collapsed && user && (
        <div className="mb-2 px-1">
          <p className="truncate text-xs font-semibold text-night-200">{user.full_name}</p>
          <p className="truncate text-xs text-night-500 capitalize">{user.role.replace("_", " ")}</p>
        </div>
      )}
      <button
        onClick={handleSignOut}
        className={clsx("yard-nav-link w-full text-danger-400 hover:text-danger-300 hover:bg-danger-500/10", collapsed && "justify-center")}
        aria-label="Sign out"
      >
        <LogOut size={16} />
        {!collapsed && <span>Sign out</span>}
      </button>
    </div>
  );

  const sidebarContent = (
    <div
      className="flex h-screen flex-col border-r border-night-700 bg-night-900 transition-all duration-200 ease-in-out"
      style={{ width }}
    >
      <div className="flex flex-shrink-0 items-center justify-between p-4 border-b border-night-700/60">
        {!collapsed && (
          <div>
            <p className="text-sm font-bold text-night-100">YardOps</p>
            <p className="text-[10px] text-night-500 uppercase tracking-widest">Ontario</p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="rounded-xl border border-night-700 p-1.5 text-night-400 hover:text-night-100 hover:border-night-600 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">{navLinks}</div>
      {footer}
    </div>
  );

  return (
    <>
      <aside className="hidden md:flex fixed top-0 left-0 h-screen z-30 flex-col" style={{ width }}>
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onMobileClose} aria-hidden />
          <aside className="relative z-50 flex flex-col" style={{ width: EXPANDED_W }}>
            <div className="flex h-screen flex-col border-r border-night-700 bg-night-900">
              <div className="flex items-center justify-between p-4 border-b border-night-700/60">
                <div>
                  <p className="text-sm font-bold text-night-100">YardOps</p>
                  <p className="text-[10px] text-night-500 uppercase tracking-widest">Ontario</p>
                </div>
                <button onClick={onMobileClose} aria-label="Close navigation" className="rounded-xl border border-night-700 p-1.5 text-night-400 hover:text-night-100">
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">{navLinks}</div>
              {footer}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  const sidebarWidth = collapsed ? COLLAPSED_W : EXPANDED_W;

  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    el.classList.remove("page-enter");
    void el.offsetWidth;
    el.classList.add("page-enter");
  }, [pathname]);

  return (
    <ClientAuthGuard>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
        className="fixed left-4 top-4 z-30 rounded-xl border border-night-700 bg-night-900/80 p-2.5 text-night-200 backdrop-blur md:hidden"
      >
        <Menu size={18} />
      </button>

      <main
        className="min-h-screen transition-all duration-200 ease-in-out"
        style={{ marginLeft: sidebarWidth }}
      >
        <div className="industrial-bg min-h-screen">
          <div className="relative p-4 md:p-6 lg:p-8">
            <div ref={pageRef} className="page-enter">
              {children}
            </div>
          </div>
        </div>
      </main>
    </ClientAuthGuard>
  );
}
