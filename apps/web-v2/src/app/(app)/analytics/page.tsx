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
import { Spinner } from "@/components/ui/shadcn/spinner";
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

type RevenueSeriesPoint = {
  day: string;
  transactions: number;
  volume: number;
  commission: number;
};

type RevenueReport = {
  period?: string;
  transactions: number;
  volume: number;
  commission_estimate: number;
  series?: RevenueSeriesPoint[];
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
      <span className="w-24 shrink-0 truncate text-xs text-fg-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
        <div
          className={clsx("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold text-fg-muted">{value.toLocaleString()}</span>
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
    <div className="rounded-2xl border border-line/80 bg-surfaceBg p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">{label}</p>
          <p className="mt-2 text-2xl font-extrabold text-fg">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-fg-subtle">{sub}</p>}
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
    <div className="rounded-2xl border border-line/80 bg-surfaceBg p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-bold text-fg">Conversion Funnel</h3>
      <div className="space-y-3">
        {steps.map((s, i) => {
          const pct = i > 0 && steps[i - 1].value > 0
            ? Math.round((s.value / steps[i - 1].value) * 100)
            : null;
          return (
            <div key={s.label}>
              <MiniBar label={s.label} value={s.value} max={max} color={s.color} />
              {pct !== null && (
                <p className="mt-0.5 pl-[7.5rem] text-[10px] text-fg-subtle">
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
    <div className="rounded-2xl border border-line/80 bg-surfaceBg p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-fg">Revenue</h3>
        <div className="flex gap-1 rounded-xl border border-line bg-canvas p-0.5">
          {PERIOD_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setPeriod(o.value)}
              className={clsx(
                "rounded-lg px-3 py-1 text-xs font-semibold transition-colors",
                period === o.value ? "bg-surfaceBg text-fg shadow-sm" : "text-fg-subtle hover:text-fg-muted"
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
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Transactions", value: String(report.transactions), color: "text-brand-700" },
              { label: "Volume", value: formatCAD(report.volume), color: "text-fg" },
              { label: "Commission Est.", value: formatCAD(report.commission_estimate), color: "text-success-400" },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <p className={clsx("text-xl font-extrabold", item.color)}>{item.value}</p>
                <p className="mt-1 text-[11px] font-medium text-fg-subtle">{item.label}</p>
              </div>
            ))}
          </div>
          {report.series && report.series.length > 0 && (
            <RevenueChart series={report.series} />
          )}
        </>
      ) : (
        <p className="py-6 text-center text-sm text-fg-subtle">No data for this period.</p>
      )}
    </div>
  );
}

// Inline SVG bar chart of daily commission revenue. Avoids pulling in a chart
// lib for a panel that only needs one bar series.
function RevenueChart({ series }: { series: RevenueSeriesPoint[] }) {
  const max = Math.max(...series.map((p) => p.commission), 1);
  const w = 100;
  const h = 40;
  const barW = w / series.length;
  return (
    <div className="mt-5 border-t border-line/60 pt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
        Daily commission
      </p>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-24 w-full"
        role="img"
        aria-label={`Daily commission across ${series.length} days, peak ${formatCAD(max)}.`}
      >
        {series.map((p, i) => {
          const barH = (p.commission / max) * (h - 2);
          return (
            <rect
              key={p.day}
              x={i * barW + 0.2}
              y={h - barH}
              width={Math.max(barW - 0.4, 0.4)}
              height={barH}
              className="fill-success-500/70"
            >
              <title>{`${p.day} — ${formatCAD(p.commission)} (${p.transactions} txn)`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
        <span>{series[0]?.day ?? ""}</span>
        <span>{series[series.length - 1]?.day ?? ""}</span>
      </div>
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
          color: "bg-brand-500/15 text-brand-400",
          sub: stats.active_users_30d ? `${stats.active_users_30d} active last 30d` : undefined,
        },
        {
          label: "Total Listings",
          value: (stats.total_listings ?? 0).toLocaleString(),
          icon: Package,
          color: "bg-elevated text-fg-muted",
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
          color: "bg-success-500/15 text-success-400",
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
            className="flex items-center gap-2 rounded-xl border border-line bg-surfaceBg px-3 py-2 text-sm font-medium text-fg-muted shadow-sm transition-colors hover:bg-canvas disabled:opacity-50"
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
              <div className="flex items-center justify-center rounded-2xl border border-line/80 bg-surfaceBg p-10">
                <div className="text-center">
                  <div
                    aria-hidden
                    className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-canvas text-fg-subtle"
                  >
                    <BarChart3 size={28} />
                  </div>
                  <p className="text-sm text-fg-subtle">Funnel data unavailable</p>
                </div>
              </div>
            )}
          </div>

          {/* Engagement bar chart */}
          {stats && (
            <div className="rounded-2xl border border-line/80 bg-surfaceBg p-5 shadow-sm">
              <h3 className="mb-4 text-sm font-bold text-fg">Platform Activity</h3>
              <div className="space-y-3">
                {[
                  { label: "Users", value: stats.total_users ?? 0, color: "bg-brand-500" },
                  { label: "Listings", value: stats.total_listings ?? 0, color: "bg-zinc-500" },
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
