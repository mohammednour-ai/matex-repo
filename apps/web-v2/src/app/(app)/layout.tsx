"use client";

import { useEffect, useRef, useState } from "react";
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
  Bot,
  ChevronLeft,
  ChevronRight,
  Bell,
  Menu,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

type NavSection = {
  heading?: string;
  items: NavItem[];
};

// ---------------------------------------------------------------------------
// Nav config
// ---------------------------------------------------------------------------
const iconSize = 18;

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: "Overview", href: "/dashboard", icon: <LayoutDashboard size={iconSize} /> },
      { label: "Listings", href: "/listings", icon: <Package size={iconSize} /> },
      { label: "Search", href: "/search", icon: <Search size={iconSize} /> },
      { label: "Auctions", href: "/auction", icon: <Gavel size={iconSize} /> },
      { label: "Messages", href: "/messages", icon: <MessageSquare size={iconSize} /> },
      { label: "Checkout", href: "/checkout", icon: <ShoppingCart size={iconSize} /> },
    ],
  },
  {
    heading: "Operations",
    items: [
      { label: "Escrow", href: "/escrow", icon: <Shield size={iconSize} /> },
      { label: "Logistics", href: "/logistics", icon: <Truck size={iconSize} /> },
      { label: "Booking", href: "/booking", icon: <Calendar size={iconSize} /> },
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

// ---------------------------------------------------------------------------
// ClientAuthGuard
// ---------------------------------------------------------------------------
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
const COLLAPSED_W = 64;
const EXPANDED_W = 240;

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
  const width = collapsed ? COLLAPSED_W : EXPANDED_W;

  const sidebarContent = (
    <div
      className="flex flex-col h-full bg-white border-r border-gray-200 transition-all duration-200 ease-in-out overflow-hidden"
      style={{ width }}
    >
      {/* Logo row */}
      <div
        className="flex items-center h-16 px-4 border-b border-gray-100 flex-shrink-0"
        style={{ minWidth: width }}
      >
        <div className="w-8 h-8 rounded-md bg-brand-600 flex items-center justify-center flex-shrink-0">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-4 h-4 text-white"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14l3 3 3-3m-3 3V14"
            />
          </svg>
        </div>
        {!collapsed && (
          <span className="ml-3 font-bold text-gray-900 text-base tracking-tight whitespace-nowrap">
            Matex
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si} className="mb-2">
            {section.heading && !collapsed && (
              <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
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
                  title={collapsed ? item.label : undefined}
                  onClick={onMobileClose}
                  className={[
                    "flex items-center gap-3 mx-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                  ].join(" ")}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <span className="truncate whitespace-nowrap">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Collapse toggle — desktop only */}
      <div className="hidden md:flex justify-end p-2 border-t border-gray-100 flex-shrink-0">
        <button
          onClick={onToggle}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — fixed */}
      <aside
        className="hidden md:flex fixed top-0 left-0 h-screen z-30 flex-col"
        style={{ width }}
      >
        {sidebarContent}
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={onMobileClose}
            aria-hidden
          />
          <aside className="relative flex flex-col z-50" style={{ width: EXPANDED_W }}>
            <div className="flex flex-col h-full">
              {/* Swap collapsed=false for mobile */}
              <div
                className="flex flex-col h-full bg-white border-r border-gray-200"
                style={{ width: EXPANDED_W }}
              >
                <div className="flex items-center justify-between h-16 px-4 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-brand-600 flex items-center justify-center flex-shrink-0">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="w-4 h-4 text-white"
                        stroke="currentColor"
                        strokeWidth="2.2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14l3 3 3-3m-3 3V14"
                        />
                      </svg>
                    </div>
                    <span className="font-bold text-gray-900 text-base">Matex</span>
                  </div>
                  <button
                    onClick={onMobileClose}
                    className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                  >
                    <X size={18} />
                  </button>
                </div>
                <nav className="flex-1 py-4 overflow-y-auto">
                  {NAV_SECTIONS.map((section, si) => (
                    <div key={si} className="mb-2">
                      {section.heading && (
                        <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
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
                            onClick={onMobileClose}
                            className={[
                              "flex items-center gap-3 mx-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                              active
                                ? "bg-brand-50 text-brand-700"
                                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                            ].join(" ")}
                          >
                            <span className="flex-shrink-0">{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </nav>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
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
      className="fixed top-0 right-0 h-16 bg-white border-b border-gray-200 z-20 flex items-center px-4 gap-4 transition-all duration-200"
      style={{ left: sidebarWidth }}
    >
      {/* Mobile menu button */}
      <button
        className="md:hidden p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100"
        onClick={onMobileMenuOpen}
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      {/* Page title */}
      <h1 className="font-semibold text-gray-900 text-base hidden sm:block">{pageTitle}</h1>

      {/* Search */}
      <div className="flex-1 max-w-sm ml-2 hidden sm:block">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="search"
            placeholder="Search materials, orders…"
            className="w-full pl-9 pr-4 py-1.5 text-sm bg-gray-100 border border-transparent rounded-lg focus:outline-none focus:border-brand-400 focus:bg-white transition-colors"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Notifications */}
        <button className="relative p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
        </button>

        {/* Avatar / sign out */}
        <button
          onClick={handleSignOut}
          title="Sign out"
          className="w-8 h-8 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center hover:bg-brand-700 transition-colors"
        >
          M
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// CopilotTrigger
// ---------------------------------------------------------------------------
function CopilotTrigger() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ role: "user" | "assistant"; text: string }>
  >([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setLoading(true);

    try {
      const token = localStorage.getItem("matex_token") ?? undefined;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg, token }),
      });
      const data = (await res.json()) as { content: string };
      setMessages((prev) => [...prev, { role: "assistant", text: data.content }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-brand-600 text-white shadow-lg flex items-center justify-center hover:bg-brand-700 transition-colors"
        aria-label="Open AI Copilot"
      >
        {open ? <X size={20} /> : <Bot size={20} />}
      </button>

      {/* Copilot panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ maxHeight: "60vh" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-brand-600 text-white">
            <Bot size={18} />
            <span className="font-semibold text-sm">Matex Copilot</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
            {messages.length === 0 && (
              <p className="text-gray-400 text-center text-xs pt-4">
                Ask me anything — search materials, check wallet, place a bid…
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "text-right" : "text-left"}
              >
                <span
                  className={[
                    "inline-block rounded-xl px-3 py-2 text-xs max-w-[85%] whitespace-pre-wrap text-left",
                    m.role === "user"
                      ? "bg-brand-600 text-white"
                      : "bg-gray-100 text-gray-800",
                  ].join(" ")}
                >
                  {m.text}
                </span>
              </div>
            ))}
            {loading && (
              <div className="text-left">
                <span className="inline-block rounded-xl px-3 py-2 bg-gray-100 text-gray-400 text-xs animate-pulse">
                  Thinking…
                </span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 p-3 border-t border-gray-100">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask Copilot…"
              className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-400"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="px-3 py-2 bg-brand-600 text-white text-xs rounded-lg disabled:opacity-40 hover:bg-brand-700 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------
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
        className="pt-16 min-h-screen transition-all duration-200"
        style={{ marginLeft: sidebarWidth }}
      >
        <div className="p-6 md:p-8">{children}</div>
      </main>

      <CopilotTrigger />
    </ClientAuthGuard>
  );
}
