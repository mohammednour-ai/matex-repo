import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./components/Logo";
import { Sidebar } from "./components/Sidebar";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <div className="topbar-brand">
              <Logo size={40} className="topbar-logo-img-wrap" />
              <div>
                <div className="topbar-name">MATEX</div>
                <div className="topbar-sub">AI-native MCP marketplace</div>
              </div>
            </div>

            <nav className="topbar-center">
              {[
                { href: "/", label: "Overview" },
                { href: "/dashboard", label: "Dashboard" },
                { href: "/listings", label: "Listings" },
                { href: "/search", label: "Search" },
                { href: "/auction", label: "Auctions" },
              ].map((n) => (
                <Link key={n.href} href={n.href} className="tab-btn">
                  {n.label}
                </Link>
              ))}
            </nav>

            <div className="topbar-right">
              <span className="badge badge-green"><span className="dot" />23 MCP live</span>
              <span className="badge badge-cyan">Cloud AI on</span>
            </div>
          </header>

          <Sidebar />

          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
