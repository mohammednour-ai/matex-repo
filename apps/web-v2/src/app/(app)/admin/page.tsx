"use client";

import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import { callTool, getUser, type MCPResponse } from "@/lib/api";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/shadcn/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import clsx from "clsx";
import { AppPageHeader } from "@/components/layout/AppPageHeader";

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
    <pre className="text-[11px] leading-snug bg-steel-950 text-steel-200 p-3 rounded-lg overflow-x-auto max-h-48 border border-white/10">
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
  const [auctionIdFilter, setAuctionIdFilter] = useState("");
  const [orderIdStatus, setOrderIdStatus] = useState("");
  const [orderNewStatus, setOrderNewStatus] = useState("confirmed");

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
    const r = await callTool("admin.get_platform_overview", {});
    const p = unwrapToolPayload(r);
    setOverview(p);
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
    const r = await callTool("admin.get_audit_trail", { limit: 80 });
    const p = unwrapToolPayload(r);
    setAuditEntries((p?.entries as Record<string, unknown>[]) ?? []);
  }, []);

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
          image="/illustrations/admin-hero.png"
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
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm px-4 py-2">{msg}</div>
      )}
      {err && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 text-danger-800 text-sm px-4 py-2">{err}</div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-steel-200 pb-3">
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
                active ? "bg-brand-600 text-white shadow-sm" : "bg-steel-100 text-steel-600 hover:bg-steel-200",
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
            ["total_users", "total_listings", "total_orders", "open_disputes"].map((k) => (
              <div key={k} className="rounded-xl border border-steel-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-steel-500">{k.replace(/_/g, " ")}</p>
                <p className="text-2xl font-bold text-steel-900 mt-1">{String(overview[k] ?? "—")}</p>
              </div>
            ))}
          {!overview && <p className="text-steel-500 text-sm">Loading overview…</p>}
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end rounded-xl border border-steel-200 bg-white p-4">
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
          <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-steel-50 text-left text-xs font-semibold text-steel-600 uppercase">
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
                    <tr key={id} className="border-t border-steel-100">
                      <td className="px-3 py-2 font-medium text-steel-900">{String(u.email ?? "")}</td>
                      <td className="px-3 py-2">
                        <Badge variant={u.account_status === "active" ? "success" : "warning"}>
                          {String(u.account_status ?? "")}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-steel-600">{String(u.account_type ?? "")}</td>
                      <td className="px-3 py-2 font-mono text-xs text-steel-500 max-w-[8rem] truncate" title={id}>
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
        <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-steel-50 text-left text-xs font-semibold text-steel-600 uppercase">
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
                  <tr key={lid} className="border-t border-steel-100">
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
          <div className="flex flex-wrap gap-3 items-end rounded-xl border border-steel-200 bg-white p-4">
            <Input label="Order ID" value={orderIdStatus} onChange={(e) => setOrderIdStatus(e.target.value)} className="max-w-md" />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">New status</label>
              <select
                value={orderNewStatus}
                onChange={(e) => setOrderNewStatus(e.target.value)}
                className="rounded-lg border border-steel-200 px-3 py-2 text-sm"
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
          <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-steel-50 text-left text-xs font-semibold text-steel-600 uppercase">
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
                  <tr key={String(o.order_id)} className="border-t border-steel-100">
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
          <div className="rounded-xl border border-steel-200 bg-white p-4 space-y-3">
            <p className="text-sm font-semibold text-steel-800">Escrow actions</p>
            <div className="flex flex-wrap gap-3 items-end">
              <Input label="Escrow ID" value={escrowIdInput} onChange={(e) => setEscrowIdInput(e.target.value)} className="max-w-md" />
              <Input label="Amount" value={escrowAmt} onChange={(e) => setEscrowAmt(e.target.value)} className="w-28" />
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
                      const args: Record<string, unknown> =
                        tool === "escrow.freeze_escrow"
                          ? { escrow_id: id, reason: "admin_console" }
                          : { escrow_id: id, amount };
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
              <div key={String(e.escrow_id)} className="rounded-lg border border-steel-200 bg-white p-3">
                <JsonPreview value={e} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "auctions" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end rounded-xl border border-steel-200 bg-white p-4">
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
          <h3 className="text-sm font-bold text-steel-800">Auctions</h3>
          <div className="space-y-2">
            {auctions.map((a) => (
              <div key={String(a.auction_id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-steel-200 bg-white p-3">
                <div>
                  <p className="font-medium text-steel-900">{String(a.title ?? "")}</p>
                  <p className="text-xs text-steel-500 font-mono">{String(a.auction_id)}</p>
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
          <h3 className="text-sm font-bold text-steel-800">Lots</h3>
          <div className="space-y-2">
            {lots.map((lot) => (
              <div key={String(lot.lot_id)} className="rounded-lg border border-steel-200 bg-white p-3">
                <div className="flex flex-wrap justify-between gap-2 mb-2">
                  <span className="text-sm font-mono text-steel-600">{String(lot.lot_id)}</span>
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
            <div key={String(b.bid_id)} className="rounded-lg border border-steel-200 bg-white p-3">
              <JsonPreview value={b} />
            </div>
          ))}
        </div>
      )}

      {tab === "purchases" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-steel-200 bg-white p-4 flex flex-wrap gap-3 items-end">
            <Input label="Buyer user ID" value={payUserId} onChange={(e) => setPayUserId(e.target.value)} className="max-w-md" />
            <Input label="Amount (CAD)" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-32" />
            <Button
              size="sm"
              onClick={() =>
                run(async () => {
                  const r = await callTool("payments.process_payment", {
                    user_id: payUserId.trim(),
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
          <h3 className="text-sm font-bold text-steel-800">Recent transactions</h3>
          <div className="space-y-2">
            {txs.map((t) => (
              <div key={String(t.transaction_id)} className="rounded-lg border border-steel-200 bg-white p-3">
                <JsonPreview value={t} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "config" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-steel-200 bg-white p-4 flex flex-wrap gap-3 items-end">
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
          <div className="overflow-x-auto rounded-xl border border-steel-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-steel-50 text-left text-xs font-semibold text-steel-600 uppercase">
                <tr>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {configEntries.map((row) => (
                  <tr key={String(row.config_key)} className="border-t border-steel-100">
                    <td className="px-3 py-2 font-mono text-xs">{String(row.config_key)}</td>
                    <td className="px-3 py-2 max-w-md truncate" title={String(row.config_value)}>
                      {String(row.config_value)}
                    </td>
                    <td className="px-3 py-2 text-steel-500 text-xs">{String(row.updated_at ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="space-y-2">
          {auditEntries.map((row, i) => (
            <div key={String(row.log_id ?? i)} className="rounded-lg border border-steel-200 bg-white p-3">
              <JsonPreview value={row} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
