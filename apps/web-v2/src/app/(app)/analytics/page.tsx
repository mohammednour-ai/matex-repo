"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { callTool } from "@/lib/api";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { Spinner } from "@/components/ui/Spinner";
import clsx from "clsx";

// ─── Types ───────────────────────────────────────────────────────────────────

type DashStats = {
  total_users: number;
  total_listings: number;
  total_orders: number;
  total_revenue: number;
  active_users_30d: number;
  new_listings_7d: number;
};

type RevenueReport = {
  period: string;
  transactions: number;
  volume: number;
  commission_estimate: number;
};

type Funnel = {
  listings: number;
  searches: number;
  threads: number;
  orders: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-xs text-steel-600">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-steel-100">
        <div
          className={clsx("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold text-steel-700">{value.toLocaleString()}</span>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: string;
  icon: typeof TrendingUp;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-steel-200/80 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-steel-500">{label}</p>
          <p className="mt-2 text-2xl font-extrabold text-steel-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-steel-500">{sub}</p>}
        </div>
        <span className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", color)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

// ─── Funnel ──────────────────────────────────────────────────────────────────

function ConversionFunnel({ funnel }: { funnel: Funnel }) {
  const steps = [
    { label: "Listings", value: funnel.listings, color: "bg-brand-500" },
    { label: "Searches", value: funnel.searches, color: "bg-brand-400" },
    { label: "Threads", value: funnel.threads, color: "bg-accent-500" },
    { label: "Orders", value: funnel.orders, color: "bg-emerald-500" },
  ];
  const max = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="rounded-2xl border border-steel-200/80 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-bold text-steel-800">Conversion Funnel</h3>
      <div className="space-y-3">
        {steps.map((s, i) => {
          const pct = i > 0 && steps[i - 1].value > 0
            ? Math.round((s.value / steps[i - 1].value) * 100)
            : null;
          return (
            <div key={s.label}>
              <MiniBar label={s.label} value={s.value} max={max} color={s.color} />
              {pct !== null && (
                <p className="mt-0.5 pl-[7.5rem] text-[10px] text-steel-400">
                  {pct}% of previous step
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Revenue Breakdown ───────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

function RevenuePanel() {
  const [period, setPeriod] = useState("30d");
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await callTool("analytics.get_revenue_report", { period });
      if (res.success) {
        const d = res.data as unknown as RevenueReport;
        setReport(d);
      }
      setLoading(false);
    }
    void load();
  }, [period]);

  return (
    <div className="rounded-2xl border border-steel-200/80 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-steel-800">Revenue</h3>
        <div className="flex gap-1 rounded-xl border border-steel-200 bg-steel-50 p-0.5">
          {PERIOD_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setPeriod(o.value)}
              className={clsx(
                "rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
                period === o.value ? "bg-white text-steel-900 shadow-sm" : "text-steel-500 hover:text-steel-700"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-5 w-5 text-brand-500" />
        </div>
      ) : report ? (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Transactions", value: String(report.transactions), color: "text-brand-700" },
            { label: "Volume", value: formatCAD(report.volume), color: "text-steel-900" },
            { label: "Commission Est.", value: formatCAD(report.commission_estimate), color: "text-emerald-700" },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <p className={clsx("text-xl font-extrabold", item.color)}>{item.value}</p>
              <p className="mt-1 text-[11px] font-medium text-steel-500">{item.label}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-steel-400">No data for this period.</p>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [statsRes, funnelRes] = await Promise.allSettled([
      callTool("analytics.get_dashboard_stats", {}),
      callTool("analytics.get_conversion_funnel", {}),
    ]);

    if (statsRes.status === "fulfilled" && statsRes.value.success) {
      const d = statsRes.value.data as unknown as { stats?: DashStats } & DashStats;
      setStats(d?.stats ?? d);
    }
    if (funnelRes.status === "fulfilled" && funnelRes.value.success) {
      const d = funnelRes.value.data as unknown as { funnel?: Funnel } & Funnel;
      setFunnel(d?.funnel ?? d);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const kpis = stats
    ? [
        {
          label: "Total Users",
          value: (stats.total_users ?? 0).toLocaleString(),
          icon: Users,
          color: "bg-brand-100 text-brand-700",
          sub: stats.active_users_30d ? `${stats.active_users_30d} active last 30d` : undefined,
        },
        {
          label: "Total Listings",
          value: (stats.total_listings ?? 0).toLocaleString(),
          icon: Package,
          color: "bg-sky-100 text-sky-700",
          sub: stats.new_listings_7d ? `+${stats.new_listings_7d} this week` : undefined,
        },
        {
          label: "Total Orders",
          value: (stats.total_orders ?? 0).toLocaleString(),
          icon: ShoppingCart,
          color: "bg-accent-100 text-accent-700",
        },
        {
          label: "Platform Revenue",
          value: formatCAD(stats.total_revenue ?? 0),
          icon: DollarSign,
          color: "bg-emerald-100 text-emerald-700",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Analytics"
        description="Platform-wide metrics on users, listings, orders, and revenue."
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-steel-200 bg-white px-3 py-2 text-sm font-medium text-steel-600 shadow-sm transition-colors hover:bg-steel-50 disabled:opacity-50"
          >
            <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        }
      />

      {loading && !stats ? (
        <div className="flex items-center justify-center py-24">
          <Spinner className="h-6 w-6 text-brand-500" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {kpis.map((k) => (
              <StatCard key={k.label} {...k} />
            ))}
          </div>

          {/* Charts row */}
          <div className="grid gap-6 lg:grid-cols-2">
            <RevenuePanel />
            {funnel ? (
              <ConversionFunnel funnel={funnel} />
            ) : (
              <div className="flex items-center justify-center rounded-2xl border border-steel-200/80 bg-white p-10">
                <div className="text-center">
                  <BarChart3 className="mx-auto mb-3 h-8 w-8 text-steel-300" />
                  <p className="text-sm text-steel-400">Funnel data unavailable</p>
                </div>
              </div>
            )}
          </div>

          {/* Engagement bar chart */}
          {stats && (
            <div className="rounded-2xl border border-steel-200/80 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-bold text-steel-800">Platform Activity</h3>
              <div className="space-y-3">
                {[
                  { label: "Users", value: stats.total_users ?? 0, color: "bg-brand-500" },
                  { label: "Listings", value: stats.total_listings ?? 0, color: "bg-sky-500" },
                  { label: "Orders", value: stats.total_orders ?? 0, color: "bg-accent-500" },
                ].map((item) => {
                  const maxVal = Math.max(stats.total_users ?? 0, stats.total_listings ?? 0, stats.total_orders ?? 0, 1);
                  return <MiniBar key={item.label} label={item.label} value={item.value} max={maxVal} color={item.color} />;
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
