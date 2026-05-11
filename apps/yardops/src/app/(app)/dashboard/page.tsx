"use client";

import { useEffect, useState } from "react";
import { callTool, getUser } from "@/lib/api";
import { Truck, Package, DollarSign, Scale } from "lucide-react";

type ZReport = {
  total_tickets: number;
  total_net_weight_kg: number;
  total_payouts_cad: number;
  cash_on_hand: number;
  payouts_by_method: Record<string, number>;
};

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="yard-card flex items-start gap-4">
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="scale-label">{label}</p>
        <p className="mt-1 text-3xl font-black tabular-nums text-night-100 leading-none">{value}</p>
        {sub && <p className="mt-1 text-xs text-night-400">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const user = typeof window !== "undefined" ? getUser() : null;
  const [report, setReport] = useState<ZReport | null>(null);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const tenantId = user?.tenant_id;
    if (!tenantId) return;

    callTool<ZReport>("yardops.generate_z_report", { tenant_id: tenantId, business_date: today })
      .then((res) => { if (res.success && res.data) setReport(res.data as unknown as ZReport); })
      .finally(() => setLoading(false));
  }, [today]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-night-100">Dashboard</h1>
        <p className="mt-1 text-sm text-night-400">Today — {new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map((i) => (
            <div key={i} className="yard-card animate-pulse h-28">
              <div className="h-4 w-24 rounded bg-night-700" />
              <div className="mt-3 h-8 w-16 rounded bg-night-700" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Tickets Today"
            value={String(report?.total_tickets ?? 0)}
            icon={<Truck size={22} />}
          />
          <StatCard
            label="Net Weight In"
            value={report ? `${(report.total_net_weight_kg / 1000).toFixed(2)} t` : "0 kg"}
            sub="metric tonnes"
            icon={<Scale size={22} />}
          />
          <StatCard
            label="Payouts Today"
            value={report ? `$${report.total_payouts_cad.toFixed(2)}` : "$0.00"}
            sub="CAD excl. HST"
            icon={<DollarSign size={22} />}
          />
          <StatCard
            label="Cash on Hand"
            value={report ? `$${(report.cash_on_hand ?? 0).toFixed(2)}` : "$0.00"}
            sub="requires reconciliation"
            icon={<Package size={22} />}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="yard-card">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-night-400">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <a href="/intake" className="yard-btn-primary text-center block py-4">
              + New Intake
            </a>
            <a href="/reports" className="yard-btn-secondary text-center block py-4">
              Z-Report
            </a>
            <a href="/lots" className="yard-btn-secondary text-center block py-4">
              Manage Lots
            </a>
            <a href="/sellers" className="yard-btn-secondary text-center block py-4">
              Sellers
            </a>
          </div>
        </div>

        {report && (
          <div className="yard-card">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-night-400">Payouts by Method</h2>
            <div className="space-y-3">
              {Object.entries(report.payouts_by_method ?? {}).map(([method, amount]) => (
                <div key={method} className="flex items-center justify-between">
                  <span className="text-sm capitalize text-night-200">{method.replace("_", " ")}</span>
                  <span className="font-semibold tabular-nums text-night-100">${(amount as number).toFixed(2)}</span>
                </div>
              ))}
              {Object.keys(report.payouts_by_method ?? {}).length === 0 && (
                <p className="text-sm text-night-500">No payouts yet today.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
