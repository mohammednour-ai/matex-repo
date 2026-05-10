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
import { callTool, getUser } from "@/lib/api";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Spinner } from "@/components/ui/shadcn/spinner";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

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

type RawEscrow = Partial<EscrowRecord> & {
  escrow_id: string;
  status?: EscrowStatus | string;
  held_amount?: number;
  amount?: number;
  buyer_id?: string;
  seller_id?: string;
};

function normalizeEscrow(raw: RawEscrow): EscrowRecord {
  return {
    escrow_id: raw.escrow_id,
    order_id: raw.order_id ?? "",
    order_title: raw.order_title ?? `Order ${raw.order_id ?? raw.escrow_id}`,
    buyer: raw.buyer ?? raw.buyer_id ?? "Buyer",
    seller: raw.seller ?? raw.seller_id ?? "Seller",
    amount: Number(raw.amount ?? raw.held_amount ?? 0),
    commission: Number(raw.commission ?? 0),
    status: ((raw.status as EscrowStatus) ?? "created"),
    created_at: raw.created_at ?? new Date().toISOString(),
    release_conditions: Array.isArray(raw.release_conditions)
      ? raw.release_conditions
      : [
          { key: "inspection_approved", label: "Inspection approved", met: false },
          { key: "delivery_confirmed", label: "Delivery confirmed (POD uploaded)", met: false },
          { key: "dispute_resolved", label: "No open disputes", met: true },
        ],
  };
}

const EMPTY_BY_TAB: Record<Tab, { title: string; description: string }> = {
  active: {
    title: "No active escrows",
    description: "New escrows appear here when funds are held against an order.",
  },
  pending_release: {
    title: "Nothing pending release",
    description: "When all release conditions are met, orders show here ready to release.",
  },
  released: {
    title: "No released escrows yet",
    description: "Completed escrow disbursements will appear here.",
  },
  frozen: {
    title: "No frozen escrows",
    description: "Frozen or disputed escrows appear here until resolved.",
  },
};

