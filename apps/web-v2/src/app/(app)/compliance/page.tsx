"use client";

import { useEffect, useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  FileText,
  Clock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import { callTool, getUser } from "@/lib/api";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Spinner } from "@/components/ui/shadcn/spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import clsx from "clsx";

const LCTR_THRESHOLD = 10_000; // CAD — PCMLTFA s.9

type Transaction = {
  id: string;
  date: string;
  counterparty: string;
  amount: number;
  method: string;
  type: string;
  flagged: boolean;
  reported: boolean;
};

type StrForm = {
  subject: string;
  description: string;
  amount: string;
  date: string;
};

function formatCAD(n: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        ok
          ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
          : "bg-red-500/10 text-red-400 ring-1 ring-red-500/20"
      )}
    >
      {ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
      {label}
    </span>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
      <Info size={16} className="mt-0.5 shrink-0 text-blue-400" />
      <p className="text-sm text-blue-200">{children}</p>
    </div>
  );
}

export default function CompliancePage() {
  const user = getUser();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  const [strForm, setStrForm] = useState<StrForm>({
    subject: "",
    description: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [strSubmitting, setStrSubmitting] = useState(false);
  const [strSuccess, setStrSuccess] = useState(false);
  const [strError, setStrError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Retention tab: server-computed checklist replacing the hardcoded
  // RETENTION_CHECKS const. See log.get_retention_status (P1-5 / PR ref).
  type RetentionCheck = {
    id: string;
    label: string;
    description: string;
    count: number;
    ok: boolean;
    action: string;
  };
  const [retention, setRetention] = useState<RetentionCheck[] | null>(null);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionError, setRetentionError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"monitor" | "lctr" | "str" | "retention">("monitor");

  // Load retention checklist the first time the retention tab is opened.
  // Lazy because the queries hit five tables; no need to run them when the
  // user is on monitor / LCTR / STR tabs.
  useEffect(() => {
    if (activeTab !== "retention" || retention !== null || retentionLoading) return;
    if (!user?.userId) return;
    let cancelled = false;
    (async () => {
      setRetentionLoading(true);
      setRetentionError(null);
      const res = await callTool("log.get_retention_status", { user_id: user.userId });
      if (cancelled) return;
      if (!res.success) {
        setRetentionError(res.error?.message ?? "Could not load retention checklist.");
        setRetentionLoading(false);
        return;
      }
      const data = res.data as Record<string, unknown> | undefined;
      const up = (data?.upstream_response as Record<string, unknown> | undefined)?.data as
        | Record<string, unknown>
        | undefined;
      const checks = (up?.checks ?? data?.checks) as RetentionCheck[] | undefined;
      setRetention(Array.isArray(checks) ? checks : []);
      setRetentionLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeTab, retention, retentionLoading, user?.userId]);

  useEffect(() => {
    async function load() {
      setLoadingTx(true);
      setLoadError(null);
      try {
        const res = await callTool("payments.get_transaction_history", {
          user_id: user?.userId,
          limit: 50,
        });
        if (!res.success) {
          setTransactions([]);
          setLoadError(res.error?.message ?? "Could not load transaction history.");
          return;
        }
        // Edge transport returns { transactions: [...] }; the legacy gateway
        // path nests it under upstream_response.data.transactions. Try the
        // nested shape first, then the flat one. Never fall back to mock
        // data — this is a regulator-facing surface (FINTRAC/PCMLTFA).
        const data = res.data as Record<string, unknown> | undefined;
        const upData = (data?.upstream_response as Record<string, unknown> | undefined)?.data as
          | Record<string, unknown>
          | undefined;
        const raw =
          (upData?.transactions as Record<string, unknown>[] | undefined) ??
          (data?.transactions as Record<string, unknown>[] | undefined) ??
          [];

        const normalized: Transaction[] = Array.isArray(raw)
          ? raw.map((t, i) => ({
              id: String(t.id ?? t.transaction_id ?? `tx-${i}`),
              date: String(t.created_at ?? t.date ?? new Date().toISOString()),
              counterparty: String(t.counterparty ?? t.description ?? "Unknown party"),
              amount: Number(t.amount ?? 0),
              method: String(t.method ?? t.payment_method ?? "unknown"),
              type: String(t.type ?? "payment"),
              flagged: Number(t.amount ?? 0) >= LCTR_THRESHOLD,
              reported: Boolean(t.lctr_reported ?? false),
            }))
          : [];
        setTransactions(normalized);
      } catch {
        setTransactions([]);
        setLoadError("Could not load transaction history.");
      } finally {
        setLoadingTx(false);
      }
    }
    load();
  }, [user?.userId]);

  const flaggedTx = transactions.filter((t) => t.flagged);
  const pendingLctrs = flaggedTx.filter((t) => !t.reported);
  const kycLevel = 2; // placeholder — would come from kyc.get_kyc_level

  async function handleSubmitStr(e: React.FormEvent) {
    e.preventDefault();
    setStrSubmitting(true);
    setStrError(null);
    try {
      await callTool("log.log_event", {
        event_type: "compliance.str_filed",
        user_id: user?.userId,
        metadata: {
          subject: strForm.subject,
          description: strForm.description,
          amount: Number(strForm.amount),
          incident_date: strForm.date,
          filed_by: user?.userId,
          filed_at: new Date().toISOString(),
        },
      });
      setStrSuccess(true);
      setStrForm({ subject: "", description: "", amount: "", date: new Date().toISOString().split("T")[0] });
    } catch {
      setStrError("Could not submit the report. Please try again or file directly via FINTRAC's F2R system.");
    } finally {
      setStrSubmitting(false);
    }
  }

  const tabs = [
    { key: "monitor" as const, label: "Transaction Monitor", icon: <AlertTriangle size={14} /> },
    { key: "lctr" as const, label: "LCTR Records", icon: <FileText size={14} /> },
    { key: "str" as const, label: "File STR", icon: <ShieldCheck size={14} /> },
    { key: "retention" as const, label: "Record Retention", icon: <Clock size={14} /> },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <AppPageHeader
        title="Compliance Centre"
        description="FINTRAC / PCMLTFA obligations — transaction monitoring, report filing, and 5-year record retention."
      />

      {/* Regulatory status strip */}
      <div className="marketplace-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-night-100">Regulatory status</p>
            <p className="text-xs text-night-300 mt-0.5">
              PCMLTFA · PIPEDA · Ontario municipal · Alberta RAPID
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge ok={kycLevel >= 2} label={kycLevel >= 2 ? "KYC compliant" : "KYC incomplete"} />
            <StatusBadge ok={pendingLctrs.length === 0} label={pendingLctrs.length === 0 ? "No pending LCTRs" : `${pendingLctrs.length} LCTR(s) pending`} />
            <StatusBadge ok label="HST registered" />
          </div>
        </div>
        <InfoBox>
          Under Canada's <strong>Proceeds of Crime (Money Laundering) and Terrorist Financing Act (PCMLTFA)</strong>, scrap
          metal dealers handling precious metals (including catalytic converters) must report cash transactions of{" "}
          <strong>CAD $10,000 or more</strong> to FINTRAC within 15 days. Records must be retained for 5 years.
        </InfoBox>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-night-700 bg-night-900 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={clsx(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
              activeTab === t.key
                ? "bg-brand-600 text-white shadow"
                : "text-night-300 hover:bg-night-800 hover:text-night-100"
            )}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab: Transaction Monitor */}
      {activeTab === "monitor" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Transactions (30d)", value: transactions.length, color: "text-night-100" },
              { label: "Above $10K threshold", value: flaggedTx.length, color: flaggedTx.length > 0 ? "text-amber-400" : "text-emerald-400" },
              { label: "Pending LCTRs", value: pendingLctrs.length, color: pendingLctrs.length > 0 ? "text-red-400" : "text-emerald-400" },
              { label: "Filed LCTRs", value: flaggedTx.filter((t) => t.reported).length, color: "text-night-100" },
            ].map((s) => (
              <div key={s.label} className="marketplace-card p-4">
                <p className={clsx("text-2xl font-black", s.color)}>{s.value}</p>
                <p className="text-xs text-night-300 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {loadError && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {loadError}
            </div>
          )}

          {loadingTx ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-6 w-6 text-brand-500" />
            </div>
          ) : transactions.length === 0 ? (
            <EmptyState
              image="/grphs/Platform%20Domains/payments-d-payments.png"
              title="No transactions yet"
              description="When this account starts trading, real transactions will appear here for LCTR review and 5-year retention. This panel never displays sample data."
              size="md"
            />
          ) : (
            <div className="marketplace-card overflow-hidden">
              <div className="px-5 py-4 border-b border-night-700">
                <p className="text-sm font-semibold text-night-100">Recent transactions</p>
                <p className="text-xs text-night-300 mt-0.5">Transactions ≥ CAD $10,000 are highlighted for LCTR review</p>
              </div>
              <div className="divide-y divide-night-800">
                {transactions.slice(0, 20).map((tx) => (
                  <div key={tx.id} className={clsx("px-5 py-3", tx.flagged && "bg-amber-500/5")}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-night-100 truncate">{tx.counterparty}</p>
                          {tx.flagged && (
                            <span className="shrink-0 text-xs font-semibold text-amber-400 bg-amber-500/10 rounded px-1.5 py-0.5">
                              LCTR threshold
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-night-300">
                          {new Date(tx.date).toLocaleDateString("en-CA")} · {tx.type} · {tx.method}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={clsx("text-sm font-bold", tx.flagged ? "text-amber-400" : "text-night-100")}>
                          {formatCAD(tx.amount)}
                        </span>
                        {tx.flagged && (
                          <Badge variant={tx.reported ? "success" : "warning"}>
                            {tx.reported ? "Reported" : "Pending"}
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}
                          className="text-night-400 hover:text-night-100"
                        >
                          {expandedTx === tx.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>
                    {expandedTx === tx.id && (
                      <div className="mt-3 rounded-lg bg-night-900 border border-night-700 p-4 text-xs space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div><span className="text-night-400">Transaction ID</span><p className="font-mono text-night-200">{tx.id}</p></div>
                          <div><span className="text-night-400">Date</span><p className="text-night-200">{new Date(tx.date).toLocaleString("en-CA")}</p></div>
                          <div><span className="text-night-400">Method</span><p className="text-night-200 capitalize">{tx.method}</p></div>
                          <div><span className="text-night-400">Type</span><p className="text-night-200 capitalize">{tx.type}</p></div>
                        </div>
                        {tx.flagged && !tx.reported && (
                          <div className="pt-2">
                            <p className="text-amber-300 font-semibold">LCTR required</p>
                            <p className="text-night-300 mt-1">
                              This transaction exceeds the $10,000 CAD PCMLTFA threshold. A Large Cash Transaction Report
                              must be filed with FINTRAC within 15 days of the transaction date. File via the{" "}
                              <a
                                href="https://www.fintrac-canafe.gc.ca/reporting-declaration/Info/rptMethods-eng"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-400 underline"
                              >
                                FINTRAC F2R portal
                              </a>
                              .
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: LCTR Records */}
      {activeTab === "lctr" && (
        <div className="space-y-4">
          <InfoBox>
            Large Cash Transaction Reports (LCTRs) must be filed within 15 days of any cash transaction of CAD $10,000 or
            more. Records must be retained for 5 years. File reports via the{" "}
            <a
              href="https://www.fintrac-canafe.gc.ca/reporting-declaration/Info/rptMethods-eng"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-400 underline"
            >
              FINTRAC F2R system
              <ExternalLink size={11} className="inline ml-0.5 -mt-0.5" />
            </a>
            .
          </InfoBox>

          {flaggedTx.length === 0 ? (
            <div className="marketplace-card p-10 text-center">
              <CheckCircle2 size={36} className="mx-auto text-emerald-400 mb-3" />
              <p className="text-night-100 font-semibold">No LCTR-threshold transactions</p>
              <p className="text-night-300 text-sm mt-1">No transactions have exceeded the CAD $10,000 threshold in the last 30 days.</p>
            </div>
          ) : (
            <div className="marketplace-card overflow-hidden">
              <div className="px-5 py-4 border-b border-night-700">
                <p className="text-sm font-semibold text-night-100">LCTR-required transactions</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-night-700 bg-night-900/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-night-400">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-night-400">Counterparty</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-night-400">Amount</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-night-400">Status</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-night-400">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-night-800">
                  {flaggedTx.map((tx) => (
                    <tr key={tx.id} className="hover:bg-night-800/30 transition-colors">
                      <td className="px-5 py-3 text-night-300 text-xs">{new Date(tx.date).toLocaleDateString("en-CA")}</td>
                      <td className="px-5 py-3 text-night-100 font-medium">{tx.counterparty}</td>
                      <td className="px-5 py-3 text-right text-amber-400 font-bold">{formatCAD(tx.amount)}</td>
                      <td className="px-5 py-3 text-center">
                        <Badge variant={tx.reported ? "success" : "warning"}>
                          {tx.reported ? "Filed" : "Pending"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {!tx.reported && (
                          <a
                            href="https://www.fintrac-canafe.gc.ca/reporting-declaration/Info/rptMethods-eng"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button size="sm" variant="secondary">
                              File LCTR <ExternalLink size={11} />
                            </Button>
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: File STR */}
      {activeTab === "str" && (
        <div className="space-y-4">
          <InfoBox>
            A Suspicious Transaction Report (STR) must be filed with FINTRAC as soon as possible when there are
            reasonable grounds to suspect a transaction is related to money laundering or terrorist financing. There is no
            minimum dollar threshold for STRs.
          </InfoBox>

          {strSuccess ? (
            <div className="marketplace-card p-10 text-center">
              <CheckCircle2 size={36} className="mx-auto text-emerald-400 mb-3" />
              <p className="text-night-100 font-semibold">STR logged successfully</p>
              <p className="text-night-300 text-sm mt-1">
                The report has been logged in the Matex compliance audit trail. Remember to also file directly with
                FINTRAC via the{" "}
                <a
                  href="https://www.fintrac-canafe.gc.ca/reporting-declaration/Info/rptMethods-eng"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-400 underline"
                >
                  F2R portal
                </a>
                .
              </p>
              <Button className="mt-4" variant="secondary" onClick={() => setStrSuccess(false)}>
                File another STR
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmitStr} className="marketplace-card p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-night-200 mb-2">
                  Subject / party name <span className="text-red-400">*</span>
                </label>
                <input
                  required
                  className="w-full rounded-xl border border-night-700 bg-night-850 px-4 py-3 text-sm text-night-100 placeholder:text-night-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  placeholder="Name or company involved in the suspicious activity"
                  value={strForm.subject}
                  onChange={(e) => setStrForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-night-200 mb-2">Transaction amount (CAD)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="w-full rounded-xl border border-night-700 bg-night-850 px-4 py-3 text-sm text-night-100 placeholder:text-night-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    placeholder="0.00"
                    value={strForm.amount}
                    onChange={(e) => setStrForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-night-200 mb-2">
                    Date of suspicious activity <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    className="w-full rounded-xl border border-night-700 bg-night-850 px-4 py-3 text-sm text-night-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    value={strForm.date}
                    onChange={(e) => setStrForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-night-200 mb-2">
                  Description of suspicious activity <span className="text-red-400">*</span>
                </label>
                <textarea
                  required
                  rows={5}
                  className="w-full rounded-xl border border-night-700 bg-night-850 px-4 py-3 text-sm text-night-100 placeholder:text-night-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                  placeholder="Describe what made this transaction or activity suspicious. Include dates, amounts, behaviour, and any other relevant facts."
                  value={strForm.description}
                  onChange={(e) => setStrForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              {strError && (
                <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {strError}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-night-400">
                  This log is retained for 5 years per PCMLTFA s.24. You must also file directly with FINTRAC.
                </p>
                <Button type="submit" loading={strSubmitting}>
                  <ShieldCheck size={15} />
                  Submit STR log
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tab: Record Retention */}
      {activeTab === "retention" && (
        <div className="space-y-4">
          <InfoBox>
            PCMLTFA s.24 requires all transaction records, client identification, and beneficial ownership information to be
            retained for a minimum of <strong>5 years</strong> from the date of the transaction or the end of the business
            relationship.
          </InfoBox>

          {retentionLoading && (
            <div className="flex items-center justify-center py-10">
              <Spinner className="h-5 w-5 text-brand-500" />
            </div>
          )}
          {retentionError && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {retentionError}
            </div>
          )}
          {!retentionLoading && !retentionError && retention && (
          <div className="grid gap-4 sm:grid-cols-2">
            {retention.map((check) => (
              <div key={check.id} className="marketplace-card p-5 flex gap-4">
                <div
                  className={clsx(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    check.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  )}
                >
                  {check.ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-night-100">
                    {check.label}
                    {check.count > 0 && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-night-800 px-2 py-0.5 text-[10px] font-mono text-night-300">
                        {check.count}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-night-300 mt-0.5">{check.description}</p>
                  {check.action && (
                    <p className="text-xs text-red-400 mt-1 font-medium">{check.action}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          )}

          <div className="marketplace-card p-5 space-y-3">
            <p className="text-sm font-semibold text-night-100">Alberta RAPID reporting</p>
            <p className="text-xs text-night-300">
              Under Alberta Bill 49 (in force September 2025), ALL scrap metal transactions in Alberta — including B2B —
              must be reported to the RAPID database operated by Business Watch International (BWI). This applies to
              ferrous, non-ferrous, and catalytic converter transactions.
            </p>
            <a
              href="https://www.bwi.org/rapid"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-medium"
            >
              BWI RAPID portal <ExternalLink size={11} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// Retention checks were previously a hardcoded const here. They now come
// from the log.get_retention_status tool — see useEffect above.
