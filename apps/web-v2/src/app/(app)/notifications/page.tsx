"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  Gavel,
  Shield,
  Truck,
  Package,
  AlertTriangle,
  CheckCircle2,
  Info,
  DollarSign,
  FileText,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import clsx from "clsx";
import { AppPageHeader } from "@/components/layout/AppPageHeader";
import { EmptyState as EmptyIllustration } from "@/components/ui/EmptyState";
import { callTool } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type NotificationType =
  | "bid"
  | "auction"
  | "escrow"
  | "logistics"
  | "system"
  | "payment"
  | "dispute"
  | "message"
  | "kyc"
  | "contract";

type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  data?: {
    listing_id?: string;
    order_id?: string;
    escrow_id?: string;
    shipment_id?: string;
    dispute_id?: string;
    thread_id?: string;
    auction_id?: string;
  };
};

type Tab = "all" | "unread" | "bid" | "auction" | "escrow" | "logistics" | "system";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "bid", label: "Bids" },
  { id: "auction", label: "Auctions" },
  { id: "escrow", label: "Escrow" },
  { id: "logistics", label: "Logistics" },
  { id: "system", label: "System" },
];

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------
function NotificationIcon({ type }: { type: NotificationType }) {
  const base = "flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0";
  switch (type) {
    case "bid":
      return (
        <span className={clsx(base, "bg-amber-50 text-amber-600")}>
          <Gavel size={18} />
        </span>
      );
    case "auction":
      return (
        <span className={clsx(base, "bg-purple-50 text-purple-600")}>
          <Gavel size={18} />
        </span>
      );
    case "escrow":
      return (
        <span className={clsx(base, "bg-brand-50 text-brand-600")}>
          <Shield size={18} />
        </span>
      );
    case "logistics":
      return (
        <span className={clsx(base, "bg-sky-50 text-sky-600")}>
          <Truck size={18} />
        </span>
      );
    case "payment":
      return (
        <span className={clsx(base, "bg-success-50 text-success-700")}>
          <DollarSign size={18} />
        </span>
      );
    case "dispute":
      return (
        <span className={clsx(base, "bg-danger-50 text-danger-700")}>
          <AlertTriangle size={18} />
        </span>
      );
    case "message":
      return (
        <span className={clsx(base, "bg-indigo-50 text-indigo-600")}>
          <MessageSquare size={18} />
        </span>
      );
    case "kyc":
      return (
        <span className={clsx(base, "bg-teal-50 text-teal-600")}>
          <CheckCircle2 size={18} />
        </span>
      );
    case "contract":
      return (
        <span className={clsx(base, "bg-orange-50 text-orange-600")}>
          <FileText size={18} />
        </span>
      );
    default:
      return (
        <span className={clsx(base, "bg-gray-100 text-gray-500")}>
          <Info size={18} />
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Route resolver — where to navigate on click
// ---------------------------------------------------------------------------
function resolveRoute(n: Notification): string | null {
  if (n.data?.listing_id) return `/listings/${n.data.listing_id}`;
  if (n.data?.auction_id) return `/auction/${n.data.auction_id}`;
  if (n.data?.escrow_id) return `/escrow`;
  if (n.data?.shipment_id) return `/logistics`;
  // /disputes/[id] route does not exist yet; route to messages which carries dispute threads
  if (n.data?.dispute_id) return `/messages`;
  if (n.data?.thread_id) return `/messages`;
  if (n.data?.order_id) return `/escrow`;
  if (n.type === "kyc") return `/settings`;
  if (n.type === "payment") return `/escrow`;
  if (n.type === "contract") return `/contracts`;
  return null;
}

// ---------------------------------------------------------------------------
// Single notification row
// ---------------------------------------------------------------------------
function NotificationRow({
  notification,
  onMarkRead,
  onClick,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
  onClick: (n: Notification) => void;
}) {
  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });
    } catch {
      return "";
    }
  })();

  return (
    <div
      className={clsx(
        "flex items-start gap-3 px-4 py-4 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-100 last:border-b-0",
        !notification.read && "bg-brand-50/40",
      )}
      onClick={() => {
        if (!notification.read) onMarkRead(notification.id);
        onClick(notification);
      }}
    >
      <NotificationIcon type={notification.type} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={clsx(
              "text-sm leading-snug",
              notification.read ? "font-medium text-gray-700" : "font-semibold text-gray-900",
            )}
          >
            {notification.title}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!notification.read && (
              <span className="w-2 h-2 bg-brand-500 rounded-full flex-shrink-0" />
            )}
            <span className="text-[11px] text-gray-400 whitespace-nowrap">{timeAgo}</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.body}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
