"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Shield,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Snowflake,
  RefreshCcw,
  MessageSquareWarning,
  DollarSign,
} from "lucide-react";
import { callTool, getUser, extractId } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { AppPageHeader } from "@/components/layout/AppPageHeader";

type EscrowStatus = "created" | "funds_held" | "released" | "frozen" | "refunded" | "disputed";
type Tab = "active" | "pending_release" | "released" | "frozen";

type ReleaseCondition = {
  key: string;
  label: string;
  met: boolean;
};

type EscrowRecord = {
  escrow_id: string;
  order_id: string;
  order_title: string;
  buyer: string;
  seller: string;
  amount: number;
  commission: number;
  status: EscrowStatus;
  created_at: string;
  release_conditions: ReleaseCondition[];
};

const MOCK_ESCROWS: EscrowRecord[] = [
  {
    escrow_id: "esc-001",
    order_id: "ord-001",
    order_title: "HMS #1 Scrap Steel — 18 MT",
    buyer: "Acme Smelting Inc.",
    seller: "Ontario Metal Works",
    amount: 28500,
    commission: 997.5,
    status: "funds_held",
    created_at: new Date(Date.now() - 172800000).toISOString(),
    release_conditions: [
      { key: "inspection_approved", label: "Inspection approved", met: true },
      { key: "delivery_confirmed", label: "Delivery confirmed (POD uploaded)", met: false },
      { key: "dispute_resolved", label: "No open disputes", met: true },
    ],
  },
  {
    escrow_id: "esc-002",
    order_id: "ord-002",
    order_title: "Copper Birch — 3 MT",
    buyer: "Great Lakes Copper LLC",
    seller: "WestCan Recycling",
    amount: 19800,
    commission: 693,
    status: "funds_held",
    created_at: new Date(Date.now() - 86400000).toISOString(),
    release_conditions: [
      { key: "inspection_approved", label: "Inspection approved", met: false },
      { key: "delivery_confirmed", label: "Delivery confirmed (POD uploaded)", met: false },
      { key: "dispute_resolved", label: "No open disputes", met: true },
    ],
  },
  {
    escrow_id: "esc-003",
    order_id: "ord-003",
    order_title: "Shredded Aluminum — 8 MT",
    buyer: "Pacific Alloys Corp.",
    seller: "GreenCycle Solutions",
    amount: 14200,
    commission: 497,
    status: "released",
    created_at: new Date(Date.now() - 604800000).toISOString(),
    release_conditions: [
      { key: "inspection_approved", label: "Inspection approved", met: true },
      { key: "delivery_confirmed", label: "Delivery confirmed (POD uploaded)", met: true },
      { key: "dispute_resolved", label: "No open disputes", met: true },
    ],
  },
  {
    escrow_id: "esc-004",
    order_id: "ord-004",
    order_title: "Lead-Acid Batteries — 5 MT",
    buyer: "Maritime Battery Recycling",
    seller: "Atlantic Steel Co.",
    amount: 6400,
    commission: 224,
    status: "frozen",
    created_at: new Date(Date.now() - 259200000).toISOString(),
    release_conditions: [
      { key: "inspection_approved", label: "Inspection approved", met: false },
      { key: "delivery_confirmed", label: "Delivery confirmed (POD uploaded)", met: false },
      { key: "dispute_resolved", label: "No open disputes", met: false },
    ],
  },
];

const STATUS_TAB_MAP: Record<Tab, EscrowStatus[]> = {
  active: ["created", "funds_held"],
  pending_release: ["funds_held"],
  released: ["released"],
  frozen: ["frozen", "disputed"],
};

const TABS: { key: Tab; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "pending_release", label: "Pending Release" },
  { key: "released", label: "Released" },
  { key: "frozen", label: "Frozen" },
];

function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);
}

