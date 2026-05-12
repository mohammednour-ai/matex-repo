"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Users,
  Package,
  ShoppingCart,
  Shield,
  Gavel,
  Landmark,
  CreditCard,
  Settings2,
  ScrollText,
  UserCog,
} from "lucide-react";
import { callTool, getUser, type MCPResponse } from "@/lib/api";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Badge } from "@/components/ui/shadcn/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import clsx from "clsx";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { PriceSparkline } from "@/components/intelligence/PriceSparkline";

type TabId =
  | "overview"
  | "users"
  | "listings"
  | "orders"
  | "escrow"
  | "auctions"
  | "bids"
  | "purchases"
  | "config"
  | "audit";

function unwrapToolPayload(res: MCPResponse): Record<string, unknown> | null {
  if (!res.success || !res.data) return null;
  const d = res.data as Record<string, unknown>;
  const ur = d.upstream_response as Record<string, unknown> | undefined;
  if (ur && typeof ur === "object" && ur.data !== undefined) {
    return ur.data as Record<string, unknown>;
  }
  return d;
}

const TABS: { id: TabId; label: string; icon: typeof Users }[] = [
  { id: "overview", label: "Overview", icon: Landmark },
  { id: "users", label: "Users & clients", icon: Users },
  { id: "listings", label: "Listings", icon: Package },
  { id: "orders", label: "Orders (DB)", icon: ShoppingCart },
  { id: "escrow", label: "Escrow", icon: Shield },
  { id: "auctions", label: "Auctions & lots", icon: Gavel },
  { id: "bids", label: "Bids", icon: Gavel },
  { id: "purchases", label: "Purchases / pay", icon: CreditCard },
  { id: "config", label: "Keys & prefs", icon: Settings2 },
  { id: "audit", label: "Audit trail", icon: ScrollText },
];

