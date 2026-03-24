"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

const harnessNav: NavItem[] = [
  { href: "/phase2",  icon: "◇", label: "Phase 2 Trust" },
  { href: "/phase3",  icon: "◇", label: "Phase 3 Ops" },
  { href: "/phase4",  icon: "◇", label: "Phase 4 Intel" },
  { href: "/copilot", icon: "◆", label: "AI Copilot" },
];

const accountNav: NavItem[] = [
  { href: "/auth", icon: "⊙", label: "Auth + KYC" },
];

const mcpModules = [
  "auth-mcp", "profile-mcp", "kyc-mcp", "listing-mcp", "search-mcp",
  "bidding-mcp", "auction-mcp", "inspection-mcp", "booking-mcp",
  "escrow-mcp", "payments-mcp", "contracts-mcp", "dispute-mcp",
  "logistics-mcp", "tax-mcp", "notifications-mcp", "messaging-mcp",
  "esign-mcp", "pricing-mcp", "analytics-mcp", "admin-mcp",
  "storage-mcp", "log-mcp",
];

function NavSection({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <div className="nav-section">
      <div className="nav-label">{label}</div>
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`nav-item${pathname === n.href ? " active" : ""}`}
        >
          <span className="nav-item-icon">{n.icon}</span>
          {n.label}
          {n.count ? <span className="nav-item-count">{n.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sidebar">
      <NavSection label="Main flow" items={mainNav} />
      <NavSection label="Operations" items={opsNav} />
      <NavSection label="Test harness" items={harnessNav} />
      <NavSection label="Account" items={accountNav} />

      <div className="mcp-status">
        <div className="mcp-status-head">
          <div className="mcp-pulse" />
          <span style={{ fontSize: 12, fontWeight: 600 }}>MCP orchestration</span>
        </div>
        <div className="mcp-modules">
          {mcpModules.map((m) => (
            <div className="mcp-module" key={m}>
              <i />{m}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