// ─── Dispute Modal ────────────────────────────────────────────────────────────
function DisputeModal({
  escrowId,
  onClose,
  onFiled,
}: {
  escrowId: string;
  onClose: () => void;
  onFiled: (id: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) { setError("Please describe the dispute reason."); return; }
    setLoading(true);
    setError("");
    const user = getUser();
    const res = await callTool("dispute.file_dispute", {
      escrow_id: escrowId,
      reason: reason.trim(),
      filed_by: user?.userId ?? "",
    });
    setLoading(false);
    if (!res.success) { setError(res.error?.message ?? "Failed to file dispute."); return; }
    const data = res.data as unknown as { dispute_id?: string };
    onFiled(data?.dispute_id ?? escrowId);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dispute-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-line bg-surfaceBg p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="dispute-modal-title" className="text-base font-bold text-fg">File a Dispute</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dispute dialog"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-fg-subtle hover:bg-elevated hover:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <XCircle className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mb-4 text-sm text-fg-muted">
          Disputing this escrow will freeze funds and open a case for resolution. Both parties will be notified.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="dispute-reason" className="mb-1 block text-sm font-semibold text-fg-muted">
              Reason for dispute <span className="text-danger-600">*</span>
            </label>
            <textarea
              id="dispute-reason"
              rows={4}
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(""); }}
              placeholder="Describe the issue in detail — undelivered goods, quality problems, payment discrepancies, etc."
              className="w-full rounded-xl border border-line px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {error && <p className="text-xs font-medium text-danger-600">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-fg-muted transition-colors hover:bg-canvas"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !reason.trim()}
              className="flex-1 rounded-xl bg-danger-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-danger-700 disabled:opacity-60"
            >
              {loading ? "Filing…" : "File Dispute"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EscrowPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [escrows, setEscrows] = useState<EscrowRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [disputeEscrowId, setDisputeEscrowId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const user = getUser();
      const res = await callTool("escrow.list_escrows", {
        user_id: user?.userId ?? "",
      });
      if (cancelled) return;
      if (res.success) {
        const data = res.data as unknown as { escrows?: RawEscrow[] };
        const list = Array.isArray(data?.escrows) ? data.escrows.map(normalizeEscrow) : [];
        setEscrows(list);
      } else {
        setError(res.error?.message ?? "Could not load escrows.");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = escrows.filter((e) => {
    if (tab === "active") return ["created", "funds_held"].includes(e.status);
    if (tab === "pending_release") return e.status === "funds_held" && e.release_conditions.every((c) => c.met);
    if (tab === "released") return e.status === "released";
    if (tab === "frozen") return ["frozen", "disputed"].includes(e.status);
    return false;
  });

  async function doAction(escrowId: string, action: string): Promise<void> {
    if (action === "dispute") {
      setDisputeEscrowId(escrowId);
      return;
    }
    const performedBy = getUser()?.userId ?? "";
    if (action === "freeze") {
      const reason = "Frozen by operator";
      setActionLoading(escrowId + action);
      await callTool("escrow.freeze_escrow", { escrow_id: escrowId, reason, performed_by: performedBy });
      setEscrows((prev) => prev.map((e) => e.escrow_id === escrowId ? { ...e, status: "frozen" } : e));
      setActionLoading(null);
      return;
    }
    setActionLoading(escrowId + action);
    const toolMap: Record<string, string> = {
      hold: "escrow.hold_funds",
      release: "escrow.release_funds",
      refund: "escrow.refund_escrow",
    };
    await callTool(toolMap[action] ?? "escrow.get_escrow", {
      escrow_id: escrowId,
      performed_by: performedBy,
    });
    setEscrows((prev) =>
      prev.map((e) => {
        if (e.escrow_id !== escrowId) return e;
        if (action === "release") return { ...e, status: "released" };
        if (action === "freeze") return { ...e, status: "frozen" };
        if (action === "refund") return { ...e, status: "refunded" };
        if (action === "hold") return { ...e, status: "funds_held" };
        return e;
      })
    );
    setActionLoading(null);
  }

  return (
    <div className="space-y-6">
      {disputeEscrowId && (
        <DisputeModal
          escrowId={disputeEscrowId}
          onClose={() => setDisputeEscrowId(null)}
          onFiled={() => {
            setEscrows((prev) =>
              prev.map((e) => e.escrow_id === disputeEscrowId ? { ...e, status: "disputed" } : e)
            );
            setDisputeEscrowId(null);
          }}
        />
      )}
      <AppPageHeader
        title="Escrow Management"
        description="All funds are held in escrow until release conditions are met."
        actions={
          <Link href="/escrow/create">
            <Button size="sm">+ New Escrow</Button>
          </Link>
        }
      />

      {/* Summary — zero values render neutral (no green/red alarm on empty state). */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(() => {
          const heldAmt = escrows.filter((e) => e.status === "funds_held").reduce((s, e) => s + e.amount, 0);
          const activeN = escrows.filter((e) => ["created", "funds_held"].includes(e.status)).length;
          const releasedN = escrows.filter((e) => e.status === "released").length;
          const frozenN = escrows.filter((e) => e.status === "frozen").length;
          const stats: { label: string; value: string | number; color: string }[] = [
            { label: "Total Held", value: formatCAD(heldAmt), color: heldAmt > 0 ? "text-brand-600" : "text-fg" },
            { label: "Active", value: activeN, color: "text-fg" },
            { label: "Released", value: releasedN, color: releasedN > 0 ? "text-emerald-600" : "text-fg" },
            { label: "Frozen", value: frozenN, color: frozenN > 0 ? "text-red-600" : "text-fg" },
          ];
          return stats.map((c) => (
            <div key={c.label} className="marketplace-card p-4">
              <p className="text-xs text-fg-subtle">{c.label}</p>
              <p className={`mt-1 text-2xl font-bold ${c.color}`}>{c.value}</p>
            </div>
          ));
        })()}
      </div>

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-2xl border border-line/80 bg-elevated/80 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-surfaceBg text-fg shadow-sm" : "text-fg-subtle hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-danger-500/10 px-4 py-3 text-sm text-danger-400">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="marketplace-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner className="h-5 w-5 text-brand-500" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Shield}
            title={EMPTY_BY_TAB[tab].title}
            description={EMPTY_BY_TAB[tab].description}
            cta={tab === "active" ? { label: "Create escrow", href: "/escrow/create" } : undefined}
            size="lg"
          />
        ) : (
          <div className="divide-y divide-zinc-100">
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
        className="flex cursor-pointer flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-canvas"
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-fg text-sm">{escrow.order_title}</p>
            {statusBadge(escrow.status)}
            {allMet && escrow.status === "funds_held" && (
              <Badge variant="success">Ready to Release</Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-fg-subtle">
            {escrow.buyer} → {escrow.seller}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-fg">{formatCAD(escrow.amount)}</p>
          <p className="text-xs text-fg-subtle">Commission: {formatCAD(escrow.commission)}</p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-fg-subtle shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-fg-subtle shrink-0" />
        )}
      </div>

      {expanded && (
        <div className="border-t border-line/60 bg-canvas px-5 py-4 space-y-5">
          {/* Timeline */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle mb-3">Progress</p>
            <div className="flex items-center gap-0">
              {TIMELINE_STEPS.map((s, i) => (
                <div key={s} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        i <= step ? "bg-brand-600 text-white" : "bg-night-700 text-fg-subtle"
                      }`}
                    >
                      {i < step ? "✓" : i + 1}
                    </div>
                    <p className={`mt-1 text-[10px] text-center w-16 leading-tight ${i <= step ? "text-brand-700 font-medium" : "text-fg-subtle"}`}>{s}</p>
                  </div>
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 mb-4 ${i < step ? "bg-brand-600" : "bg-night-700"}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Release conditions */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle mb-2">Release Conditions</p>
            <div className="space-y-2">
              {escrow.release_conditions.map((rc) => (
                <div key={rc.key} className="flex items-center gap-2.5">
                  {rc.met ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-zinc-300 shrink-0" />
                  )}
                  <span className={`text-sm ${rc.met ? "text-fg-muted" : "text-fg-subtle"}`}>{rc.label}</span>
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
