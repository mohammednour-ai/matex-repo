"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Package,
  Wallet,
  MessageSquare,
  ShieldCheck,
  Plus,
  Search,
  Gavel,
  Lock,
  Truck,
  Bot,
  Bell,
  Calendar,
  ChevronRight,
  TrendingUp,
  Recycle,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import { callTool, getUser } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import type {
  DashboardBooking,
  DashboardNotification,
  DashboardStats,
  SectionKey,
  WalletBalance,
} from "@/types/dashboard";
import clsx from "clsx";
import { AppSectionCard } from "@/components/layout/AppSectionCard";

type KycLevel = 0 | 1 | 2 | 3;

const KYC_LABELS: Record<
  KycLevel,
  { label: string; variant: "success" | "warning" | "danger" | "info" | "gray" }
> = {
  0: { label: "Unverified", variant: "danger" },
  1: { label: "KYC Level 1", variant: "warning" },
  2: { label: "KYC Level 2", variant: "info" },
  3: { label: "KYC Level 3 — Corporate", variant: "success" },
};

type QuickAction = {
  label: string;
  href: string;
  icon: typeof Plus;
  color: string;
  glow: string;
  /** Full-page /chat; layout FAB opens the same Copilot panel — both entry points. */
  copilotNote?: boolean;
};

const QUICK_ACTIONS_BASE: QuickAction[] = [
  {
    label: "Create Listing",
    href: "/listings/create",
    icon: Plus,
    color: "from-brand-500 to-brand-700 text-white",
    glow: "shadow-brand-500/20",
  },
  {
    label: "Search Materials",
    href: "/search",
    icon: Search,
    color: "from-steel-600 to-steel-800 text-white",
    glow: "shadow-steel-500/20",
  },
  {
    label: "Live Auctions",
    href: "/auction",
    icon: Gavel,
    color: "from-accent-500 to-accent-700 text-white",
    glow: "shadow-accent-500/20",
  },
  {
    label: "Check Escrow",
    href: "/escrow",
    icon: Lock,
    color: "from-emerald-500 to-emerald-700 text-white",
    glow: "shadow-emerald-500/20",
  },
  {
    label: "Logistics",
    href: "/logistics",
    icon: Truck,
    color: "from-violet-500 to-violet-700 text-white",
    glow: "shadow-violet-500/20",
  },
  {
    label: "AI Copilot",
    href: "/chat",
    icon: Bot,
    color: "from-steel-600 to-steel-800 text-white",
    glow: "shadow-steel-500/20",
    copilotNote: true,
  },
];

function orderQuickActions(accountType: string | undefined): QuickAction[] {
  const rest = (labels: string[]) =>
    labels
      .map((l) => QUICK_ACTIONS_BASE.find((a) => a.label === l))
      .filter((a): a is QuickAction => Boolean(a));
  if (accountType === "buyer") {
    return rest([
      "Search Materials",
      "Live Auctions",
      "Check Escrow",
      "Create Listing",
      "Logistics",
      "AI Copilot",
    ]);
  }
  if (accountType === "seller") {
    return rest([
      "Create Listing",
      "Search Materials",
      "Live Auctions",
      "Check Escrow",
      "Logistics",
      "AI Copilot",
    ]);
  }
  return [...QUICK_ACTIONS_BASE];
}

function normalizeStats(raw: Record<string, unknown> | null | undefined): DashboardStats | null {
  if (!raw || typeof raw !== "object") return null;
  const escrowCad = Number(raw.escrow_held ?? raw.total_escrow_held ?? 0);
  return {
    active_listings: Number(raw.active_listings ?? 0),
    active_auctions: Number(raw.active_auctions ?? 0),
    active_escrows: Number(raw.active_escrows ?? 0),
    escrow_held: escrowCad,
    next_auction_end: raw.next_auction_end ? String(raw.next_auction_end) : undefined,
    listings_change_pct:
      raw.listings_change_pct === null || raw.listings_change_pct === undefined
        ? null
        : Number(raw.listings_change_pct),
    orders_pending_action: Number(raw.orders_pending_action ?? 0),
    orders_in_transit: Number(raw.orders_in_transit ?? 0),
  };
}

