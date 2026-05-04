"use client";

import Link from "next/link";
import clsx from "clsx";
import { Calendar, Bell } from "lucide-react";
import type { DashboardBooking, DashboardNotification } from "@/types/dashboard";

export type ActivityItem =
  | { kind: "notification"; id: string; at: string; title: string; subtitle: string; href: string | null; unread: boolean }
  | { kind: "booking"; id: string; at: string; title: string; subtitle: string };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatShort(iso: string, kind: "notification" | "booking"): string {
  if (kind === "booking") return formatEventDate(iso);
  const t = new Date(iso).getTime();
  if (t > Date.now()) return formatEventDate(iso);
  return timeAgo(iso);
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

function notificationHref(n: DashboardNotification): string | null {
  if (n.action_url) return n.action_url;
  if (n.listing_id) return `/listings/${n.listing_id}`;
  if (n.escrow_id) return `/escrow`;
  if (n.order_id) return `/checkout`;
  return null;
}

function mergeActivity(
  notifications: DashboardNotification[],
  bookings: DashboardBooking[],
  limit: number,
): ActivityItem[] {
  const fromN: ActivityItem[] = notifications.map((n) => ({
    kind: "notification" as const,
    id: n.notification_id,
    at: n.created_at,
    title: n.title,
    subtitle: n.message,
    href: notificationHref(n),
    unread: !n.read,
  }));
  const fromB: ActivityItem[] = bookings.map((b) => ({
    kind: "booking" as const,
    id: b.booking_id,
    at: b.scheduled_at,
    title: b.title ?? b.event_type.replace(/_/g, " "),
    subtitle: `Status: ${b.status}`,
  }));
  return [...fromN, ...fromB]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

type ActivityTimelineProps = {
  notifications: DashboardNotification[];
  bookings: DashboardBooking[];
  limit?: number;
  onActivateNotification?: (id: string) => void;
};

/**
 * MatexUI-style merged feed: notifications + upcoming bookings, newest first.
 */
export function ActivityTimeline({
  notifications,
  bookings,
  limit = 8,
  onActivateNotification,
}: ActivityTimelineProps) {
  const items = mergeActivity(notifications, bookings, limit);

  if (items.length === 0) return null;

  return (
    <ol className="relative space-y-0 border-l-2 border-sky-300/80 pl-5">
      {items.map((item) => {
        const dot =
          item.kind === "notification"
            ? item.unread
              ? "bg-orange-500 ring-2 ring-orange-200"
              : "bg-orange-400"
            : "bg-sky-500";

        const inner = (
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <span className="mt-0.5 shrink-0 text-sky-500" aria-hidden>
                {item.kind === "notification" ? <Bell className="h-3.5 w-3.5" /> : <Calendar className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-sky-950">{item.title}</p>
                <p className="mt-0.5 truncate text-xs text-sky-700">{item.subtitle}</p>
              </div>
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-sky-600">
              {formatShort(item.at, item.kind)}
            </span>
          </div>
        );

        if (item.kind === "notification" && item.href) {
          return (
            <li key={`n-${item.id}`} className="relative pb-5 last:pb-0">
              <span
                className={clsx("absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white", dot)}
              />
              <Link
                href={item.href}
                onClick={() => onActivateNotification?.(item.id)}
                className="block rounded-2xl border border-transparent px-3 py-3 outline-none ring-orange-500/25 transition-colors hover:border-sky-200 hover:bg-sky-50/90 focus-visible:ring-2"
              >
                {inner}
              </Link>
            </li>
          );
        }

        if (item.kind === "notification") {
          return (
            <li key={`n-${item.id}`} className="relative pb-5 last:pb-0">
              <span
                className={clsx("absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white", dot)}
              />
              <button
                type="button"
                onClick={() => onActivateNotification?.(item.id)}
                className="w-full rounded-2xl border border-transparent px-3 py-3 text-left outline-none ring-orange-500/25 transition-colors hover:border-sky-200 hover:bg-sky-50/90 focus-visible:ring-2"
              >
                {inner}
              </button>
            </li>
          );
        }

        return (
          <li key={`b-${item.id}`} className="relative pb-5 last:pb-0">
            <span
              className={clsx("absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white", dot)}
            />
            <div className="rounded-2xl border border-transparent px-3 py-3">{inner}</div>
          </li>
        );
      })}
    </ol>
  );
}