function JsonPreview({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <pre className="text-[11px] leading-snug bg-zinc-950 text-zinc-200 p-3 rounded-lg overflow-x-auto max-h-48 border border-white/10">
      {text}
    </pre>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("overview");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [overviewHistory, setOverviewHistory] = useState<Record<string, number[]>>({});
  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [listings, setListings] = useState<Record<string, unknown>[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [escrows, setEscrows] = useState<Record<string, unknown>[]>([]);
  const [auctions, setAuctions] = useState<Record<string, unknown>[]>([]);
  const [lots, setLots] = useState<Record<string, unknown>[]>([]);
  const [bids, setBids] = useState<Record<string, unknown>[]>([]);
  const [txs, setTxs] = useState<Record<string, unknown>[]>([]);
  const [configEntries, setConfigEntries] = useState<Record<string, unknown>[]>([]);
  const [auditEntries, setAuditEntries] = useState<Record<string, unknown>[]>([]);

  const [grantUserId, setGrantUserId] = useState("");
  const [cfgKey, setCfgKey] = useState("");
  const [cfgVal, setCfgVal] = useState("");
  const [payUserId, setPayUserId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [escrowIdInput, setEscrowIdInput] = useState("");
  const [escrowAmt, setEscrowAmt] = useState("100");
  const [escrowReason, setEscrowReason] = useState("");
  const [auctionIdFilter, setAuctionIdFilter] = useState("");
  const [orderIdStatus, setOrderIdStatus] = useState("");
  const [orderNewStatus, setOrderNewStatus] = useState("confirmed");
  // Audit-trail filters. category + user_id are server-side; actionFilter is
  // client-side substring match so the operator can refine without re-fetching.
  const [auditCategory, setAuditCategory] = useState<string>("");
  const [auditUserId, setAuditUserId] = useState<string>("");
  const [auditActionFilter, setAuditActionFilter] = useState<string>("");
  const [auditExpanded, setAuditExpanded] = useState<Record<string, boolean>>({});

  const flash = useCallback((m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  }, []);

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.replace("/login?next=/admin");
      return;
    }
    setAllowed(Boolean(user.isPlatformAdmin));
  }, [router]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setErr(null);
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Request failed");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const loadOverview = useCallback(async () => {
    // Pull current totals + 14-day history in parallel; the history call is
    // best-effort so a failure there doesn't blank the cards.
    const [r, h] = await Promise.all([
      callTool("admin.get_platform_overview", {}),
      callTool("admin.get_overview_history", { days: 14 }),
    ]);
    setOverview(unwrapToolPayload(r));
    const hp = unwrapToolPayload(h);
    const series = (hp?.series as Record<string, number[]> | undefined) ?? {};
    setOverviewHistory(series);
  }, []);

  const loadUsers = useCallback(async () => {
    const r = await callTool("admin.list_users", { limit: 200 });
    const p = unwrapToolPayload(r);
    setUsers((p?.users as Record<string, unknown>[]) ?? []);
  }, []);

  const loadListings = useCallback(async () => {
    const r = await callTool("admin.list_listings", { limit: 200 });
    const p = unwrapToolPayload(r);
    setListings((p?.listings as Record<string, unknown>[]) ?? []);
  }, []);

  const loadOrders = useCallback(async () => {
    const r = await callTool("admin.list_orders", { limit: 200 });
    const p = unwrapToolPayload(r);
    setOrders((p?.orders as Record<string, unknown>[]) ?? []);
  }, []);

  const loadEscrows = useCallback(async () => {
    const r = await callTool("admin.list_escrows", { limit: 200 });
    const p = unwrapToolPayload(r);
    setEscrows((p?.escrows as Record<string, unknown>[]) ?? []);
  }, []);

  const loadAuctions = useCallback(async () => {
    const r = await callTool("admin.list_auctions", { limit: 100 });
    const p = unwrapToolPayload(r);
    setAuctions((p?.auctions as Record<string, unknown>[]) ?? []);
  }, []);

  const loadLots = useCallback(async () => {
    const r = await callTool(
      "admin.list_lots",
      auctionIdFilter.trim() ? { auction_id: auctionIdFilter.trim(), limit: 200 } : { limit: 200 },
    );
    const p = unwrapToolPayload(r);
    setLots((p?.lots as Record<string, unknown>[]) ?? []);
  }, [auctionIdFilter]);

  const loadBids = useCallback(async () => {
    const r = await callTool("admin.list_bids", { limit: 200 });
    const p = unwrapToolPayload(r);
    setBids((p?.bids as Record<string, unknown>[]) ?? []);
  }, []);

  const loadTxs = useCallback(async () => {
    const r = await callTool("admin.list_transactions", { limit: 200 });
    const p = unwrapToolPayload(r);
    setTxs((p?.transactions as Record<string, unknown>[]) ?? []);
  }, []);

  const loadConfig = useCallback(async () => {
    const r = await callTool("admin.list_platform_config", {});
    const p = unwrapToolPayload(r);
    setConfigEntries((p?.entries as Record<string, unknown>[]) ?? []);
  }, []);

  const loadAudit = useCallback(async () => {
    // Server-side filters: category, user_id. Client-side action filter is
    // applied at render time to avoid round-trips on every keystroke.
    const args: Record<string, unknown> = { limit: 200 };
    if (auditCategory) args.category = auditCategory;
    if (auditUserId.trim()) args.user_id = auditUserId.trim();
    const r = await callTool("admin.get_audit_trail", args);
    const p = unwrapToolPayload(r);
    setAuditEntries((p?.entries as Record<string, unknown>[]) ?? []);
  }, [auditCategory, auditUserId]);

  useEffect(() => {
    if (!allowed) return;
    void run(async () => {
      if (tab === "overview") await loadOverview();
      if (tab === "users") await loadUsers();
      if (tab === "listings") await loadListings();
      if (tab === "orders") await loadOrders();
      if (tab === "escrow") await loadEscrows();
      if (tab === "auctions") {
        await loadAuctions();
        await loadLots();
      }
      if (tab === "bids") await loadBids();
      if (tab === "purchases") await loadTxs();
      if (tab === "config") await loadConfig();
      if (tab === "audit") await loadAudit();
    });
  }, [
    allowed,
    tab,
    run,
    loadOverview,
    loadUsers,
    loadListings,
    loadOrders,
    loadEscrows,
    loadAuctions,
    loadLots,
    loadBids,
    loadTxs,
    loadConfig,
    loadAudit,
  ]);

  if (allowed === null) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="max-w-2xl mx-auto">
        <EmptyState
          icon={UserCog}
          iconTone="warning"
          title="Platform admin only"
          description="Your account is not marked as a platform operator. With Postgres, add your user UUID to public.matex_admin_operators, then sign in again. In local dev, set MATEX_DEV_ADMIN_EMAILS on the MCP gateway."
          cta={{ label: "Back to dashboard", href: "/dashboard" }}
          size="lg"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Platform admin"
        description="Operate listings, users, escrow, auctions, orders, payments, and configuration through MCP tools."
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={busy}
            onClick={() =>
              run(async () => {
                if (tab === "overview") await loadOverview();
                if (tab === "users") await loadUsers();
                if (tab === "listings") await loadListings();
                if (tab === "orders") await loadOrders();
                if (tab === "escrow") await loadEscrows();
                if (tab === "auctions") {
                  await loadAuctions();
                  await loadLots();
                }
                if (tab === "bids") await loadBids();
                if (tab === "purchases") await loadTxs();
                if (tab === "config") await loadConfig();
                if (tab === "audit") await loadAudit();
                flash("Refreshed");
              })
            }
            className="gap-2"
          >
            <RefreshCw size={16} />
            Refresh tab
          </Button>
        }
      />

      {msg && (
        <div className="rounded-lg border border-success-500/30 bg-success-500/10 text-success-400 text-sm px-4 py-2">{msg}</div>
      )}
      {err && (
        <div className="rounded-lg border border-danger-200 bg-danger-500/15 text-danger-400 text-sm px-4 py-2">{err}</div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-line pb-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={clsx(
                "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-brand-600 text-white shadow-sm" : "bg-elevated text-fg-muted hover:bg-night-700",
              )}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {overview &&
            ["total_users", "total_listings", "total_orders", "open_disputes"].map((k) => {
              const series = overviewHistory[k] ?? [];
              // Trend is derived from the last two non-zero buckets; "open_disputes"
              // inverts the colour mapping since fewer disputes is good.
              const last = series.at(-1) ?? 0;
              const prev = series.at(-2) ?? 0;
              const goingUp = last > prev;
              const goingDown = last < prev;
              const isDisputes = k === "open_disputes";
              const trend: "up" | "down" | "stable" = goingUp
                ? (isDisputes ? "down" : "up")
                : goingDown
                  ? (isDisputes ? "up" : "down")
                  : "stable";
              return (
                <div key={k} className="rounded-xl border border-line bg-surfaceBg p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{k.replace(/_/g, " ")}</p>
                  <p className="text-2xl font-bold text-fg mt-1">{String(overview[k] ?? "—")}</p>
                  {series.length > 0 && (
                    <PriceSparkline series={series} trend={trend} height={32} className="mt-2" />
                  )}
                </div>
              );
            })}
          {!overview && <p className="text-fg-subtle text-sm">Loading overview…</p>}
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end rounded-xl border border-line bg-surfaceBg p-4">
            <Input
              label="Grant platform admin (user UUID)"
              value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)}
              className="max-w-md"
              placeholder="uuid"
            />
            <Button
              size="sm"
              onClick={() =>
                run(async () => {
                  const r = await callTool("admin.grant_platform_admin", { user_id: grantUserId.trim() });
                  if (!r.success) throw new Error(r.error?.message ?? "Grant failed");
                  flash("Granted — user must sign in again to refresh the admin menu.");
                  setGrantUserId("");
                  await loadUsers();
                })
              }
            >
              Grant
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-surfaceBg">
            <table className="min-w-full text-sm">
              <thead className="bg-canvas text-left text-xs font-semibold text-fg-muted uppercase">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">User ID</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const id = String(u.user_id ?? "");
                  return (
                    <tr key={id} className="border-t border-line/60">
                      <td className="px-3 py-2 font-medium text-fg">{String(u.email ?? "")}</td>
                      <td className="px-3 py-2">
                        <Badge variant={u.account_status === "active" ? "success" : "warning"}>
                          {String(u.account_status ?? "")}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-fg-muted">{String(u.account_type ?? "")}</td>
                      <td className="px-3 py-2 font-mono text-xs text-fg-subtle max-w-[8rem] truncate" title={id}>
                        {id}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() =>
                              run(async () => {
                                const r = await callTool("admin.suspend_user", { user_id: id, reason: "admin_console" });
                                if (!r.success) throw new Error(r.error?.message ?? "Failed");
                                await loadUsers();
                                flash("Suspended");
                              })
                            }
                          >
                            Suspend
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() =>
                              run(async () => {
                                const r = await callTool("admin.unsuspend_user", { user_id: id });
                                if (!r.success) throw new Error(r.error?.message ?? "Failed");
                                await loadUsers();
                                flash("Active");
                              })
                            }
                          >
                            Unsuspend
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "listings" && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surfaceBg">
          <table className="min-w-full text-sm">
            <thead className="bg-canvas text-left text-xs font-semibold text-fg-muted uppercase">
              <tr>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Listing ID</th>
                <th className="px-3 py-2">Moderate</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => {
                const lid = String(l.listing_id ?? "");
                return (
                  <tr key={lid} className="border-t border-line/60">
                    <td className="px-3 py-2 max-w-xs truncate">{String(l.title ?? "")}</td>
                    <td className="px-3 py-2">{String(l.status ?? "")}</td>
                    <td className="px-3 py-2">{String(l.asking_price ?? "")}</td>
                    <td className="px-3 py-2 font-mono text-xs">{lid.slice(0, 8)}…</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() =>
                            run(async () => {
                              const r = await callTool("admin.moderate_listing", {
                                listing_id: lid,
                                action: "remove",
                              });
                              if (!r.success) throw new Error(r.error?.message ?? "Failed");
                              await loadListings();
                              flash("Listing cancelled");
                            })
                          }
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() =>
                            run(async () => {
                              const r = await callTool("admin.moderate_listing", {
                                listing_id: lid,
                                action: "flag",
                              });
                              if (!r.success) throw new Error(r.error?.message ?? "Failed");
                              await loadListings();
                              flash("Flagged / suspended");
                            })
                          }
                        >
                          Flag
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end rounded-xl border border-line bg-surfaceBg p-4">
            <Input label="Order ID" value={orderIdStatus} onChange={(e) => setOrderIdStatus(e.target.value)} className="max-w-md" />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-fg-muted">New status</label>
              <select
                value={orderNewStatus}
                onChange={(e) => setOrderNewStatus(e.target.value)}
                className="rounded-lg border border-line px-3 py-2 text-sm"
              >
                {["pending", "confirmed", "shipped", "delivered", "completed", "cancelled", "disputed"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <Button
              size="sm"
              onClick={() =>
                run(async () => {
                  const r = await callTool("admin.update_order_status", {
                    order_id: orderIdStatus.trim(),
                    status: orderNewStatus,
                  });
                  if (!r.success) throw new Error(r.error?.message ?? "Failed");
                  await loadOrders();
                  flash("Order updated");
                })
              }
            >
              Update order
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-surfaceBg">
            <table className="min-w-full text-sm">
              <thead className="bg-canvas text-left text-xs font-semibold text-fg-muted uppercase">
                <tr>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Buyer</th>
                  <th className="px-3 py-2">Seller</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={String(o.order_id)} className="border-t border-line/60">
                    <td className="px-3 py-2 font-mono text-xs">{String(o.order_id ?? "").slice(0, 8)}…</td>
                    <td className="px-3 py-2">{String(o.status ?? "")}</td>
                    <td className="px-3 py-2">{String(o.original_amount ?? "")}</td>
                    <td className="px-3 py-2 font-mono text-xs max-w-[6rem] truncate">{String(o.buyer_id ?? "")}</td>
                    <td className="px-3 py-2 font-mono text-xs max-w-[6rem] truncate">{String(o.seller_id ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "escrow" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surfaceBg p-4 space-y-3">
            <p className="text-sm font-semibold text-fg">Escrow actions</p>
            <div className="flex flex-wrap gap-3 items-end">
              <Input label="Escrow ID" value={escrowIdInput} onChange={(e) => setEscrowIdInput(e.target.value)} className="max-w-md" />
              <Input label="Amount" value={escrowAmt} onChange={(e) => setEscrowAmt(e.target.value)} className="w-28" />
              <Input
                label="Reason (required for Freeze/Refund)"
                value={escrowReason}
                onChange={(e) => setEscrowReason(e.target.value)}
                className="max-w-md flex-1"
                placeholder="Why is this action being taken?"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["Hold", "escrow.hold_funds"],
                  ["Release", "escrow.release_funds"],
                  ["Freeze", "escrow.freeze_escrow"],
                  ["Refund", "escrow.refund_escrow"],
                ] as const
              ).map(([label, tool]) => (
                <Button
                  key={tool}
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    run(async () => {
                      const id = escrowIdInput.trim();
                      if (!id) throw new Error("Enter escrow ID");
                      const amount = Number(escrowAmt);
                      const performedBy = getUser()?.userId ?? "";
                      if (!performedBy) throw new Error("Sign in as a platform admin first.");
                      const reason = escrowReason.trim();
                      // Per packages/mcp-servers/escrow-mcp/src/index.ts:166-170
                      // and the matching edge handler, every state-changing
                      // tool requires performed_by; freeze/refund additionally
                      // require reason. The previous admin form omitted
                      // performed_by entirely (so every action 422'd) and
                      // hardcoded reason="admin_console" for Freeze (losing
                      // the actual operator rationale).
                      let args: Record<string, unknown>;
                      if (tool === "escrow.freeze_escrow") {
                        if (!reason) throw new Error("Reason is required to freeze an escrow.");
                        args = { escrow_id: id, reason, performed_by: performedBy };
                      } else if (tool === "escrow.refund_escrow") {
                        if (!reason) throw new Error("Reason is required to refund an escrow.");
                        if (!(amount > 0)) throw new Error("Amount must be > 0 for refund.");
                        args = { escrow_id: id, amount, reason, performed_by: performedBy };
                      } else if (tool === "escrow.release_funds") {
                        if (!(amount > 0)) throw new Error("Amount must be > 0 for release.");
                        args = { escrow_id: id, amount, performed_by: performedBy };
                      } else {
                        // hold_funds
                        if (!(amount > 0)) throw new Error("Amount must be > 0 for hold.");
                        args = { escrow_id: id, amount, performed_by: performedBy };
                      }
                      const r = await callTool(tool, args);
                      if (!r.success) throw new Error(r.error?.message ?? "Failed");
                      await loadEscrows();
                      flash(`${label} OK`);
                    })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {escrows.map((e) => (
              <div key={String(e.escrow_id)} className="rounded-lg border border-line bg-surfaceBg p-3">
                <JsonPreview value={e} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "auctions" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end rounded-xl border border-line bg-surfaceBg p-4">
            <Input
              label="Filter lots by auction ID (optional)"
              value={auctionIdFilter}
              onChange={(e) => setAuctionIdFilter(e.target.value)}
              className="max-w-md"
            />
            <Button size="sm" variant="secondary" onClick={() => run(loadLots)}>
              Load lots
            </Button>
          </div>
          <h3 className="text-sm font-bold text-fg">Auctions</h3>
          <div className="space-y-2">
            {auctions.map((a) => (
              <div key={String(a.auction_id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surfaceBg p-3">
                <div>
                  <p className="font-medium text-fg">{String(a.title ?? "")}</p>
                  <p className="text-xs text-fg-subtle font-mono">{String(a.auction_id)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="info">{String(a.status ?? "")}</Badge>
                  <Button
                    size="sm"
                    onClick={() =>
                      run(async () => {
                        const r = await callTool("auction.start_auction", { auction_id: String(a.auction_id) });
                        if (!r.success) throw new Error(r.error?.message ?? "Failed");
                        await loadAuctions();
                        flash("Auction live");
                      })
                    }
                  >
                    Start
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <h3 className="text-sm font-bold text-fg">Lots</h3>
          <div className="space-y-2">
            {lots.map((lot) => (
              <div key={String(lot.lot_id)} className="rounded-lg border border-line bg-surfaceBg p-3">
                <div className="flex flex-wrap justify-between gap-2 mb-2">
                  <span className="text-sm font-mono text-fg-muted">{String(lot.lot_id)}</span>
                  <Badge>{String(lot.status ?? "")}</Badge>
                </div>
                <JsonPreview value={lot} />
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    run(async () => {
                      const r = await callTool("auction.close_lot", { lot_id: String(lot.lot_id) });
                      if (!r.success) throw new Error(r.error?.message ?? "Failed");
                      await loadLots();
                      flash("Lot closed");
                    })
                  }
                >
                  Close lot
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "bids" && (
        <div className="space-y-2">
          {bids.map((b) => (
            <div key={String(b.bid_id)} className="rounded-lg border border-line bg-surfaceBg p-3">
              <JsonPreview value={b} />
            </div>
          ))}
        </div>
      )}

      {tab === "purchases" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surfaceBg p-4 flex flex-wrap gap-3 items-end">
            <Input label="Buyer user ID" value={payUserId} onChange={(e) => setPayUserId(e.target.value)} className="max-w-md" />
            <Input label="Amount (CAD)" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-32" />
            <Button
              size="sm"
              onClick={() =>
                run(async () => {
                  const adminUser = getUser();
                  const r = await callTool("payments.process_payment", {
                    user_id: payUserId.trim(),
                    actor_id: adminUser?.userId ?? "",
                    amount: Number(payAmount),
                    method: "admin_card",
                  });
                  if (!r.success) throw new Error(r.error?.message ?? "Failed");
                  await loadTxs();
                  flash("Payment recorded");
                })
              }
            >
              Record purchase
            </Button>
          </div>
          <h3 className="text-sm font-bold text-fg">Recent transactions</h3>
          <div className="space-y-2">
            {txs.map((t) => (
              <div key={String(t.transaction_id)} className="rounded-lg border border-line bg-surfaceBg p-3">
                <JsonPreview value={t} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "config" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surfaceBg p-4 flex flex-wrap gap-3 items-end">
            <Input label="Key" value={cfgKey} onChange={(e) => setCfgKey(e.target.value)} className="max-w-xs" />
            <Input label="Value" value={cfgVal} onChange={(e) => setCfgVal(e.target.value)} className="max-w-md" />
            <Button
              size="sm"
              onClick={() =>
                run(async () => {
                  const r = await callTool("admin.update_platform_config", {
                    key: cfgKey.trim(),
                    value: cfgVal,
                  });
                  if (!r.success) throw new Error(r.error?.message ?? "Failed");
                  await loadConfig();
                  flash("Saved");
                })
              }
            >
              Save
            </Button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-line bg-surfaceBg">
            <table className="min-w-full text-sm">
              <thead className="bg-canvas text-left text-xs font-semibold text-fg-muted uppercase">
                <tr>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {configEntries.map((row) => (
                  <tr key={String(row.config_key)} className="border-t border-line/60">
                    <td className="px-3 py-2 font-mono text-xs">{String(row.config_key)}</td>
                    <td className="px-3 py-2 max-w-md truncate" title={String(row.config_value)}>
                      {String(row.config_value)}
                    </td>
                    <td className="px-3 py-2 text-fg-subtle text-xs">{String(row.updated_at ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="space-y-3">
          {(() => {
            // Build the unique server/category set from the loaded page so the
            // chips reflect what's actually present rather than a hardcoded list.
            const categories = Array.from(
              new Set(auditEntries.map((r) => String(r.category ?? "")).filter(Boolean)),
            ).sort();
            const filtered = auditEntries.filter((r) => {
              if (!auditActionFilter.trim()) return true;
              const needle = auditActionFilter.trim().toLowerCase();
              return (
                String(r.action ?? "").toLowerCase().includes(needle) ||
                String(r.server ?? "").toLowerCase().includes(needle)
              );
            });
            return (
              <>
                <div className="rounded-xl border border-line bg-surfaceBg p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                      Category
                    </span>
                    <button
                      type="button"
                      onClick={() => setAuditCategory("")}
                      className={clsx(
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        auditCategory === ""
                          ? "bg-brand-600 text-white"
                          : "border border-line bg-canvas text-fg-muted hover:bg-elevated",
                      )}
                    >
                      All
                    </button>
                    {categories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAuditCategory(c)}
                        className={clsx(
                          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                          auditCategory === c
                            ? "bg-brand-600 text-white"
                            : "border border-line bg-canvas text-fg-muted hover:bg-elevated",
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 items-end">
                    <Input
                      label="User ID"
                      value={auditUserId}
                      onChange={(e) => setAuditUserId(e.target.value)}
                      placeholder="filter by uuid"
                      className="max-w-md"
                    />
                    <Input
                      label="Action / server contains"
                      value={auditActionFilter}
                      onChange={(e) => setAuditActionFilter(e.target.value)}
                      placeholder="e.g. listing"
                      className="max-w-md"
                    />
                    <Button size="sm" onClick={() => run(loadAudit)}>
                      Apply
                    </Button>
                    <p className="text-xs text-fg-subtle">
                      {filtered.length} of {auditEntries.length} entries
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-line bg-surfaceBg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-canvas text-left text-xs font-semibold uppercase text-fg-muted">
                      <tr>
                        <th className="px-3 py-2">When</th>
                        <th className="px-3 py-2">Server</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Action</th>
                        <th className="px-3 py-2">User</th>
                        <th className="px-3 py-2">Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row, i) => {
                        const logId = String(row.log_id ?? i);
                        const expanded = auditExpanded[logId] ?? false;
                        return (
                          <Fragment key={logId}>
                            <tr
                              className="cursor-pointer border-t border-line/60 hover:bg-canvas/60"
                              onClick={() =>
                                setAuditExpanded((prev) => ({ ...prev, [logId]: !expanded }))
                              }
                            >
                              <td className="px-3 py-2 text-xs text-fg-muted whitespace-nowrap">
                                {row.created_at ? new Date(String(row.created_at)).toLocaleString("en-CA") : "—"}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                <Badge variant="gray">{String(row.server ?? "")}</Badge>
                              </td>
                              <td className="px-3 py-2 text-xs">{String(row.category ?? "")}</td>
                              <td className="px-3 py-2 text-xs font-medium">{String(row.action ?? "")}</td>
                              <td className="px-3 py-2 font-mono text-[10px] max-w-[8rem] truncate">
                                {String(row.user_id ?? "")}
                              </td>
                              <td className="px-3 py-2 text-xs text-fg-muted max-w-xs truncate">
                                {typeof row.output_summary === "string"
                                  ? row.output_summary
                                  : JSON.stringify(row.output_summary ?? "")}
                              </td>
                            </tr>
                            {expanded && (
                              <tr className="border-t border-line/40 bg-canvas/40">
                                <td colSpan={6} className="px-3 py-2">
                                  <JsonPreview value={row} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-sm text-fg-subtle">
                            No audit entries match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
