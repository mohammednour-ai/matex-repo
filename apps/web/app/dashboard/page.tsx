"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { callGatewayTool, readTrackedIds } from "../harness-client";

type Stats = {
  listings: { count: number; loading: boolean };
  unread: { count: number; loading: boolean };
  wallet: { balance: string; loading: boolean };
  kyc: { level: string; loading: boolean };
};

const QUICK_ACTIONS = [
  { label: "Create listing", href: "/listings" },
  { label: "Search materials", href: "/search" },
  { label: "View auctions", href: "/auction" },
  { label: "Check escrow", href: "/escrow" },
  { label: "View contracts", href: "/contracts" },
  { label: "AI Copilot", href: "/copilot" },
] as const;

function extractCount(payload: Record<string, unknown>): number {
  const d = payload.data as Record<string, unknown> | undefined;
  const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
  const items = upstream?.listings ?? d?.listings ?? upstream?.messages ?? d?.messages ?? [];
  return Array.isArray(items) ? items.length : 0;
}

function extractBalance(payload: Record<string, unknown>): string {
  const d = payload.data as Record<string, unknown> | undefined;
  const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
  const bal = upstream?.balance ?? d?.balance ?? 0;
  return Number(bal).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

function extractKycLevel(payload: Record<string, unknown>): string {
  const d = payload.data as Record<string, unknown> | undefined;
  const upstream = (d?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
  const level = upstream?.current_level ?? d?.current_level ?? d?.level ?? "unknown";
  return String(level);
}

export default function DashboardPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [stats, setStats] = useState<Stats>({
    listings: { count: 0, loading: true },
    unread: { count: 0, loading: true },
    wallet: { balance: "$0.00", loading: true },
    kyc: { level: "—", loading: true },
  });
  const [resetStatus, setResetStatus] = useState<"idle" | "success" | "error">("idle");
  const [resetOutput, setResetOutput] = useState("");

  const tracked = useMemo(() => readTrackedIds(), [resetStatus]);

  useEffect(() => {
    const token = localStorage.getItem("matex_token");
    const ids = readTrackedIds();
    setUserId(token ? ids.userIds[0] ?? null : null);
    setDevMode(localStorage.getItem("matex_dev") === "1");
  }, []);

  const loadStats = useCallback(async () => {
    const settle = async <T,>(
      tool: string,
      extract: (p: Record<string, unknown>) => T,
      fallback: T,
    ): Promise<T> => {
      try {
        const r = await callGatewayTool(tool, {});
        return r.payload.success ? extract(r.payload) : fallback;
      } catch {
        return fallback;
      }
    };

    const [listingCount, unreadCount, walletBal, kycLvl] = await Promise.all([
      settle("listing.get_my_listings", (p) => extractCount(p), 0),
      settle("messaging.get_unread", (p) => extractCount(p), 0),
      settle("payments.get_wallet_balance", (p) => extractBalance(p), "$0.00"),
      settle("kyc.get_kyc_level", (p) => extractKycLevel(p), "unknown"),
    ]);

    setStats({
      listings: { count: listingCount, loading: false },
      unread: { count: unreadCount, loading: false },
      wallet: { balance: walletBal, loading: false },
      kyc: { level: kycLvl, loading: false },
    });
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  async function onReset(): Promise<void> {
    const response = await fetch("/api/reset-test-data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tracked }),
    });
    const text = await response.text();
    setResetOutput(`HTTP ${response.status}\n${text}`);
    if (response.ok) {
      localStorage.removeItem("matex_test_ids");
      localStorage.removeItem("matex_token");
      setResetStatus("success");
    } else {
      setResetStatus("error");
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <div className="eyebrow">Your workspace</div>
          <h1 className="page-title">Dashboard</h1>
        </div>
      </div>

      {userId ? (
        <p className="page-sub" style={{ marginBottom: 20 }}>
          Welcome back, <strong>{userId.slice(0, 8)}…</strong>
        </p>
      ) : (
        <p className="page-sub" style={{ marginBottom: 20 }}>
          <Link href="/auth" style={{ color: "var(--cyan)" }}>Sign in</Link> to see your dashboard.
        </p>
      )}

      {/* Stat cards */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">My Listings</div>
          <div className="stat-card-value">
            {stats.listings.loading ? <span className="loading-spinner" /> : stats.listings.count}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Unread Messages</div>
          <div className="stat-card-value">
            {stats.unread.loading ? <span className="loading-spinner" /> : stats.unread.count}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Wallet Balance</div>
          <div className="stat-card-value">
            {stats.wallet.loading ? <span className="loading-spinner" /> : stats.wallet.balance}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">KYC Status</div>
          <div className="stat-card-value">
            {stats.kyc.loading ? <span className="loading-spinner" /> : stats.kyc.level}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div className="card-title">Quick Actions</div>
        </div>
        <div className="card-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {QUICK_ACTIONS.map((a) => (
              <Link key={a.href} href={a.href} className="btn btn-ghost" style={{ textAlign: "center", textDecoration: "none" }}>
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div className="card-title">Recent Activity</div>
        </div>
        <div className="card-body">
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            Your recent transactions and notifications will appear here.
          </p>
        </div>
      </div>

      {/* Dev Tools */}
      {devMode && (
        <div className="card" style={{ marginTop: 20, borderColor: "var(--amber)" }}>
          <div className="card-header">
            <div className="card-title">Dev Tools</div>
          </div>
          <div className="card-body">
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, maxHeight: 200, overflow: "auto" }}>
              {JSON.stringify(tracked, null, 2)}
            </pre>
            <button className="btn btn-ghost" type="button" onClick={onReset} style={{ marginTop: 10 }}>
              Reset test data
            </button>
            {resetOutput && (
              <pre style={{ marginTop: 10, whiteSpace: "pre-wrap", fontSize: 11 }}>{resetOutput}</pre>
            )}
            {resetStatus !== "idle" && (
              <p style={{ marginTop: 6, fontSize: 12, color: resetStatus === "success" ? "var(--green)" : "var(--red)" }}>
                {resetStatus === "success" ? "Reset completed." : "Reset failed."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
