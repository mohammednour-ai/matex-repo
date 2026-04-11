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
} from "lucide-react";
import { callTool, getUser, extractId } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { AppPageHeader } from "@/components/layout/AppPageHeader";

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

const MOCK_CONTRACTS: Contract[] = [
  {
    contract_id: "con-001",
    title: "Annual HMS #1 Supply Agreement",
    type: "volume",
    buyer: "Great Lakes Copper LLC",
    seller: "Ontario Metal Works",
    material: "HMS #1 Scrap Steel",
    committed_volume: 500,
    fulfilled_volume: 213,
    unit: "MT",
    pricing_model: "Fixed @ $1,600/MT",
    base_price: 1600,
    next_order_date: new Date(Date.now() + 1209600000).toISOString(),
    status: "active",
    esign_status: "completed",
  },
  {
    contract_id: "con-002",
    title: "Quarterly Copper Index-Linked Contract",
    type: "index_linked",
    buyer: "Pacific Alloys Corp.",
    seller: "WestCan Recycling",
    material: "Copper Birch",
    committed_volume: 120,
    fulfilled_volume: 45,
    unit: "MT",
    pricing_model: "LME Copper ± $50/MT premium",
    index_name: "LME Copper",
    premium: 50,
    next_order_date: new Date(Date.now() + 604800000).toISOString(),
    status: "active",
    esign_status: "completed",
  },
  {
    contract_id: "con-003",
    title: "Aluminum Standing Order — Monthly",
    type: "standing",
    buyer: "Maritime Battery Recycling",
    seller: "Atlantic Steel Co.",
    material: "Shredded Aluminum",
    committed_volume: 60,
    fulfilled_volume: 12,
    unit: "MT",
    pricing_model: "LME Aluminum + $30/MT",
    index_name: "LME Aluminum",
    premium: 30,
    next_order_date: new Date(Date.now() + 2592000000).toISOString(),
    status: "pending_signature",
    esign_status: "pending",
  },
  {
    contract_id: "con-004",
    title: "E-Waste Consignment — Ongoing",
    type: "consignment",
    buyer: "EcoTech Processors",
    seller: "GreenCycle Solutions",
    material: "Mixed E-Waste",
    committed_volume: 200,
    fulfilled_volume: 0,
    unit: "MT",
    pricing_model: "Monthly reconciliation",
    next_order_date: new Date(Date.now() + 86400000).toISOString(),
    status: "draft",
    esign_status: "not_sent",
  },
];

const MOCK_PRICES: MarketPrice[] = [
  { commodity: "LME Copper", price: 9842.5, currency: "USD", unit: "MT", change_pct: 1.23, updated_at: new Date().toISOString() },
  { commodity: "LME Aluminum", price: 2318.0, currency: "USD", unit: "MT", change_pct: -0.45, updated_at: new Date().toISOString() },
];

const TYPE_LABELS: Record<ContractType, string> = {
  standing: "Standing",
  volume: "Volume",
  hybrid: "Hybrid",
  index_linked: "Index-Linked",
  rfq_framework: "RFQ Framework",
  consignment: "Consignment",
};

const TYPE_COLORS: Record<ContractType, string> = {
  standing: "bg-blue-100 text-blue-700",
  volume: "bg-emerald-100 text-emerald-700",
  hybrid: "bg-purple-100 text-purple-700",
  index_linked: "bg-amber-100 text-amber-700",
  rfq_framework: "bg-slate-100 text-slate-600",
  consignment: "bg-orange-100 text-orange-700",
};

