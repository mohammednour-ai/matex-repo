"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

type NavItem = { href: string; icon: string; label: string; count?: number };

const mainNav: NavItem[] = [
  { href: "/",          icon: "⬛", label: "Overview" },
  { href: "/dashboard", icon: "◈",  label: "Dashboard" },
  { href: "/listings",  icon: "☰",  label: "Listings" },
  { href: "/search",    icon: "⌕",  label: "Search" },
  { href: "/auction",   icon: "⚡",  label: "Auctions" },
  { href: "/messaging", icon: "✉",  label: "Messages" },
  { href: "/checkout",  icon: "⊕",  label: "Checkout" },
];

const opsNav: NavItem[] = [
  { href: "/escrow",    icon: "⊞",  label: "Escrow" },
  { href: "/logistics", icon: "⊡",  label: "Logistics" },
  { href: "/booking",   icon: "⊟",  label: "Booking" },
  { href: "/contracts", icon: "☷",  label: "Contracts" },
];

const devNav: NavItem[] = [
  { href: "/phase2",  icon: "◇", label: "Phase 2 Trust" },
  { href: "/phase3",  icon: "◇", label: "Phase 3 Ops" },
  { href: "/phase4",  icon: "◇", label: "Phase 4 Intel" },
];

const accountNav: NavItem[] = [
  { href: "/copilot", icon: "◆", label: "AI Copilot" },
  { href: "/auth",    icon: "⊙", label: "Account" },
];

function NavSection({ label, items, collapsed }: { label: string; items: NavItem[]; collapsed: boolean }) {
  const pathname = usePathname();
  return (
    <div className="nav-section">
      {!collapsed && <div className="nav-label">{label}</div>}
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`nav-item${pathname === n.href ? " active" : ""}`}
          title={collapsed ? n.label : undefined}
        >
          <span className="nav-item-icon">{n.icon}</span>
          {!collapsed && n.label}
          {!collapsed && n.count ? <span className="nav-item-count">{n.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const searchParams = useSearchParams();
  const devMode = searchParams.get("dev") === "true" || (typeof window !== "undefined" && localStorage.getItem("matex_dev") === "1");

  return (
    <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`}>
      <button
        className="sidebar-toggle"
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? "▶" : "◀"}
      </button>

      <NavSection label="Marketplace" items={mainNav} collapsed={collapsed} />
      <NavSection label="Operations" items={opsNav} collapsed={collapsed} />
      {devMode && <NavSection label="Dev tools" items={devNav} collapsed={collapsed} />}
      <NavSection label="" items={accountNav} collapsed={collapsed} />

      {!collapsed && (
        <div className="sidebar-footer">
          <Link href="/copilot" className="nav-item" style={{ color: "var(--cyan)" }}>
            <span className="nav-item-icon">◆</span>
            Ask AI anything
          </Link>
        </div>
      )}
    </aside>
  );
}