function statusBadge(status: EscrowStatus) {
  const map: Record<EscrowStatus, { label: string; variant: "success" | "warning" | "danger" | "info" | "gray" }> = {
    created: { label: "Created", variant: "gray" },
    funds_held: { label: "Funds Held", variant: "info" },
    released: { label: "Released", variant: "success" },
    frozen: { label: "Frozen", variant: "danger" },
    refunded: { label: "Refunded", variant: "warning" },
    disputed: { label: "Disputed", variant: "danger" },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

const TIMELINE_STEPS = [
  "Escrow Created",
  "Funds Held",
  "Goods Shipped",
  "Delivery Confirmed",
  "Funds Released",
];

function timelineStep(status: EscrowStatus): number {
  const map: Record<EscrowStatus, number> = {
    created: 0,
    funds_held: 1,
    released: 4,
    frozen: 1,
    refunded: 4,
    disputed: 1,
  };
  return map[status] ?? 0;
}

export default function EscrowPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [escrows, setEscrows] = useState<EscrowRecord[]>(MOCK_ESCROWS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const filtered = escrows.filter((e) => {
    if (tab === "active") return ["created", "funds_held"].includes(e.status);
    if (tab === "pending_release") return e.status === "funds_held" && e.release_conditions.every((c) => c.met);
    if (tab === "released") return e.status === "released";
    if (tab === "frozen") return ["frozen", "disputed"].includes(e.status);
    return false;
  });

  async function doAction(escrowId: string, action: string): Promise<void> {
    if (action === "freeze") {
      const reason = window.prompt("Please enter a reason for freezing this escrow:");
      if (!reason) return;
      setActionLoading(escrowId + action);
      await callTool("escrow.freeze_escrow", { escrow_id: escrowId, reason });
      setEscrows((prev) => prev.map((e) => e.escrow_id === escrowId ? { ...e, status: "frozen" } : e));
      setActionLoading(null);
      return;
    }
    setActionLoading(escrowId + action);
    const toolMap: Record<string, string> = {
      hold: "escrow.hold_funds",
      release: "escrow.release_funds",
      refund: "escrow.release_funds",
      dispute: "dispute.file_dispute",
    };
    const res = await callTool(toolMap[action] ?? "escrow.get_escrow", { escrow_id: escrowId });
    setEscrows((prev) =>
      prev.map((e) => {
        if (e.escrow_id !== escrowId) return e;
        if (action === "release") return { ...e, status: "released" };
        if (action === "freeze") return { ...e, status: "frozen" };
        if (action === "refund") return { ...e, status: "refunded" };
        return e;
      })
    );
    setActionLoading(null);
  }

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Escrow Management"
        description="All funds are held in escrow until release conditions are met."
        actions={
          <Link href="/escrow/create">
            <Button size="sm">+ New Escrow</Button>
          </Link>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Held", value: formatCAD(escrows.filter((e) => e.status === "funds_held").reduce((s, e) => s + e.amount, 0)), color: "text-brand-600" },
          { label: "Active", value: escrows.filter((e) => ["created", "funds_held"].includes(e.status)).length, color: "text-steel-900" },
          { label: "Released", value: escrows.filter((e) => e.status === "released").length, color: "text-emerald-600" },
          { label: "Frozen", value: escrows.filter((e) => e.status === "frozen").length, color: "text-red-600" },
        ].map((c) => (
          <div key={c.label} className="marketplace-card p-4">
            <p className="text-xs text-steel-500">{c.label}</p>
            <p className={`mt-1 text-2xl font-bold ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-2xl border border-steel-200/80 bg-steel-100/80 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-white text-steel-900 shadow-sm" : "text-steel-500 hover:text-steel-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="marketplace-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <Shield className="h-10 w-10 opacity-30" />
            <p className="text-sm">No escrows in this category.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((escrow) => (
              <EscrowRow
                key={escrow.escrow_id}
                escrow={escrow}
                expanded={expandedId === escrow.escrow_id}
                onToggle={() => setExpandedId((prev) => (prev === escrow.escrow_id ? null : escrow.escrow_id))}
                actionLoading={actionLoading}
                onAction={doAction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EscrowRow({
  escrow,
  expanded,
  onToggle,
  actionLoading,
  onAction,
}: {
  escrow: EscrowRecord;
  expanded: boolean;
  onToggle: () => void;
  actionLoading: string | null;
  onAction: (id: string, action: string) => Promise<void>;
}) {
  const step = timelineStep(escrow.status);
  const allMet = escrow.release_conditions.every((c) => c.met);

  return (
    <div>
      <div
        className="flex cursor-pointer flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-slate-50"
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-900 text-sm">{escrow.order_title}</p>
            {statusBadge(escrow.status)}
            {allMet && escrow.status === "funds_held" && (
              <Badge variant="success">Ready to Release</Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {escrow.buyer} → {escrow.seller}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-slate-900">{formatCAD(escrow.amount)}</p>
          <p className="text-xs text-slate-400">Commission: {formatCAD(escrow.commission)}</p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        )}
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 space-y-5">
          {/* Timeline */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Progress</p>
            <div className="flex items-center gap-0">
              {TIMELINE_STEPS.map((s, i) => (
                <div key={s} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        i <= step ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-400"
                      }`}
                    >
                      {i < step ? "✓" : i + 1}
                    </div>
                    <p className={`mt-1 text-[10px] text-center w-16 leading-tight ${i <= step ? "text-brand-700 font-medium" : "text-slate-400"}`}>{s}</p>
                  </div>
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 mb-4 ${i < step ? "bg-brand-600" : "bg-slate-200"}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Release conditions */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Release Conditions</p>
            <div className="space-y-2">
              {escrow.release_conditions.map((rc) => (
                <div key={rc.key} className="flex items-center gap-2.5">
                  {rc.met ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-slate-300 shrink-0" />
                  )}
                  <span className={`text-sm ${rc.met ? "text-slate-700" : "text-slate-400"}`}>{rc.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          {escrow.status !== "released" && escrow.status !== "refunded" && (
            <div className="flex flex-wrap gap-2">
              {escrow.status === "funds_held" && allMet && (
                <Button
                  size="sm"
                  loading={actionLoading === escrow.escrow_id + "release"}
                  onClick={(e) => { e.stopPropagation(); onAction(escrow.escrow_id, "release"); }}
                >
                  Release Funds
                </Button>
              )}
              {escrow.status === "created" && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={actionLoading === escrow.escrow_id + "hold"}
                  onClick={(e) => { e.stopPropagation(); onAction(escrow.escrow_id, "hold"); }}
                >
                  Hold Funds
                </Button>
              )}
              {escrow.status !== "frozen" && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={actionLoading === escrow.escrow_id + "freeze"}
                  onClick={(e) => { e.stopPropagation(); onAction(escrow.escrow_id, "freeze"); }}
                >
                  <Snowflake className="h-3.5 w-3.5" /> Freeze
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                loading={actionLoading === escrow.escrow_id + "refund"}
                onClick={(e) => { e.stopPropagation(); onAction(escrow.escrow_id, "refund"); }}
              >
                <RefreshCcw className="h-3.5 w-3.5" /> Refund
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={actionLoading === escrow.escrow_id + "dispute"}
                onClick={(e) => { e.stopPropagation(); onAction(escrow.escrow_id, "dispute"); }}
              >
                <MessageSquareWarning className="h-3.5 w-3.5" /> File Dispute
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