function statusBadge(s: ContractStatus) {
  const map: Record<ContractStatus, { label: string; variant: "success" | "warning" | "danger" | "info" | "gray" }> = {
    draft: { label: "Draft", variant: "gray" },
    pending_signature: { label: "Pending Signature", variant: "warning" },
    active: { label: "Active", variant: "success" },
    suspended: { label: "Suspended", variant: "warning" },
    expired: { label: "Expired", variant: "gray" },
    breached: { label: "Breached", variant: "danger" },
  };
  return <Badge variant={map[s].variant}>{map[s].label}</Badge>;
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
  const [contracts, setContracts] = useState<Contract[]>(MOCK_CONTRACTS);
  const [prices, setPrices] = useState<MarketPrice[]>(MOCK_PRICES);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [esignLoading, setEsignLoading] = useState<string | null>(null);
  const [activateLoading, setActivateLoading] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    loadPrices();
  }, []);

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
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: chip,
        context: { contract: selectedContract, market_prices: prices },
      }),
    });
    const data = (await res.json()) as { content?: string };
    setAiResponse(data.content ?? "Unable to get AI response right now.");
    setAiLoading(false);
  }

  async function handleAiSend(): Promise<void> {
    if (!aiMessage.trim()) return;
    setAiLoading(true);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: aiMessage, context: { contract: selectedContract } }),
    });
    const data = (await res.json()) as { content?: string };
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
        actions={<Button size="sm">+ New Contract</Button>}
      />

      {/* LME Price Widget */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {prices.map((p) => {
          const contractsUsingThis = contracts.filter((c) => c.index_name === p.commodity && c.status === "active");
          const impliedCAD = p.price * 1.38;
          return (
            <div key={p.commodity} className="marketplace-card p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-slate-500">{p.commodity}</p>
                <button onClick={loadPrices} className="text-slate-300 hover:text-slate-500">
                  <RefreshCw className={`h-3 w-3 ${pricesLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
              <p className="text-lg font-bold text-slate-900">${p.price.toLocaleString()} USD/{p.unit}</p>
              <p className="text-xs text-slate-400">≈ {formatCAD(impliedCAD)}/MT CAD</p>
              <p className={`text-xs font-medium mt-0.5 ${p.change_pct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {p.change_pct >= 0 ? "▲" : "▼"} {Math.abs(p.change_pct)}%
              </p>
              {contractsUsingThis.length > 0 && (
                <p className="text-[10px] text-blue-600 mt-1">{contractsUsingThis.length} active contract{contractsUsingThis.length > 1 ? "s" : ""}</p>
              )}
            </div>
          );
        })}
        {[
          { label: "Active Contracts", value: contracts.filter((c) => c.status === "active").length, color: "text-emerald-600" },
          { label: "Pending Signature", value: contracts.filter((c) => c.esign_status === "pending").length, color: "text-amber-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="marketplace-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
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
            <tbody className="divide-y divide-slate-100">
              {contracts.map((contract) => {
                const pct = Math.min(100, Math.round((contract.fulfilled_volume / contract.committed_volume) * 100));
                const impliedPrice =
                  contract.index_name && impliedPrices[contract.index_name]
                    ? `${formatCAD((impliedPrices[contract.index_name] * 1.38) + (contract.premium ?? 0))}/MT (live)`
                    : null;
                return (
                  <tr key={contract.contract_id} className="hover:bg-slate-50 transition">
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900 max-w-[200px] truncate">{contract.title}</p>
                      <p className="text-xs text-slate-400 truncate">{contract.material}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_COLORS[contract.type]}`}>
                        {TYPE_LABELS[contract.type]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs text-slate-600 truncate max-w-[140px]">{contract.buyer}</p>
                      <p className="text-xs text-slate-400 truncate max-w-[140px]">→ {contract.seller}</p>
                    </td>
                    <td className="px-5 py-4 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-full bg-slate-200 h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">{contract.fulfilled_volume}/{contract.committed_volume} {contract.unit}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{pct}% fulfilled</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs text-slate-700">{contract.pricing_model}</p>
                      {impliedPrice && <p className="text-[10px] text-amber-600">{impliedPrice}</p>}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-600 whitespace-nowrap">{formatDate(contract.next_order_date)}</td>
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

      {/* Contract detail drawer */}
      {selectedContract && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-900 text-base truncate pr-4">{selectedContract.title}</h2>
            <button onClick={() => setSelectedContract(null)} className="text-slate-400 hover:text-slate-600">
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
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="font-medium text-slate-800">{value}</p>
                </div>
              ))}
            </div>

            {/* Fulfillment chart */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Fulfillment Progress</p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-end gap-2 h-20">
                  {[
                    { label: "Jan", pct: 100 },
                    { label: "Feb", pct: 92 },
                    { label: "Mar", pct: 78 },
                    { label: "Apr", pct: 43 },
                    { label: "May", pct: 0 },
                    { label: "Jun", pct: 0 },
                  ].map((m) => (
                    <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
                      <div className="w-full rounded-t bg-blue-200 transition-all" style={{ height: `${m.pct}%` }}>
                        {m.pct > 0 && <div className="h-full rounded-t bg-blue-600" style={{ height: `${Math.min(m.pct, 100)}%` }} />}
                      </div>
                      <p className="text-[10px] text-slate-400">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* eSign status */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">eSignature</p>
                  {selectedContract.esign_status === "completed" ? (
                    <div className="flex items-center gap-1.5 text-emerald-700 text-sm">
                      <CheckCircle className="h-4 w-4" /> Signed by all parties
                    </div>
                  ) : selectedContract.esign_status === "pending" ? (
                    <p className="text-sm text-amber-600">Awaiting signature…</p>
                  ) : (
                    <p className="text-sm text-slate-500">Not yet sent for signing.</p>
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
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <p className="text-sm font-semibold text-blue-800">AI Contract Assistant</p>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {AI_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleAiChip(chip)}
                    className="rounded-full border border-blue-300 bg-white px-3 py-1 text-xs text-blue-700 hover:bg-blue-100 transition"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              {aiResponse && (
                <div className="mb-3 rounded-lg bg-white border border-blue-200 p-3 text-xs text-slate-700 leading-relaxed">
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
                  className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
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