function EmptyState({ tab }: { tab: Tab }) {
  const titles: Record<Tab, string> = {
    all: "No notifications yet",
    unread: "You're all caught up",
    bid: "No bid notifications",
    auction: "No auction notifications",
    escrow: "No escrow notifications",
    logistics: "No logistics notifications",
    system: "No system notifications",
  };
  return (
    <EmptyIllustration
      image="/illustrations/empty-notifications.png"
      title={titles[tab]}
      description={
        tab === "unread"
          ? "All notifications have been read."
          : "Activity from bids, escrow, logistics, and messages will show up here."
      }
      size="md"
    />
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [error, setError] = useState<string | null>(null);

  async function fetchNotifications(): Promise<void> {
    setLoading(true);
    setError(null);
    const res = await callTool("notifications.get_notifications", {});
    if (res.success) {
      const d = res.data as unknown as { notifications?: Notification[] };
      const list = Array.isArray(d?.notifications) ? d.notifications : [];
      setNotifications(list);
    } else {
      setError(res.error?.message ?? "Failed to load notifications. Please try again.");
    }
    setLoading(false);
  }

  async function markRead(id: string): Promise<void> {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    const res = await callTool("notifications.mark_read", { notification_id: id });
    if (!res.success) {
      // eslint-disable-next-line no-console
      console.warn("Could not mark notification read:", res.error?.message);
    }
  }

  async function markAllRead(): Promise<void> {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await Promise.all(
      unreadIds.map((id) => callTool("notifications.mark_read", { notification_id: id })),
    );
  }

  useEffect(() => {
    void fetchNotifications();
  }, []);

  function handleClick(n: Notification): void {
    const route = resolveRoute(n);
    if (route) router.push(route);
  }

  const filtered = notifications.filter((n) => {
    if (activeTab === "all") return true;
    if (activeTab === "unread") return !n.read;
    return n.type === activeTab;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const tabCount = (tab: Tab): number => {
    if (tab === "all") return notifications.length;
    if (tab === "unread") return unreadCount;
    return notifications.filter((n) => n.type === tab).length;
  };

  const notifDescription =
    unreadCount > 0
      ? `${unreadCount} unread · ${notifications.length} total`
      : `${notifications.length} total`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AppPageHeader
        title="Notifications"
        description={notifDescription}
        actions={
          <>
            <button
              type="button"
              onClick={() => void fetchNotifications()}
              className="rounded-xl p-2 text-steel-400 transition-colors hover:bg-steel-100 hover:text-steel-800"
              aria-label="Refresh notifications"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
              className="rounded-xl px-3 py-1.5 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50 hover:text-brand-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Mark all read
            </button>
          </>
        }
      />

      <div className="marketplace-card overflow-hidden">
      {/* Tabs */}
      <div className="mb-0 border-b border-steel-200/80">
        <div className="-mb-px flex gap-0 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => {
            const count = tabCount(tab.id);
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                  active
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={clsx(
                      "text-[11px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center",
                      active
                        ? "bg-brand-100 text-brand-700"
                        : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-b-xl border border-t-0 border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <AlertTriangle size={28} className="text-danger-500 mb-3" />
            <p className="font-medium text-gray-700 text-sm">{error}</p>
            <button
              onClick={() => void fetchNotifications()}
              className="mt-3 text-sm text-brand-600 hover:underline font-medium"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <div>
            {/* Group header for unread */}
            {activeTab === "all" && unreadCount > 0 && (
              <>
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Unread
                  </span>
                </div>
                {filtered
                  .filter((n) => !n.read)
                  .map((n) => (
                    <NotificationRow
                      key={n.id}
                      notification={n}
                      onMarkRead={(id) => void markRead(id)}
                      onClick={handleClick}
                    />
                  ))}
                {filtered.filter((n) => n.read).length > 0 && (
                  <div className="px-4 py-2 bg-gray-50 border-y border-gray-100">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Earlier
                    </span>
                  </div>
                )}
                {filtered
                  .filter((n) => n.read)
                  .map((n) => (
                    <NotificationRow
                      key={n.id}
                      notification={n}
                      onMarkRead={(id) => void markRead(id)}
                      onClick={handleClick}
                    />
                  ))}
              </>
            )}
            {(activeTab !== "all" || unreadCount === 0) &&
              filtered.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onMarkRead={(id) => void markRead(id)}
                  onClick={handleClick}
                />
              ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
