"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const routeLabels: Record<string, string> = {
  "/": "Overview",
  "/dashboard": "Dashboard",
  "/listings": "Listings",
  "/search": "Search",
  "/auction": "Auctions",
  "/messaging": "Messages",
  "/checkout": "Checkout",
  "/escrow": "Escrow",
  "/logistics": "Logistics",
  "/booking": "Booking",
  "/contracts": "Contracts",
  "/copilot": "AI Copilot",
  "/auth": "Account",
  "/phase2": "Phase 2 Trust",
  "/phase3": "Phase 3 Ops",
  "/phase4": "Phase 4 Intel",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  if (pathname === "/") return null;

  const label = routeLabels[pathname] ?? pathname.replace("/", "");

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link href="/">Overview</Link>
      <span className="breadcrumb-sep">/</span>
      <span className="breadcrumb-current">{label}</span>
    </nav>
  );
}
