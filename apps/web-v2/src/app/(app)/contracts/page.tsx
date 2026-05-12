"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  TrendingUp,
  Bot,
  ChevronRight,
  X,
  CheckCircle,
  Send,
  BarChart3,
  RefreshCw,
  PenLine,
  PauseCircle,
  CalendarOff,
  AlertOctagon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { callTool, callCopilot, extractId } from "@/lib/api";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Spinner } from "@/components/ui/shadcn/spinner";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

type ContractType = "standing" | "volume" | "hybrid" | "index_linked" | "rfq_framework" | "consignment";
type ContractStatus = "draft" | "pending_signature" | "active" | "suspended" | "expired" | "breached";

type Contract = {
  contract_id: string;
  title: string;
  type: ContractType;
  buyer: string;
  seller: string;
  material: string;
  committed_volume: number;
  fulfilled_volume: number;
  unit: string;
  pricing_model: string;
  base_price?: number;
  index_name?: string;
  premium?: number;
  next_order_date: string;
  status: ContractStatus;
  esign_status: "pending" | "completed" | "not_sent";
};

type MarketPrice = {
  commodity: string;
  price: number;
  currency: string;
  unit: string;
  change_pct: number;
  updated_at: string;
};

const DEFAULT_PRICES: MarketPrice[] = [
  { commodity: "LME Copper", price: 0, currency: "USD", unit: "MT", change_pct: 0, updated_at: new Date().toISOString() },
  { commodity: "LME Aluminum", price: 0, currency: "USD", unit: "MT", change_pct: 0, updated_at: new Date().toISOString() },
];

type RawContract = Partial<Contract> & {
  contract_id: string;
  buyer_id?: string;
  seller_id?: string;
};

function normalizeContract(raw: RawContract): Contract {
  return {
    contract_id: raw.contract_id,
    title: raw.title ?? `Contract ${raw.contract_id.slice(0, 8)}`,
    type: ((raw.type as ContractType) ?? "volume"),
    buyer: raw.buyer ?? raw.buyer_id ?? "Buyer",
    seller: raw.seller ?? raw.seller_id ?? "Seller",
    material: raw.material ?? "",
    committed_volume: Number(raw.committed_volume ?? 0),
    fulfilled_volume: Number(raw.fulfilled_volume ?? 0),
    unit: raw.unit ?? "MT",
    pricing_model: raw.pricing_model ?? "",
    base_price: raw.base_price,
    index_name: raw.index_name,
    premium: raw.premium,
    next_order_date: raw.next_order_date ?? new Date().toISOString(),
    status: ((raw.status as ContractStatus) ?? "draft"),
    esign_status: ((raw.esign_status as Contract["esign_status"]) ?? "not_sent"),
  };
}

const TYPE_LABELS: Record<ContractType, string> = {
  standing: "Standing",
  volume: "Volume",
  hybrid: "Hybrid",
  index_linked: "Index-Linked",
  rfq_framework: "RFQ Framework",
  consignment: "Consignment",
};

const TYPE_COLORS: Record<ContractType, string> = {
  standing: "bg-blue-100 text-brand-400",
  volume: "bg-emerald-100 text-success-400",
  hybrid: "bg-purple-100 text-brand-400",
  index_linked: "bg-amber-100 text-warning-400",
  rfq_framework: "bg-elevated text-fg-muted",
  consignment: "bg-orange-100 text-orange-700",
};

function statusBadge(s: ContractStatus) {
  type Variant = "success" | "warning" | "danger" | "info" | "gray";
  const ICON_CLASS = "mr-1 h-3 w-3";
  const map: Record<ContractStatus, { label: string; variant: Variant; icon: typeof FileText }> = {
    draft: { label: "Draft", variant: "gray", icon: FileText },
    pending_signature: { label: "Pending Signature", variant: "warning", icon: PenLine },
    active: { label: "Active", variant: "success", icon: CheckCircle },
    suspended: { label: "Suspended", variant: "warning", icon: PauseCircle },
    expired: { label: "Expired", variant: "gray", icon: CalendarOff },
    breached: { label: "Breached", variant: "danger", icon: AlertOctagon },
  };
  const m = map[s];
  const Icon = m.icon;
  return (
    <Badge variant={m.variant}>
      <Icon className={ICON_CLASS} aria-hidden />
      {m.label}
    </Badge>
  );
}

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

