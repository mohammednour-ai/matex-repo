"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Newspaper, TrendingUp } from "lucide-react";
import type { DashboardStats } from "@/types/dashboard";
import type { MarketIntelligenceRow } from "@/lib/intelligence/types";
import { fetchAllSnapshots } from "@/lib/intelligence/client";
import { formatPct, formatPrice } from "@/lib/intelligence/format";
import { getMaterial } from "@/lib/intelligence/materials";

type DashboardPulseStripProps = {
  stats: DashboardStats | null;
  /** e.g. "$1,234 CAD" or null */
  walletDisplay: string | null;
  /** Formatted escrow total when positive */
  escrowDisplay: string | null;
  unread: number;
  kycLevel: number;
};

type PulseSegment = {
  kind: "metric" | "price" | "news";
  text: string;
};

/**
 * Horizontally scrolling pulse strip — workspace metrics + live Canadian
 * material prices (LME spot / Matex 30-day avg) + news headlines pulled from
 * the intelligence DB (populated by the daily Inngest snapshot job).
 */
export function DashboardPulseStrip({
  stats,
  walletDisplay,
  escrowDisplay,
  unread,
  kycLevel,
}: DashboardPulseStripProps) {
  const [snapshots, setSnapshots] = useState<MarketIntelligenceRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchAllSnapshots()
      .then((rows) => {
        if (!cancelled) setSnapshots(rows);
      })
      .catch(() => {
        // Pulse strip silently degrades to workspace metrics only.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const segments = useMemo<PulseSegment[]>(() => {
    const out: PulseSegment[] = [];

    // 1. Workspace metrics first — most personal context.
    if (stats) {
      out.push({ kind: "metric", text: `Live auctions · ${stats.active_auctions}` });
      out.push({ kind: "metric", text: `Active listings · ${stats.active_listings}` });
      if (stats.listings_change_pct != null && !Number.isNaN(stats.listings_change_pct)) {
        const sign = stats.listings_change_pct > 0 ? "+" : "";
        out.push({ kind: "metric", text: `Your listings WoW · ${sign}${stats.listings_change_pct}%` });
      }
      out.push({ kind: "metric", text: `Active escrows · ${stats.active_escrows}` });
      if (escrowDisplay) out.push({ kind: "metric", text: `Escrow held · ${escrowDisplay}` });
      out.push({ kind: "metric", text: `Orders need action · ${stats.orders_pending_action ?? 0}` });
      out.push({ kind: "metric", text: `Orders in transit · ${stats.orders_in_transit ?? 0}` });
      if (stats.active_bids != null) out.push({ kind: "metric", text: `Open bids · ${stats.active_bids}` });
    } else {
      out.push({ kind: "metric", text: "Syncing workspace signals…" });
    }
    if (walletDisplay) out.push({ kind: "metric", text: `Wallet · ${walletDisplay}` });
    out.push({ kind: "metric", text: `Unread messages · ${unread}` });
    out.push({ kind: "metric", text: `KYC tier · ${kycLevel}` });

    // 2. Live Canadian material prices from intelligence snapshots.
    snapshots.forEach((snap) => {
      const material = getMaterial(snap.material_key);
      const unit = material?.unit ?? "mt";
      const price = formatPrice(snap.lme_price ?? snap.matex_avg_price, unit);
      const delta =
        snap.lme_change_pct != null && !Number.isNaN(snap.lme_change_pct)
          ? ` ${formatPct(snap.lme_change_pct)}`
          : "";
      out.push({ kind: "price", text: `${snap.material_label} CA · ${price}${delta}` });
    });

    // 3. News headlines from the same snapshots (de-duped).
    const seenHeadlines = new Set<string>();
    snapshots.forEach((snap) => {
      (snap.news_headlines ?? []).slice(0, 2).forEach((headline) => {
        const trimmed = headline.trim();
        if (!trimmed || seenHeadlines.has(trimmed)) return;
        seenHeadlines.add(trimmed);
        out.push({ kind: "news", text: trimmed });
      });
    });

    return out;
  }, [stats, walletDisplay, escrowDisplay, unread, kycLevel, snapshots]);

  const loop = useMemo(() => [...segments, ...segments], [segments]);

  const hasLiveData = snapshots.length > 0;

  return (
    <div className="dashboard-pulse-strip" aria-label="Workspace activity pulse and Canadian market prices">
      <div className="dashboard-pulse-strip__inner">
        <span className="dashboard-pulse-strip__badge">
          <Activity className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Pulse
        </span>
        <div className="dashboard-pulse-strip__viewport">
          <ul className="dashboard-pulse-strip__track">
            {loop.map((seg, i) => (
              <li
                key={`${seg.kind}-${seg.text}-${i}`}
                className="dashboard-pulse-strip__item dashboard-pulse-strip__item--segmented"
              >
                {seg.kind === "price" ? (
                  <TrendingUp className="mr-1.5 inline h-3 w-3 -translate-y-px text-brand-400" aria-hidden />
                ) : seg.kind === "news" ? (
                  <Newspaper className="mr-1.5 inline h-3 w-3 -translate-y-px text-info-400" aria-hidden />
                ) : null}
                {seg.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="dashboard-pulse-strip__legal">
        {hasLiveData
          ? "Live LME / Matex prices and Canadian scrap-industry headlines · refreshed daily"
          : "Workspace metrics · live market data syncing"}
      </p>
    </div>
  );
}
