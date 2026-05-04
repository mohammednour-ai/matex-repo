"use client";

import { useMemo } from "react";
import { Activity } from "lucide-react";
import type { DashboardStats } from "@/types/dashboard";

type DashboardPulseStripProps = {
  stats: DashboardStats | null;
  /** e.g. "$1,234 CAD" or null */
  walletDisplay: string | null;
  /** Formatted escrow total when positive */
  escrowDisplay: string | null;
  unread: number;
  kycLevel: number;
};

const REFERENCE_CATEGORIES = [
  "HMS 1&2",
  "Al 6063 clips",
  "Cu #1 bare bright",
  "SS 304 solids",
  "Surplus equipment",
  "Fe shred",
] as const;

/**
 * Horizontally scrolling activity / reference strip — real metrics from the workspace plus
 * static commodity category labels (not live market prices).
 */
export function DashboardPulseStrip({
  stats,
  walletDisplay,
  escrowDisplay,
  unread,
  kycLevel,
}: DashboardPulseStripProps) {
  const segments = useMemo(() => {
    const s: string[] = [];
    if (stats) {
      s.push(`Live auctions · ${stats.active_auctions}`);
      s.push(`Active listings · ${stats.active_listings}`);
      if (stats.listings_change_pct != null && !Number.isNaN(stats.listings_change_pct)) {
        const sign = stats.listings_change_pct > 0 ? "+" : "";
        s.push(`Your listings WoW · ${sign}${stats.listings_change_pct}%`);
      }
      s.push(`Active escrows · ${stats.active_escrows}`);
      if (escrowDisplay) s.push(`Escrow held · ${escrowDisplay}`);
      s.push(`Orders need action · ${stats.orders_pending_action ?? 0}`);
      s.push(`Orders in transit · ${stats.orders_in_transit ?? 0}`);
      if (stats.active_bids != null) s.push(`Open bids · ${stats.active_bids}`);
    } else {
      s.push("Syncing workspace signals…");
    }
    if (walletDisplay) s.push(`Wallet · ${walletDisplay}`);
    s.push(`Unread messages · ${unread}`);
    s.push(`KYC tier · ${kycLevel}`);
    REFERENCE_CATEGORIES.forEach((c) => s.push(`${c} · listing category`));
    return s;
  }, [stats, walletDisplay, escrowDisplay, unread, kycLevel]);

  const loop = useMemo(() => [...segments, ...segments], [segments]);

  return (
    <div className="dashboard-pulse-strip" aria-label="Workspace activity pulse">
      <div className="dashboard-pulse-strip__inner">
        <span className="dashboard-pulse-strip__badge">
          <Activity className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Pulse
        </span>
        <div className="dashboard-pulse-strip__viewport">
          <ul className="dashboard-pulse-strip__track">
            {loop.map((text, i) => (
              <li key={`${text}-${i}`} className="dashboard-pulse-strip__item">
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="dashboard-pulse-strip__legal">
        Workspace metrics update with your data · category labels are reference classes, not exchange quotes
      </p>
    </div>
  );
}