function formatCAD(amount: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function notificationHref(n: DashboardNotification): string | null {
  if (n.action_url) return n.action_url;
  if (n.listing_id) return `/listings/${n.listing_id}`;
  if (n.escrow_id) return `/escrow`;
  if (n.order_id) return `/checkout`;
  return null;
}

function statIconShadow(gradient: string): string {
  if (gradient.includes("brand")) return "shadow-brand-500/20";
  if (gradient.includes("emerald")) return "shadow-emerald-500/20";
  if (gradient.includes("accent")) return "shadow-accent-500/20";
  if (gradient.includes("steel")) return "shadow-steel-500/20";
  if (gradient.includes("violet")) return "shadow-violet-500/20";
  return "shadow-steel-500/20";
}

function DashboardSkeleton() {
  const pulse = "animate-pulse rounded-lg bg-steel-200/80";
  return (
    <div className="space-y-6" data-dashboard-skeleton aria-busy="true">
      <div className={clsx("h-36 rounded-2xl", pulse)} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={clsx("h-28 rounded-xl border border-steel-100", pulse)} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className={clsx("h-64 rounded-xl border border-steel-100 lg:col-span-1", pulse)} />
        <div className={clsx("h-64 rounded-xl border border-steel-100 lg:col-span-2", pulse)} />
      </div>
      <div className={clsx("h-40 rounded-xl border border-steel-100", pulse)} />
    </div>
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [kycLevel, setKycLevel] = useState<KycLevel>(0);
  const [bookings, setBookings] = useState<DashboardBooking[]>([]);
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<SectionKey, string>>>({});

  const load = useCallback(async (isRefresh: boolean) => {
    const currentUser = getUser();
    setUser(currentUser);
    const token = typeof window !== "undefined" ? localStorage.getItem("matex_token") : null;
    if (!token || !currentUser) {
      setInitialLoad(false);
      return;
    }
    if (isRefresh) setRefreshing(true);

    const userId = currentUser.userId ?? "";
    const errs: Partial<Record<SectionKey, string>> = {};

    const [statsRes, walletRes, unreadRes, notifRes, kycRes, bookingsRes] = await Promise.allSettled([
      callTool("analytics.get_dashboard_stats", {}),
      callTool("payments.get_wallet_balance", { user_id: userId }),
      callTool("messaging.get_unread", { user_id: userId }),
      callTool("notifications.get_notifications", { user_id: userId, limit: 5 }),
      callTool("kyc.get_kyc_level", { user_id: userId }),
      callTool("booking.list_user_bookings", { user_id: userId, upcoming: true, limit: 3 }),
    ]);

    if (statsRes.status === "fulfilled" && statsRes.value.success) {
      setStats(normalizeStats(statsRes.value.data as Record<string, unknown>));
    } else {
      setStats(null);
      errs.stats =
        statsRes.status === "rejected"
          ? "Could not load dashboard stats."
          : "Could not load dashboard stats.";
    }

    if (walletRes.status === "fulfilled" && walletRes.value.success) {
      const wUp = (walletRes.value.data?.upstream_response as Record<string, unknown> | undefined)
        ?.data as Record<string, unknown> | undefined;
      const wData = wUp ?? walletRes.value.data ?? {};
      const walletObj = (wData.wallet ?? wData) as Record<string, unknown>;
      setWallet({
        balance: Number(walletObj.balance ?? 0),
        currency: String(walletObj.currency ?? "CAD"),
      });
    } else {
      setWallet(null);
      errs.wallet = "Could not load wallet balance.";
    }

    if (unreadRes.status === "fulfilled" && unreadRes.value.success) {
      const data = unreadRes.value.data as unknown as {
        count?: number;
        total_unread?: number;
        threads?: unknown[];
      };
      setUnreadCount(
        data?.count ?? data?.total_unread ?? data?.threads?.length ?? 0
      );
    } else {
      setUnreadCount(0);
      errs.unread = "Could not load unread count.";
    }

    if (notifRes.status === "fulfilled" && notifRes.value.success) {
      const data = notifRes.value.data as unknown as { notifications?: DashboardNotification[] };
      setNotifications(data?.notifications?.slice(0, 5) ?? []);
    } else {
      setNotifications([]);
      errs.notifications = "Could not load notifications.";
    }

    if (kycRes.status === "fulfilled" && kycRes.value.success) {
      const data = kycRes.value.data as unknown as { current_level?: number | string };
      const lvl =
        typeof data?.current_level === "string"
          ? parseInt(data.current_level.replace(/\D/g, ""), 10) || 0
          : (data?.current_level ?? 0);
      setKycLevel(lvl as KycLevel);
    } else {
      errs.kyc = "Could not load KYC status.";
    }

    if (bookingsRes.status === "fulfilled" && bookingsRes.value.success) {
      const data = bookingsRes.value.data as unknown as { bookings?: DashboardBooking[] };
      setBookings(data?.bookings?.slice(0, 3) ?? []);
    } else {
      setBookings([]);
      errs.bookings = "Could not load upcoming events.";
    }

    setSectionErrors(errs);
    setRefreshing(false);
    setInitialLoad(false);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const markNotificationRead = useCallback(async (notificationId: string) => {
    const currentUser = getUser();
    if (!currentUser?.userId) return;
    await callTool("notifications.mark_read", {
      notification_id: notificationId,
      user_id: currentUser.userId,
    });
    setNotifications((prev) =>
      prev.map((n) => (n.notification_id === notificationId ? { ...n, read: true } : n))
    );
  }, []);

  const kycBadge = KYC_LABELS[kycLevel];
  const accountType = user?.accountType;
  const quickActions = useMemo(() => orderQuickActions(accountType), [accountType]);

  const listingsTrend =
    stats?.listings_change_pct != null && !Number.isNaN(stats.listings_change_pct)
      ? `${stats.listings_change_pct > 0 ? "+" : ""}${stats.listings_change_pct}%`
      : null;

  const statCards = useMemo(() => {
    type Card = {
      label: string;
      value: string | number;
      subValue?: string | null;
      icon: typeof Package;
      gradient: string;
      errorKey?: SectionKey;
    };
    const cards: Card[] = [
      {
        label: "Active Listings",
        value: stats?.active_listings ?? "—",
        icon: Package,
        gradient: "from-brand-500 to-brand-700",
        errorKey: "stats",
      },
      {
        label: "Wallet Balance",
        value:
          wallet && !Number.isNaN(wallet.balance) ? formatCAD(wallet.balance) : "—",
        icon: Wallet,
        gradient: "from-emerald-500 to-emerald-700",
        errorKey: "wallet",
      },
      {
        label: "Unread Messages",
        value: sectionErrors.unread ? "—" : unreadCount,
        icon: MessageSquare,
        gradient: "from-brand-500 to-brand-700",
        errorKey: "unread",
      },
      {
        label: "Escrow Held",
        value: stats?.active_escrows ?? "—",
        subValue:
          stats && (stats.escrow_held ?? 0) > 0
            ? `${formatCAD(stats.escrow_held ?? 0)} in escrow`
            : null,
        icon: ShieldCheck,
        gradient: "from-accent-500 to-accent-700",
      },
    ];
    return cards.map((c) => ({
      ...c,
      trend: c.label === "Active Listings" ? listingsTrend : null,
    }));
  }, [stats, wallet, unreadCount, listingsTrend, sectionErrors.unread]);

  const heroSubtitle =
    accountType === "buyer"
      ? "Your buying hub — search, bid, and buy with confidence."
      : accountType === "seller"
        ? "Your seller workspace — listings, escrow, and logistics in one place."
        : "Your marketplace overview";

  const ordersPending = stats?.orders_pending_action ?? 0;
  const ordersTransit = stats?.orders_in_transit ?? 0;
  const showOrdersStrip = ordersPending > 0 || ordersTransit > 0;

  if (initialLoad) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Hero greeting bar */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-steel-950 via-steel-900 to-steel-950 p-6 shadow-xl shadow-steel-950/20 sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          aria-hidden
        >
          <div className="metal-texture absolute inset-0" />
        </div>
        <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-brand-500/5 blur-[80px]" />
        <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-accent-500/5 blur-[60px]" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-steel-400">{getGreeting()},</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-white sm:text-3xl">
              {user?.email?.split("@")[0] ?? "Welcome back"}
            </h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-steel-400">
              <Recycle className="h-3.5 w-3.5" />
              {heroSubtitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw className={clsx("h-4 w-4", refreshing && "animate-spin")} />
              Refresh
            </button>
            <Badge variant={kycBadge.variant} className="px-3 py-1.5 text-sm">
              {kycBadge.label}
            </Badge>
            {accountType === "buyer" ? (
              <Link
                href="/search"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-700 hover:shadow-brand-500/30"
              >
                <Search className="h-4 w-4" />
                Search materials
              </Link>
            ) : accountType === "seller" ? (
              <Link
                href="/listings/create"
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-700 hover:shadow-brand-500/30"
              >
                <Plus className="h-4 w-4" />
                New listing
              </Link>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/search"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/15"
                >
                  <Search className="h-4 w-4" />
                  Search
                </Link>
                <Link
                  href="/listings/create"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition-all hover:bg-brand-700"
                >
                  <Plus className="h-4 w-4" />
                  New listing
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {kycLevel < 2 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/80 px-4 py-3 text-sm text-steel-800">
          <strong className="text-brand-800">Complete verification</strong> — Higher KYC levels unlock
          larger trades and faster payouts.{" "}
          <Link href="/settings" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
            Continue in Settings
          </Link>
        </div>
      )}

      {showOrdersStrip && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-steel-200 bg-white px-4 py-3 text-sm shadow-card">
          <span className="font-semibold text-steel-700">Open orders</span>
          {ordersPending > 0 && (
            <span className="rounded-full bg-warning-100 px-2.5 py-0.5 text-xs font-semibold text-warning-800">
              {ordersPending} need action
            </span>
          )}
          {ordersTransit > 0 && (
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
              {ordersTransit} in transit
            </span>
          )}
        </div>
      )}

      {/* Live Auction Alert */}
      {(stats?.active_auctions ?? 0) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-accent-300/80 bg-gradient-to-r from-accent-50 to-accent-100/50 px-5 py-4 shadow-md shadow-accent-500/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-500 shadow-lg shadow-accent-500/20">
              <Gavel className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-accent-900">
                {stats!.active_auctions} live auction{stats!.active_auctions > 1 ? "s" : ""} in progress
              </span>
              {stats?.next_auction_end && (
                <p className="text-sm text-accent-600">
                  Closes in{" "}
                  <CountdownTimer targetDate={stats.next_auction_end} className="inline font-bold" />
                </p>
              )}
            </div>
          </div>
          <Link
            href="/auction"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-accent-500/20 transition-all hover:bg-accent-600"
          >
            Join Now <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {Object.keys(sectionErrors).length > 0 && (
        <p className="text-xs text-danger-600">
          Some sections could not be refreshed.{" "}
          {sectionErrors.stats && "Stats "}
          {sectionErrors.wallet && "Wallet "}
          {sectionErrors.unread && "Messages "}
          {sectionErrors.notifications && "Notifications "}
          {sectionErrors.kyc && "KYC "}
          {sectionErrors.bookings && "Events "}
          — try Refresh.
        </p>
      )}

      {/* Stat Cards — trends only when server sends listings_change_pct */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="group marketplace-card p-5 transition-all hover:shadow-card-hover"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-steel-500">
                  {card.label}
                </p>
                <p className="mt-2 text-2xl font-extrabold text-steel-900">{card.value}</p>
                {"subValue" in card && card.subValue && (
                  <p className="mt-0.5 text-xs font-medium text-steel-500">{card.subValue}</p>
                )}
                {card.trend && (
                  <p className="mt-1 flex items-center gap-0.5 text-xs font-semibold text-brand-600">
                    <TrendingUp className="h-3 w-3" /> {card.trend}
                  </p>
                )}
                {card.errorKey && sectionErrors[card.errorKey] && (
                  <p className="mt-1 text-xs text-danger-600">{sectionErrors[card.errorKey]}</p>
                )}
              </div>
              <span
                className={clsx(
                  "rounded-xl bg-gradient-to-br p-3 shadow-lg transition-transform group-hover:scale-105",
                  card.gradient,
                  statIconShadow(card.gradient)
                )}
              >
                <card.icon className="h-5 w-5 text-white" />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AppSectionCard title="Quick Actions" className="lg:col-span-1" bodyClassName="p-0">
          <div className="grid grid-cols-2 gap-2.5">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                title={action.copilotNote ? "Opens full-page Copilot (FAB also available)" : undefined}
                className="group flex flex-col items-center gap-2.5 rounded-xl border border-steel-100/90 bg-surface-50/50 p-4 text-center transition-all hover:border-steel-200 hover:shadow-card"
              >
                <span
                  className={clsx(
                    "rounded-xl bg-gradient-to-br p-2.5 shadow-lg transition-transform group-hover:scale-105",
                    action.color,
                    action.glow
                  )}
                >
                  <action.icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold text-steel-600 group-hover:text-steel-800">
                  {action.label}
                </span>
              </Link>
            ))}
          </div>
        </AppSectionCard>

        <AppSectionCard
          className="lg:col-span-2"
          title="Recent Activity"
          action={
            <Link
              href="/notifications"
              className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          }
        >
          {sectionErrors.notifications && (
            <p className="mb-2 text-xs text-danger-600">{sectionErrors.notifications}</p>
          )}
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-steel-400">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-steel-100">
                <Bell className="h-6 w-6 text-steel-300" />
              </div>
              <p className="text-sm font-medium">No recent notifications</p>
              <p className="text-xs text-steel-400">Activity will show up here as you trade</p>
            </div>
          ) : (
            <ol className="relative space-y-0 border-l-2 border-steel-100 pl-5">
              {notifications.map((n) => {
                const href = notificationHref(n);
                const onActivate = () => {
                  if (!n.read) void markNotificationRead(n.notification_id);
                };
                const inner = (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-steel-800">{n.title}</p>
                      <p className="mt-0.5 truncate text-xs text-steel-500">{n.message}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-steel-400">
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                );
                if (href) {
                  return (
                    <li key={n.notification_id} className="relative pb-5 last:pb-0">
                      <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full border-2 border-white bg-brand-500" />
                      <Link
                        href={href}
                        onClick={onActivate}
                        className="block rounded-md py-0.5 outline-none ring-brand-500/30 hover:bg-steel-50 focus-visible:ring-2"
                      >
                        {inner}
                      </Link>
                    </li>
                  );
                }
                return (
                  <li key={n.notification_id} className="relative pb-5 last:pb-0">
                    <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full border-2 border-white bg-brand-500" />
                    <button
                      type="button"
                      onClick={onActivate}
                      className="w-full rounded-md py-0.5 text-left outline-none ring-brand-500/30 hover:bg-steel-50 focus-visible:ring-2"
                    >
                      {inner}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </AppSectionCard>
      </div>

      {/* Upcoming Events — always visible; empty state links to inspections */}
      <AppSectionCard
        title={
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Upcoming Events
          </span>
        }
        action={
          <Link
            href="/inspection"
            className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            View inspections <ChevronRight className="h-3 w-3" />
          </Link>
        }
      >
        {sectionErrors.bookings && (
          <p className="mb-2 text-xs text-danger-600">{sectionErrors.bookings}</p>
        )}
        {bookings.length === 0 ? (
          <div className="py-8 text-center text-sm text-steel-500">
            <p className="font-medium text-steel-700">No visits or inspections scheduled</p>
            <p className="mt-1 text-xs text-steel-500">
              Book on-site visits and inspections from your listings and orders.
            </p>
            <Link
              href="/inspection"
              className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              Go to Inspections <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-steel-100">
            {bookings.map((b) => (
              <div
                key={b.booking_id}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/15">
                    <Calendar className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-steel-800">
                      {b.title ?? b.event_type.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-steel-500">{formatEventDate(b.scheduled_at)}</p>
                  </div>
                </div>
                <Badge variant={b.status === "confirmed" ? "success" : "warning"}>{b.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </AppSectionCard>
    </div>
  );
}