const AI_CHIPS = [
  "Summarize this contract",
  "Calculate implied contract price",
  "What are the breach conditions?",
  "When is next auto-order?",
];

export default function ContractsPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [contractsError, setContractsError] = useState("");
  const [prices, setPrices] = useState<MarketPrice[]>(DEFAULT_PRICES);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [esignLoading, setEsignLoading] = useState<string | null>(null);
  const [activateLoading, setActivateLoading] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Fulfillment chart history for the currently selected contract (P1-2).
  // Lazily fetched each time the user picks a different contract — keeps
  // the initial /contracts load lean (the list view doesn't need the
  // chart). Loading/empty/error states render inline below.
  type FulfillmentPoint = {
    label: string;
    year: number;
    scheduled_quantity: number;
    fulfilled_quantity: number;
    pct: number;
  };
  const [fulfillmentPoints, setFulfillmentPoints] = useState<FulfillmentPoint[] | null>(null);
  const [fulfillmentLoading, setFulfillmentLoading] = useState(false);
  const [fulfillmentError, setFulfillmentError] = useState("");

  useEffect(() => {
    loadPrices();
    loadContracts();
  }, []);

  // Re-fetch fulfillment history whenever a different contract is selected.
  // Reset state on null so the chart doesn't briefly show stale data when
  // the user closes the side panel and opens a different contract.
  useEffect(() => {
    if (!selectedContract) {
      setFulfillmentPoints(null);
      setFulfillmentError("");
      return;
    }
    let cancelled = false;
    (async () => {
      setFulfillmentLoading(true);
      setFulfillmentError("");
      const res = await callTool("contracts.get_fulfillment_history", {
        contract_id: selectedContract.contract_id,
        months: 6,
      });
      if (cancelled) return;
      if (!res.success) {
        setFulfillmentError(res.error?.message ?? "Could not load fulfillment history.");
        setFulfillmentPoints([]);
        setFulfillmentLoading(false);
        return;
      }
      const data = res.data as Record<string, unknown> | undefined;
      const up = (data?.upstream_response as Record<string, unknown> | undefined)?.data as
        | Record<string, unknown>
        | undefined;
      const points = (up?.points ?? data?.points) as FulfillmentPoint[] | undefined;
      setFulfillmentPoints(Array.isArray(points) ? points : []);
      setFulfillmentLoading(false);
    })();
    return () => { cancelled = true; };
    // We intentionally key only on the contract_id, not the whole
    // selectedContract object. If a different field on the same contract
    // updates (e.g. esign_status flips after Request Signature), we don't
    // want to re-fetch the fulfillment history — it didn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContract?.contract_id]);

  async function loadContracts(): Promise<void> {
    setContractsLoading(true);
    setContractsError("");
    const res = await callTool("contracts.list_contracts", {});
    if (res.success) {
      const d = res.data as unknown as { contracts?: RawContract[] };
      setContracts(Array.isArray(d?.contracts) ? d.contracts.map(normalizeContract) : []);
    } else {
      setContractsError(res.error?.message ?? "Could not load contracts.");
    }
    setContractsLoading(false);
  }

  async function loadPrices(): Promise<void> {
    setPricesLoading(true);
    const res = await callTool("pricing.get_market_prices", { commodities: ["copper", "aluminum"] });
    if (res.success) {
      const d = res.data as unknown as { prices?: MarketPrice[] };
      if (d?.prices) setPrices(d.prices);
    }
    setPricesLoading(false);
  }

  async function handleRequestSignature(contractId: string): Promise<void> {
    setEsignLoading(contractId);
    const docRes = await callTool("esign.create_document", {
      contract_id: contractId,
      document_type: "supply_contract",
    });
    const docId = extractId(docRes, "document_id");
    await callTool("esign.send_for_signing", { document_id: docId, contract_id: contractId });
    setContracts((prev) =>
      prev.map((c) => c.contract_id === contractId ? { ...c, esign_status: "pending" as const, status: "pending_signature" } : c)
    );
    setEsignLoading(null);
  }

  async function handleActivate(contractId: string): Promise<void> {
    setActivateLoading(contractId);
    await callTool("contracts.activate_contract", { contract_id: contractId });
    setContracts((prev) =>
      prev.map((c) => c.contract_id === contractId ? { ...c, status: "active" } : c)
    );
    setActivateLoading(null);
  }

  async function handleAiChip(chip: string): Promise<void> {
    setAiMessage(chip);
    setAiLoading(true);
    const data = await callCopilot(chip, { contract: selectedContract, market_prices: prices });
    setAiResponse(data.content ?? "Unable to get AI response right now.");
    setAiLoading(false);
  }

  async function handleAiSend(): Promise<void> {
    if (!aiMessage.trim()) return;
    setAiLoading(true);
    const data = await callCopilot(aiMessage, { contract: selectedContract });
    setAiResponse(data.content ?? "Unable to get AI response right now.");
    setAiLoading(false);
  }

  const impliedPrices = prices.reduce<Record<string, number>>((acc, p) => {
    acc[p.commodity] = p.price;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Supply Contracts"
        description="Manage standing orders, volume agreements, and index-linked pricing."
        actions={
          <Button size="sm" onClick={() => router.push("/contracts/create")}>
            + New Contract
          </Button>
        }
      />

      {/* LME Price Widget */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {prices.map((p) => {
          const contractsUsingThis = contracts.filter((c) => c.index_name === p.commodity && c.status === "active");
          const impliedCAD = p.price * 1.38;
          return (
            <div key={p.commodity} className="marketplace-card p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-fg-subtle">{p.commodity}</p>
                <button onClick={loadPrices} className="text-zinc-300 hover:text-fg-subtle">
                  <RefreshCw className={`h-3 w-3 ${pricesLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
              <p className="text-lg font-bold text-fg">${p.price.toLocaleString()} USD/{p.unit}</p>
              <p className="text-xs text-fg-subtle">≈ {formatCAD(impliedCAD)}/MT CAD</p>
              <p className={`text-xs font-medium mt-0.5 ${p.change_pct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {p.change_pct >= 0 ? "▲" : "▼"} {Math.abs(p.change_pct)}%
              </p>
              {contractsUsingThis.length > 0 && (
                <p className="text-[10px] text-blue-600 mt-1">{contractsUsingThis.length} active contract{contractsUsingThis.length > 1 ? "s" : ""}</p>
              )}
            </div>
          );
        })}
        {(() => {
          const activeN = contracts.filter((c) => c.status === "active").length;
          const pendingN = contracts.filter((c) => c.esign_status === "pending").length;
          return [
            { label: "Active Contracts", value: activeN, color: activeN > 0 ? "text-emerald-600" : "text-fg" },
            { label: "Pending Signature", value: pendingN, color: pendingN > 0 ? "text-amber-600" : "text-fg" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-line bg-surfaceBg p-4 shadow-sm">
              <p className="text-xs font-semibold text-fg-subtle">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ));
        })()}
      </div>

      {contractsError && (
        <div className="rounded-2xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
          {contractsError}
        </div>
      )}

      {/* Table */}
      {contractsLoading ? (
        <div className="marketplace-card flex items-center justify-center py-16">
          <Spinner className="h-5 w-5 text-brand-500" />
        </div>
      ) : contracts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No supply contracts yet"
          description="Create a standing order, volume commitment, or index-linked agreement to lock in supply."
          cta={{ label: "New contract", onClick: () => router.push("/contracts/create") }}
          size="lg"
        />
      ) : (
      <div className="marketplace-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                <th className="px-5 py-3 text-left">Contract</th>
                <th className="px-5 py-3 text-left">Type</th>
                <th className="px-5 py-3 text-left">Parties</th>
                <th className="px-5 py-3 text-left">Volume Progress</th>
                <th className="px-5 py-3 text-left">Pricing</th>
                <th className="px-5 py-3 text-left">Next Order</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {contracts.map((contract) => {
                const pct = Math.min(100, Math.round((contract.fulfilled_volume / contract.committed_volume) * 100));
                const impliedPrice =
                  contract.index_name && impliedPrices[contract.index_name]
                    ? `${formatCAD((impliedPrices[contract.index_name] * 1.38) + (contract.premium ?? 0))}/MT (live)`
                    : null;
                return (
                  <tr key={contract.contract_id} className="hover:bg-canvas transition">
                    <td className="px-5 py-4">
                      <p className="font-medium text-fg max-w-[200px] truncate">{contract.title}</p>
                      <p className="text-xs text-fg-subtle truncate">{contract.material}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_COLORS[contract.type]}`}>
                        {TYPE_LABELS[contract.type]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs text-fg-muted truncate max-w-[140px]">{contract.buyer}</p>
                      <p className="text-xs text-fg-subtle truncate max-w-[140px]">→ {contract.seller}</p>
                    </td>
                    <td className="px-5 py-4 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-full bg-night-700 h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-fg-subtle whitespace-nowrap">{contract.fulfilled_volume}/{contract.committed_volume} {contract.unit}</span>
                      </div>
                      <p className="text-[10px] text-fg-subtle mt-0.5">{pct}% fulfilled</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs text-fg-muted">{contract.pricing_model}</p>
                      {impliedPrice && <p className="text-[10px] text-amber-600">{impliedPrice}</p>}
                    </td>
                    <td className="px-5 py-4 text-xs text-fg-muted whitespace-nowrap">{formatDate(contract.next_order_date)}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        {statusBadge(contract.status)}
                        {contract.esign_status === "completed" ? (
                          <span className="text-[10px] text-emerald-600 flex items-center gap-0.5"><CheckCircle className="h-2.5 w-2.5" />eSigned</span>
                        ) : contract.esign_status === "pending" ? (
                          <span className="text-[10px] text-amber-600">Signature pending</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedContract(contract)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Contract detail drawer */}
      {selectedContract && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-line bg-surfaceBg shadow-2xl overflow-y-auto">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-semibold text-fg text-base truncate pr-4">{selectedContract.title}</h2>
            <button onClick={() => setSelectedContract(null)} className="text-fg-subtle hover:text-fg-muted">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {/* Details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "Type", value: TYPE_LABELS[selectedContract.type] },
                { label: "Status", value: selectedContract.status },
                { label: "Buyer", value: selectedContract.buyer },
                { label: "Seller", value: selectedContract.seller },
                { label: "Material", value: selectedContract.material },
                { label: "Volume", value: `${selectedContract.committed_volume} ${selectedContract.unit}` },
                { label: "Pricing", value: selectedContract.pricing_model },
                { label: "Next Order", value: formatDate(selectedContract.next_order_date) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-fg-subtle">{label}</p>
                  <p className="font-medium text-fg">{value}</p>
                </div>
              ))}
            </div>

            {/* Fulfillment chart — six monthly buckets from
                contracts.get_fulfillment_history. Each bar's height is the
                scheduled quantity (full bar); the filled portion is the
                fulfilled fraction. Empty months render as a flat baseline
                so the timeline is intuitive even when delivery cadence is
                irregular. */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle mb-2">
                Fulfillment Progress
                <span className="ml-1.5 font-normal normal-case text-fg-subtle">— last 6 months</span>
              </p>
              <div className="rounded-xl border border-line bg-canvas p-4">
                {fulfillmentLoading ? (
                  <div className="flex h-20 items-center justify-center">
                    <Spinner className="h-4 w-4 text-brand-500" />
                  </div>
                ) : fulfillmentError ? (
                  <p className="text-xs text-danger-400 py-2">{fulfillmentError}</p>
                ) : !fulfillmentPoints || fulfillmentPoints.length === 0 ? (
                  <p className="text-xs text-fg-subtle py-2">No fulfillment history yet for this contract.</p>
                ) : (
                  <>
                    <div className="flex items-end gap-2 h-20">
                      {(() => {
                        // Normalize bar heights against the busiest month so
                        // the chart fits the panel even when scheduled
                        // volumes vary by 10x across months.
                        const maxScheduled = Math.max(
                          ...fulfillmentPoints.map((p) => p.scheduled_quantity),
                          1,
                        );
                        return fulfillmentPoints.map((m) => {
                          const barHeightPct = (m.scheduled_quantity / maxScheduled) * 100;
                          return (
                            <div key={`${m.year}-${m.label}`} className="flex flex-1 flex-col items-center gap-1">
                              <div className="w-full rounded-t bg-info-500/30 transition-all" style={{ height: `${barHeightPct}%` }}>
                                {m.pct > 0 && (
                                  <div
                                    className="rounded-t bg-blue-600"
                                    style={{ height: `${Math.min(m.pct, 100)}%` }}
                                    title={`${m.fulfilled_quantity} / ${m.scheduled_quantity} ${selectedContract.unit} (${m.pct}%)`}
                                  />
                                )}
                              </div>
                              <p className="text-[10px] text-fg-subtle">{m.label}</p>
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <p className="mt-2 text-[10px] text-fg-subtle">
                      Bar height = scheduled volume; filled portion = fulfilled.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* eSign status */}
            <div className="rounded-xl border border-line p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle mb-1">eSignature</p>
                  {selectedContract.esign_status === "completed" ? (
                    <div className="flex items-center gap-1.5 text-success-400 text-sm">
                      <CheckCircle className="h-4 w-4" /> Signed by all parties
                    </div>
                  ) : selectedContract.esign_status === "pending" ? (
                    <p className="text-sm text-amber-600">Awaiting signature…</p>
                  ) : (
                    <p className="text-sm text-fg-subtle">Not yet sent for signing.</p>
                  )}
                </div>
                {selectedContract.esign_status !== "completed" && (
                  <Button
                    size="sm"
                    loading={esignLoading === selectedContract.contract_id}
                    onClick={() => handleRequestSignature(selectedContract.contract_id)}
                  >
                    <PenLine className="h-3.5 w-3.5" /> Request Signature
                  </Button>
                )}
              </div>
            </div>

            {selectedContract.status === "draft" && (
              <Button
                size="md"
                className="w-full"
                loading={activateLoading === selectedContract.contract_id}
                onClick={() => handleActivate(selectedContract.contract_id)}
              >
                Activate Contract
              </Button>
            )}

            {/* AI Contract Assistant */}
            <div className="rounded-xl border border-info-500/30 bg-brand-500/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm font-semibold text-brand-400">AI Contract Assistant</p>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {AI_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleAiChip(chip)}
                    className="rounded-full border border-blue-300 bg-surfaceBg px-3 py-1 text-xs text-brand-400 hover:bg-blue-100 transition"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              {aiResponse && (
                <div className="mb-3 rounded-lg bg-surfaceBg border border-blue-200 p-3 text-xs text-fg-muted leading-relaxed">
                  {aiResponse}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ask about this contract…"
                  value={aiMessage}
                  onChange={(e) => setAiMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAiSend()}
                  className="flex-1 rounded-lg border border-blue-200 bg-surfaceBg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={handleAiSend}
                  disabled={aiLoading || !aiMessage.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {aiLoading ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Send className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedContract && (
        <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelectedContract(null)} />
      )}
    </div>
  );
}
