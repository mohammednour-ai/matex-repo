"use client";

import { useState } from "react";
import { callTool, getUser } from "@/lib/api";
import { BarChart3, Download, Hash } from "lucide-react";

type ZReport = {
  business_date: string;
  total_tickets: number;
  total_net_weight_kg: number;
  total_payouts_cad: number;
  hst_collected: number;
  cash_on_hand: number;
  payouts_by_method: Record<string, number>;
};

type HSTReport = {
  period_start: string;
  period_end: string;
  total_hst_collected: number;
  total_sales_cad: number;
  filing_period: string;
};

type BylawExport = {
  export_id: string;
  record_count: number;
  sha256_hash: string;
  download_url?: string;
};

export default function ReportsPage() {
  const user = getUser();
  const tenantId = user?.tenant_id ?? "";
  const actorId = user?.user_id ?? "";

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";

  const [zDate, setZDate] = useState(today);
  const [zReport, setZReport] = useState<ZReport | null>(null);
  const [zLoading, setZLoading] = useState(false);

  const [hstStart, setHstStart] = useState(monthStart);
  const [hstEnd, setHstEnd] = useState(today);
  const [hstReport, setHstReport] = useState<HSTReport | null>(null);
  const [hstLoading, setHstLoading] = useState(false);

  const [bylawStart, setBylawStart] = useState(monthStart);
  const [bylawEnd, setBylawEnd] = useState(today);
  const [bylawResult, setBylawResult] = useState<BylawExport | null>(null);
  const [bylawLoading, setBylawLoading] = useState(false);

  const [error, setError] = useState("");

  async function fetchZReport() {
    setZLoading(true);
    setError("");
    const res = await callTool<ZReport>("yardops.generate_z_report", { tenant_id: tenantId, business_date: zDate });
    if (res.success && res.data) setZReport(res.data as unknown as ZReport);
    else setError(res.error?.message ?? "Failed to generate Z-report");
    setZLoading(false);
  }

  async function fetchHSTReport() {
    setHstLoading(true);
    setError("");
    const res = await callTool<HSTReport>("yardops.generate_hst_report", {
      tenant_id: tenantId,
      period_start: hstStart,
      period_end: hstEnd,
    });
    if (res.success && res.data) setHstReport(res.data as unknown as HSTReport);
    else setError(res.error?.message ?? "Failed to generate HST report");
    setHstLoading(false);
  }

  async function fetchBylawExport() {
    setBylawLoading(true);
    setError("");
    const res = await callTool<BylawExport>("yardops.bylaw_export", {
      tenant_id: tenantId,
      actor_id: actorId,
      date_start: bylawStart,
      date_end: bylawEnd,
    });
    if (res.success && res.data) setBylawResult(res.data as unknown as BylawExport);
    else setError(res.error?.message ?? "Failed to generate bylaw export");
    setBylawLoading(false);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-night-100 flex items-center gap-2">
          <BarChart3 size={22} className="text-brand-400" />
          Reports
        </h1>
        <p className="mt-1 text-sm text-night-400">Ontario regulatory and financial reports</p>
      </div>

      {error && <p role="alert" className="text-sm text-danger-400 rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3">{error}</p>}

      {/* Z-Report */}
      <div className="yard-card space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-night-400">Daily Z-Report</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-night-300">Business Date</label>
            <input type="date" className="yard-input" value={zDate} onChange={(e) => setZDate(e.target.value)} max={today} />
          </div>
          <button onClick={fetchZReport} disabled={zLoading} className="yard-btn-primary px-5">
            {zLoading ? "Generating…" : "Generate"}
          </button>
        </div>

        {zReport && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Tickets", value: String(zReport.total_tickets) },
                { label: "Net Weight", value: `${(zReport.total_net_weight_kg / 1000).toFixed(2)} t` },
                { label: "Total Payouts", value: `$${zReport.total_payouts_cad.toFixed(2)}` },
                { label: "HST Collected", value: `$${zReport.hst_collected.toFixed(2)}` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-night-700 bg-night-800 p-3 text-center">
                  <p className="text-xs text-night-500 mb-1">{s.label}</p>
                  <p className="font-bold tabular-nums text-night-100">{s.value}</p>
                </div>
              ))}
            </div>
            {Object.keys(zReport.payouts_by_method ?? {}).length > 0 && (
              <div className="rounded-xl border border-night-700 bg-night-800 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-night-500 mb-3">Payouts by Method</p>
                {Object.entries(zReport.payouts_by_method).map(([method, amount]) => (
                  <div key={method} className="flex justify-between text-sm mb-1.5">
                    <span className="text-night-300 capitalize">{method.replace("_", " ")}</span>
                    <span className="tabular-nums font-semibold text-night-100">${(amount as number).toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-night-700 pt-2 mt-2 flex justify-between text-sm">
                  <span className="text-night-300">Cash on Hand</span>
                  <span className="tabular-nums font-bold text-night-100">${zReport.cash_on_hand.toFixed(2)}</span>
                </div>
              </div>
            )}
            <a
              href={`/api/reports/z-report?tenant_id=${tenantId}&date=${zDate}`}
              target="_blank"
              rel="noopener noreferrer"
              className="yard-btn-secondary flex items-center gap-2 w-fit"
            >
              <Download size={15} />
              Download PDF
            </a>
          </div>
        )}
      </div>

      {/* HST Report */}
      <div className="yard-card space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-night-400">HST Report</h2>
        <p className="text-xs text-night-500">Ontario HST 13% per ETA s.165(2)</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-night-300">Period Start</label>
            <input type="date" className="yard-input" value={hstStart} onChange={(e) => setHstStart(e.target.value)} max={today} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-night-300">Period End</label>
            <input type="date" className="yard-input" value={hstEnd} onChange={(e) => setHstEnd(e.target.value)} max={today} />
          </div>
        </div>
        <button onClick={fetchHSTReport} disabled={hstLoading} className="yard-btn-primary">
          {hstLoading ? "Generating…" : "Generate HST Report"}
        </button>

        {hstReport && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-night-700 bg-night-800 p-4 text-center">
                <p className="text-xs text-night-500 mb-1">Total Sales</p>
                <p className="font-black tabular-nums text-night-100">${hstReport.total_sales_cad.toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-night-700 bg-night-800 p-4 text-center">
                <p className="text-xs text-night-500 mb-1">HST Collected</p>
                <p className="font-black tabular-nums text-night-100">${hstReport.total_hst_collected.toFixed(2)}</p>
              </div>
            </div>
            {hstReport.filing_period && (
              <p className="text-xs text-night-400">Filing Period: {hstReport.filing_period}</p>
            )}
          </div>
        )}
      </div>

      {/* Bylaw Export */}
      <div className="yard-card space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-night-400">Bylaw Export</h2>
        <p className="text-xs text-night-500">
          Ontario scrap dealer format — SHA-256 hash embedded in PDF for tamper detection.
          For police officer requests under Ontario Municipal Act.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-night-300">Date From</label>
            <input type="date" className="yard-input" value={bylawStart} onChange={(e) => setBylawStart(e.target.value)} max={today} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-night-300">Date To</label>
            <input type="date" className="yard-input" value={bylawEnd} onChange={(e) => setBylawEnd(e.target.value)} max={today} />
          </div>
        </div>
        <button onClick={fetchBylawExport} disabled={bylawLoading} className="yard-btn-primary">
          {bylawLoading ? "Generating…" : "Generate Bylaw Export"}
        </button>

        {bylawResult && (
          <div className="space-y-3 pt-2">
            <div className="rounded-xl border border-night-700 bg-night-800 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Hash size={15} className="text-brand-400" />
                <p className="text-sm font-semibold text-night-200">Export Ready</p>
              </div>
              <div className="text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-night-400">Records</span>
                  <span className="font-medium text-night-100">{bylawResult.record_count}</span>
                </div>
                <div>
                  <p className="text-night-400 text-xs mb-0.5">SHA-256 Hash</p>
                  <p className="font-mono text-xs text-night-300 break-all">{bylawResult.sha256_hash}</p>
                </div>
              </div>
            </div>
            {bylawResult.download_url && (
              <a
                href={bylawResult.download_url}
                target="_blank"
                rel="noopener noreferrer"
                className="yard-btn-secondary flex items-center gap-2 w-fit"
              >
                <Download size={15} />
                Download Signed PDF
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
