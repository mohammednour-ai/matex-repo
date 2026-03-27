"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { callTool, getUser } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { CountdownTimer } from "@/components/ui/CountdownTimer";

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

type DashboardStats = {
  active_listings: number;
  active_auctions: number;
  active_escrows: number;
  next_auction_end?: string;
};

type WalletBalance = {
  balance: number;
  currency: string;
};

type Notification = {
  notification_id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  read: boolean;
};

type Booking = {
  booking_id: string;
  event_type: string;
  scheduled_at: string;
  status: string;
  title?: string;
};

const QUICK_ACTIONS = [
  {
    label: "Create Listing",
    href: "/listings/create",
    icon: Plus,
    color: "text-brand-600 bg-brand-50",
  },
  {
    label: "Search Materials",
    href: "/search",
    icon: Search,
    color: "text-slate-600 bg-slate-50",
  },
  {
    label: "Live Auctions",
    href: "/auction",
    icon: Gavel,
    color: "text-amber-600 bg-amber-50",
  },
  {
    label: "Check Escrow",
    href: "/escrow",
    icon: Lock,
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    label: "Logistics",
    href: "/logistics",
    icon: Truck,
    color: "text-purple-600 bg-purple-50",
  },
  { label: "AI Copilot", href: "/chat", icon: Bot, color: "text-blue-600 bg-blue-50" },
];

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

export default function DashboardPage() {
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [kycLevel, setKycLevel] = useState<KycLevel>(0);
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    setUser(getUser());

    async function load(): Promise<void> {
      setLoading(true);
      const [statsRes, walletRes, unreadRes, notifRes, kycRes, bookingsRes] =
        await Promise.allSettled([
          callTool("analytics.get_dashboard_stats", {}),
          callTool("payments.get_wallet_balance", {}),
          callTool("messaging.get_unread", {}),
          callTool("notifications.get_notifications", { limit: 5 }),
          callTool("kyc.get_kyc_level", {}),
          callTool("booking.list_user_bookings", { upcoming: true, limit: 3 }),
        ]);

      if (statsRes.status === "fulfilled" && statsRes.value.success) {
        setStats(statsRes.value.data as unknown as DashboardStats);
      }
      if (walletRes.status === "fulfilled" && walletRes.value.success) {
        setWallet(walletRes.value.data as unknown as WalletBalance);
      }
      if (unreadRes.status === "fulfilled" && unreadRes.value.success) {
        const data = unreadRes.value.data as unknown as {
          count?: number;
          threads?: unknown[];
        };
        setUnreadCount(data?.count ?? data?.threads?.length ?? 0);
      }
      if (notifRes.status === "fulfilled" && notifRes.value.success) {
        const data = notifRes.value.data as unknown as { notifications?: Notification[] };
        setNotifications(data?.notifications?.slice(0, 5) ?? []);
      }
      if (kycRes.status === "fulfilled" && kycRes.value.success) {
        const data = kycRes.value.data as unknown as { current_level?: number };
        setKycLevel((data?.current_level ?? 0) as KycLevel);
      }
      if (bookingsRes.status === "fulfilled" && bookingsRes.value.success) {
        const data = bookingsRes.value.data as unknown as { bookings?: Booking[] };
        setBookings(data?.bookings?.slice(0, 3) ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

  const kycBadge = KYC_LABELS[kycLevel];

  const statCards = [
    {
      label: "Active Listings",
      value: stats?.active_listings ?? "—",
      icon: Package,
      iconColor: "text-brand-600 bg-brand-50",
      borderColor: "border-brand-100",
    },
    {
      label: "Wallet Balance",
      value: wallet ? formatCAD(wallet.balance) : "—",
      icon: Wallet,
      iconColor: "text-emerald-600 bg-emerald-50",
      borderColor: "border-emerald-100",
    },
    {
      label: "Unread Messages",
      value: unreadCount,
      icon: MessageSquare,
      iconColor: "text-blue-600 bg-blue-50",
      borderColor: "border-blue-100",
    },
    {
      label: "Active Escrows",
      value: stats?.active_escrows ?? "—",
      icon: ShieldCheck,
      iconColor: "text-amber-600 bg-amber-50",
      borderColor: "border-amber-100",
    },
  ];

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner className="w-8 h-8 text-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Greeting + KYC badge */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{getGreeting()},</p>
          <h1 className="text-2xl font-bold text-slate-900">
            {user?.email ?? "Welcome back"}
          </h1>
        </div>
        <Badge variant={kycBadge.variant} className="px-3 py-1 text-sm">
          {kycBadge.label}
        </Badge>
      </div>

      {/* Live Auction Alert */}
      {(stats?.active_auctions ?? 0) > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 gap-4">
          <div className="flex items-center gap-3">
            <Gavel className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-amber-800">
                {stats!.active_auctions} live auction
                {stats!.active_auctions > 1 ? "s" : ""} in progress
              </span>
              {stats?.next_auction_end && (
                <span className="text-sm text-amber-600">
                  — closes in{" "}
                  <CountdownTimer
                    targetDate={stats.next_auction_end}
                    className="inline"
                  />
                </span>
              )}
            </div>
          </div>
          <Link
            href="/auction"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors"
          >
            Join Now <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl border bg-white p-5 shadow-sm ${card.borderColor}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-500">{card.label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{card.value}</p>
              </div>
              <span className={`rounded-lg p-2.5 ${card.iconColor}`}>
                <card.icon className="h-5 w-5" />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="group flex flex-col items-center gap-2 rounded-xl border border-slate-100 p-3.5 text-center transition-colors hover:border-brand-200 hover:bg-brand-50/40"
              >
                <span className={`rounded-lg p-2 ${action.color}`}>
                  <action.icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-medium text-slate-600 group-hover:text-brand-700">
                  {action.label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Recent Activity
            </h2>
            <Link href="/notifications" className="text-xs text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
              <Bell className="h-8 w-8 opacity-40" />
              <p className="text-sm">No recent notifications</p>
            </div>
          ) : (
            <ol className="relative space-y-0 border-l border-slate-100 pl-5">
              {notifications.map((n) => (
                <li key={n.notification_id} className="pb-4 last:pb-0">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-400" />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {n.title}
                      </p>
                      <p className="truncate text-xs text-slate-500">{n.message}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Upcoming Events */}
      {bookings.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Calendar className="h-4 w-4" />
              Upcoming Events
            </h2>
            <Link href="/booking" className="text-xs text-brand-600 hover:underline">
              View calendar
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {bookings.map((b) => (
              <div
                key={b.booking_id}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">
                      {b.title ?? b.event_type.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-slate-500">{formatEventDate(b.scheduled_at)}</p>
                  </div>
                </div>
                <Badge variant={b.status === "confirmed" ? "success" : "warning"}>
                  {b.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
