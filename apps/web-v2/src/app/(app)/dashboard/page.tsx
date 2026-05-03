"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Calendar,
  ChevronRight,
  TrendingUp,
  ArrowUpRight,
  CircleAlert,
  Target,
} from "lucide-react";
import { callTool, getUser } from "@/lib/api";
import { Badge } from "@/components/ui/shadcn/badge";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { ActivityTimeline } from "@/components/dashboard/ActivityTimeline";
import { MiniSparkBars } from "@/components/dashboard/MiniSparkBars";
import { DashboardIdentityBar } from "@/components/dashboard/DashboardIdentityBar";
import { DashboardPulseStrip } from "@/components/dashboard/DashboardPulseStrip";
import { MATEXUI_TO_WEB_V2_ROUTES } from "@/data/matexui-route-map";

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
  note: string;
  /** Full-page /chat; layout FAB opens the same Copilot panel — both entry points. */
  copilotNote?: boolean;
};

const QUICK_ACTIONS_BASE: QuickAction[] = [
  {
    label: "Create Listing",
    href: "/listings/create",
    icon: Plus,
    color: "from-orange-500 to-orange-800 text-white",
    glow: "shadow-orange-500/25",
    note: "Publish a new industrial offering with pricing and logistics details.",
  },
  {
    label: "Search Materials",
    href: "/search",
    icon: Search,
    color: "from-slate-600 to-slate-900 text-white",
    glow: "shadow-slate-900/25",
    note: "Browse verified inventory, compare offers, and source with confidence.",
  },
  {
    label: "Live Auctions",
    href: "/auctions",
    icon: Gavel,
    color: "from-amber-500 to-orange-700 text-white",
    glow: "shadow-orange-500/25",
    note: "Track active bids and act on time-sensitive market opportunities.",
  },
  {
    label: "Check Escrow",
    href: "/escrow",
    icon: Lock,
    color: "from-emerald-500 to-emerald-700 text-white",
    glow: "shadow-emerald-500/20",
    note: "Review protected funds, milestones, and transaction readiness.",
  },
  {
    label: "Logistics",
    href: "/logistics",
    icon: Truck,
    color: "from-slate-700 to-slate-950 text-white",
    glow: "shadow-slate-900/25",
    note: "Coordinate shipments, delivery progress, and operational follow-through.",
  },
  {
    label: "AI Copilot",
    href: "/chat",
    icon: Bot,
    color: "from-slate-700 to-slate-950 text-white",
    glow: "shadow-slate-900/25",
    note: "Get assistance preparing listings, replies, and platform workflows.",
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
  const sparkRaw = raw.listings_spark_7d;
  const listings_spark_7d = Array.isArray(sparkRaw)
    ? sparkRaw.map((x) => Number(x ?? 0))
    : sparkRaw === null
      ? null
      : undefined;
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
    listings_spark_7d,
    active_bids: raw.active_bids !== undefined ? Number(raw.active_bids) : undefined,
    orders_pending_action: Number(raw.orders_pending_action ?? 0),
    orders_in_transit: Number(raw.orders_in_transit ?? 0),
  };
}

function formatCAD(amount: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount);
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

function statIconShadow(gradient: string): string {
  if (gradient.includes("orange") || gradient.includes("amber")) return "shadow-orange-500/25";
  if (gradient.includes("brand")) return "shadow-brand-500/20";
  if (gradient.includes("emerald")) return "shadow-emerald-500/20";
  if (gradient.includes("accent")) return "shadow-accent-500/20";
  if (gradient.includes("steel") || gradient.includes("slate")) return "shadow-slate-900/20";
  if (gradient.includes("violet")) return "shadow-violet-500/20";
  return "shadow-slate-900/20";
}

