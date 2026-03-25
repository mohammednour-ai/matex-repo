import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Logo } from "./components/Logo";
import { Sidebar } from "./components/Sidebar";
import { Breadcrumbs } from "./components/Breadcrumbs";

export const metadata = {
  title: "Matex — B2B Recycled Materials Marketplace",
  description: "AI-native MCP marketplace for Canadian B2B recycled materials trading",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <div className="topbar-brand">
              <Logo size={36} className="topbar-logo-img-wrap" />
              <div>
                <div className="topbar-name">MATEX</div>
                <div className="topbar-sub">matexhub.ca</div>
              </div>
            </div>

            <nav className="topbar-center">
              {[
                { href: "/listings", label: "Listings" },
                { href: "/search", label: "Search" },
                { href: "/auction", label: "Auctions" },
                { href: "/messaging", label: "Messages" },
              ].map((n) => (
                <Link key={n.href} href={n.href} className="tab-btn">{n.label}</Link>
              ))}
            </nav>

            <div className="topbar-right">
              <Link href="/copilot" className="badge badge-cyan" style={{ cursor: "pointer", textDecoration: "none" }}>AI Copilot</Link>
              <Link href="/dashboard" className="badge badge-green" style={{ cursor: "pointer", textDecoration: "none" }}>
                <span className="dot" />Dashboard
              </Link>
            </div>
          </header>

          <Suspense>
            <Sidebar />
          </Suspense>

          <main className="main-content">
            <Suspense>
              <Breadcrumbs />
            </Suspense>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
