/**
 * Dashboard / analytics shapes from MCP (`analytics.get_dashboard_stats`, etc.).
 * Trends like `listings_change_pct` must be server-sourced only — never hardcode in UI.
 */
export type DashboardStats = {
  active_listings: number;
  active_auctions: number;
  /** Count of escrows in active states */
  active_escrows?: number;
  /** Total CAD held across user escrows (when provided by analytics) */
  escrow_held?: number;
  next_auction_end?: string;
  /** Period-over-period change; render only when non-null */
  listings_change_pct?: number | null;
  /** Daily counts (Mon→Sun) for seller listing velocity; optional */
  listings_spark_7d?: number[] | null;
  /** Open bids for the authenticated user (buyer side) */
  active_bids?: number;
  orders_pending_action?: number;
  orders_in_transit?: number;
};

export type WalletBalance = {
  balance: number;
  currency: string;
};

export type DashboardNotification = {
  notification_id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  read: boolean;
  listing_id?: string;
  order_id?: string;
  escrow_id?: string;
  action_url?: string;
};

export type DashboardBooking = {
  booking_id: string;
  event_type: string;
  scheduled_at: string;
  status: string;
  title?: string;
};

export type SectionKey =
  | "stats"
  | "wallet"
  | "unread"
  | "notifications"
  | "kyc"
  | "bookings";