function DashboardSkeleton() {
  const pulse = "animate-pulse rounded-lg bg-sky-200/80";
  return (
    <div className="space-y-6" data-dashboard-skeleton aria-busy="true">
      <div className={clsx("h-56 rounded-[2rem]", pulse)} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={clsx("h-36 rounded-[1.75rem] border border-sky-200/70", pulse)} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(300px,0.95fr)_minmax(0,1.45fr)]">
        <div className={clsx("h-72 rounded-[1.75rem] border border-sky-200/70", pulse)} />
        <div className={clsx("h-72 rounded-[1.75rem] border border-sky-200/70", pulse)} />
      </div>
      <div className={clsx("h-56 rounded-[1.75rem] border border-sky-200/70", pulse)} />
    </div>
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [kycLevel, setKycLevel] = useState<KycLevel>(0);
  const [bookings, setBookings] = useState<DashboardBooking[]>([]);
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<SectionKey, string>>>({});
  // Single-attempt silent retry so a transient dashboard hiccup doesn't
  // show users debug banners; after that we just render whatever data we have.
  const retriedRef = useRef(false);

  const load = useCallback(async (isRefresh: boolean, attempt = 0) => {
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
      callTool("analytics.get_dashboard_stats", { user_id: userId }),
      callTool("payments.get_wallet_balance", { user_id: userId }),
      callTool("messaging.get_unread", { user_id: userId }),
      callTool("notifications.get_notifications", { user_id: userId, limit: 8 }),
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
      setNotifications(data?.notifications?.slice(0, 8) ?? []);
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

    // Quiet auto-retry: if any section failed and we haven't retried yet,
    // try once more after a short backoff. Keep errors hidden from UI until then.
    if (Object.keys(errs).length > 0 && attempt < 2) {
      const delay = 1500 * Math.pow(2, attempt);
      window.setTimeout(() => { void load(false, attempt + 1); }, delay);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  // If any section failed, attempt one quiet retry with a small backoff. After
  // that we stop — users see data where it loaded and nothing debug-ish.
  useEffect(() => {
    if (Object.keys(sectionErrors).length === 0) return;
    if (retriedRef.current) return;
    retriedRef.current = true;
    const id = window.setTimeout(() => {
      void load(true);
    }, 2500);
    return () => window.clearTimeout(id);
  }, [sectionErrors, load]);

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
      trend?: string | null;
      footnote?: string | null;
    };
    const base: Card[] = [
      {
        label: "Active Listings",
        value: stats?.active_listings ?? "—",
        icon: Package,
        gradient: "from-orange-500 to-orange-800",
        trend: listingsTrend,
        footnote: null,
      },
      {
        label: "Wallet Balance",
        value:
          wallet && !Number.isNaN(wallet.balance) ? formatCAD(wallet.balance) : "—",
        icon: Wallet,
        gradient: "from-emerald-500 to-emerald-700",
        footnote: "Live balance",
      },
      {
        label: "Unread Messages",
        value: sectionErrors.unread ? "—" : unreadCount,
        icon: MessageSquare,
        gradient: "from-slate-600 to-slate-900",
        footnote: "Across threads",
      },
      {
        label: "Escrow Held",
        value: stats?.active_escrows ?? "—",
        subValue:
          stats && (stats.escrow_held ?? 0) > 0
            ? `${formatCAD(stats.escrow_held ?? 0)} in escrow`
            : null,
        icon: ShieldCheck,
        gradient: "from-amber-500 to-orange-700",
        footnote: null,
      },
    ];
    const bidCard: Card[] =
      accountType === "buyer" || accountType === "both"
        ? [
            {
              label: "Active Bids",
              value: stats?.active_bids ?? "—",
              icon: Target,
              gradient: "from-orange-600 to-amber-500",
              footnote: "Open bids on listings",
            },
          ]
        : [];
    return [...base, ...bidCard];
  }, [stats, wallet, unreadCount, listingsTrend, sectionErrors.unread, accountType]);


  const ordersPending = stats?.orders_pending_action ?? 0;
  const ordersTransit = stats?.orders_in_transit ?? 0;
  const showOrdersStrip = ordersPending > 0 || ordersTransit > 0;

  const walletDisplay = useMemo(() => {
    if (!wallet || Number.isNaN(wallet.balance)) return null;
    return formatCAD(wallet.balance);
  }, [wallet]);

  const escrowDisplay = useMemo(() => {
    if (!stats || (stats.escrow_held ?? 0) <= 0) return null;
    return formatCAD(stats.escrow_held ?? 0);
  }, [stats]);


  if (initialLoad) {
    return <DashboardSkeleton />;
  }

  return (
    <div
      className="dashboard-page"
      data-matex-ui-prototypes={Object.keys(MATEXUI_TO_WEB_V2_ROUTES).join(",")}
    >
      <DashboardIdentityBar />
      <DashboardPulseStrip
        stats={stats}
        walletDisplay={walletDisplay}
        escrowDisplay={escrowDisplay}
        unread={unreadCount}
        kycLevel={kycLevel}
      />

      {kycLevel < 2 && (
        <div className="dashboard-status-strip border-orange-400/40 bg-orange-500/[0.07] text-sm text-slate-900">
          <CircleAlert className="h-4 w-4 shrink-0 text-orange-700" />
          <span>
            <strong className="text-orange-900">Complete verification</strong> — Higher KYC levels unlock
            larger trades and faster payouts.
          </span>
          <Link href="/settings" className="font-semibold text-orange-800 underline-offset-2 hover:underline">
            Continue in Settings
          </Link>
        </div>
      )}

      {showOrdersStrip && (
        <div className="dashboard-status-strip text-sm">
          <span className="font-semibold text-slate-800">Open orders</span>
          {ordersPending > 0 && (
            <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-xs font-semibold text-orange-900 ring-1 ring-orange-400/30">
              {ordersPending} need action
            </span>
          )}
          {ordersTransit > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-950 ring-1 ring-amber-400/35">
              {ordersTransit} in transit
            </span>
          )}
        </div>
      )}

      {(stats?.active_auctions ?? 0) > 0 && (
        <div className="dashboard-alert">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500 shadow-lg shadow-orange-500/30">
              <Gavel className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-slate-950">
                {stats!.active_auctions} live auction{stats!.active_auctions > 1 ? "s" : ""} in progress
              </span>
              {stats?.next_auction_end && (
                <p className="text-sm text-orange-800/90">
                  Closes in{" "}
                  <CountdownTimer targetDate={stats.next_auction_end} className="inline font-bold" />
                </p>
              )}
            </div>
          </div>
          <Link
            href="/auctions"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition-all hover:bg-orange-600"
          >
            Join Now <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {stats?.listings_spark_7d && stats.listings_spark_7d.length > 0 && (
        <MiniSparkBars
          series={stats.listings_spark_7d}
          label="Listing velocity (7d, your inventory)"
          className="w-full max-w-4xl lg:max-w-5xl"
        />
      )}

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-5">
        {statCards.map((card) => (
          <div key={card.label} className="dashboard-stat-card group">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-wider text-slate-600">
                  {card.label}
                </p>
                <p className="dashboard-metric-value mt-2.5 font-extrabold text-slate-950">
                  {card.value}
                </p>
                {"subValue" in card && card.subValue && (
                  <p className="mt-0.5 text-xs font-medium text-slate-600">{card.subValue}</p>
                )}
                {card.trend != null && card.trend !== "" && (
                  <p
                    className={clsx(
                      "mt-1 flex items-center gap-0.5 text-xs font-semibold tabular-nums",
                      String(card.trend).startsWith("-") ? "text-danger-600" : "text-orange-600",
                    )}
                  >
                    <TrendingUp className="h-3 w-3" /> {card.trend} vs prior week
                  </p>
                )}
                {card.label === "Active Listings" && !card.trend && (
                  <p className="dashboard-stat-delta text-slate-500">—</p>
                )}
                {card.footnote && (
                  <p className="dashboard-stat-delta text-slate-500">{card.footnote}</p>
                )}
              </div>
              <span
                className={clsx(
                  "dashboard-stat-icon",
                  card.gradient,
                  statIconShadow(card.gradient),
                )}
              >
                <card.icon className="h-6 w-6 text-white" />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-module-grid">
        <AppSectionCard
          title="Quick Actions"
          className="overflow-hidden"
          bodyClassName="space-y-4 p-0"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                title={action.copilotNote ? "Opens full-page Copilot (FAB also available)" : undefined}
                className="dashboard-action-card"
              >
                <span
                  className={clsx(
                    "dashboard-stat-icon w-fit",
                    action.color,
                    action.glow
                  )}
                >
                  <action.icon className="h-6 w-6" />
                </span>
                <span className="dashboard-action-label">{action.label}</span>
                <span className="dashboard-action-note">{action.note}</span>
              </Link>
            ))}
          </div>
        </AppSectionCard>

        <AppSectionCard
          className="overflow-hidden"
          title="Activity feed"
          action={
            <Link
              href="/notifications"
              className="flex items-center gap-1 text-xs font-semibold text-orange-700 hover:text-orange-800"
            >
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          }
        >
          {notifications.length === 0 && bookings.length === 0 ? (
            <EmptyState
              image="/illustrations/empty-notifications.png"
              title="No recent activity"
              description="Notifications and scheduled visits will appear here as you trade."
              size="sm"
            />
          ) : (
            <ActivityTimeline
              notifications={notifications}
              bookings={bookings}
              limit={10}
              onActivateNotification={(id) => void markNotificationRead(id)}
            />
          )}
        </AppSectionCard>
      </div>

      <AppSectionCard
        title={
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Upcoming Events
          </span>
        }
        action={
          <Link
            href="/inspections"
            className="flex items-center gap-1 text-xs font-semibold text-orange-700 hover:text-orange-800"
          >
            View inspections <ChevronRight className="h-3 w-3" />
          </Link>
        }
      >
        {bookings.length === 0 ? (
          <EmptyState
            image="/illustrations/empty-bookings.png"
            title="No visits or inspections scheduled"
            description="Book on-site visits and inspections from your listings and orders."
            cta={{ label: "Go to inspections", href: "/inspections" }}
            size="md"
          />
        ) : (
          <div className="divide-y divide-slate-200/90">
            {bookings.map((b) => (
              <div
                key={b.booking_id}
                className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-800 shadow-lg shadow-orange-500/20">
                    <Calendar className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {b.title ?? b.event_type.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-slate-600">{formatEventDate(b.scheduled_at)}</p>
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
