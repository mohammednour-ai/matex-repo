/**
 * MATEX MCP Gateway (Phase 0 foundation implementation)
 *
 * Responsibilities:
 * - JWT authentication
 * - Basic per-user and per-IP rate limiting
 * - Tool routing map by MCP namespace
 * - Event bus publication (Redis Streams)
 * - Health endpoint for CI/CD checks
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import * as jwt from "jsonwebtoken";
import Redis from "ioredis";
import { now, sha256 } from "@matex/utils";
import { randomUUID } from "node:crypto";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

interface GatewayRequestBody {
  tool: string;
  args?: Record<string, JsonValue>;
}

interface AuthClaims extends jwt.JwtPayload {
  sub: string;
  role?: string;
  email?: string;
}

interface ToolResult {
  success: boolean;
  data?: Record<string, JsonValue>;
  error?: { code: string; message: string };
}

/** Railway / Render set `PORT`. Empty string must not become 0 (listen would break routing). */
function listenPort(): number {
  const raw = (process.env.PORT || process.env.MCP_GATEWAY_PORT || "").trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 3001;
}
const PORT = listenPort();
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const JWT_ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_TOKEN_EXPIRY ?? "15m";
const JWT_REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_TOKEN_EXPIRY ?? "7d";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.GATEWAY_RATE_LIMIT_MAX ?? 120);
const EVENT_STREAM = process.env.GATEWAY_EVENT_STREAM ?? "matex.events";
const FORWARD_TIMEOUT_MS = Number(process.env.GATEWAY_FORWARD_TIMEOUT_MS ?? 10_000);

/** ioredis needs `redis://` or `rediss://`, not Upstash HTTPS REST URLs. */
function createRedisClient(): Redis | null {
  for (const key of ["REDIS_URL", "UPSTASH_REDIS_URL"] as const) {
    const raw = process.env[key]?.trim();
    if (raw && (raw.startsWith("redis://") || raw.startsWith("rediss://"))) {
      return new Redis(raw);
    }
  }
  return null;
}

const redis = createRedisClient();
const requestLog = new Map<string, number[]>();
const domainEndpoints = parseDomainEndpoints(process.env.MCP_DOMAIN_ENDPOINTS_JSON);

// Domain -> MCP server package mapping (expand as servers go live)
const ROUTE_MAP: Record<string, string> = {
  auth: "@matex/auth-mcp",
  profile: "@matex/profile-mcp",
  kyc: "@matex/kyc-mcp",
  listing: "@matex/listing-mcp",
  search: "@matex/search-mcp",
  messaging: "@matex/messaging-mcp",
  payments: "@matex/payments-mcp",
  escrow: "@matex/escrow-mcp",
  bidding: "@matex/bidding-mcp",
  auction: "@matex/auction-mcp",
  inspection: "@matex/inspection-mcp",
  booking: "@matex/booking-mcp",
  contracts: "@matex/contracts-mcp",
  dispute: "@matex/dispute-mcp",
  logistics: "@matex/logistics-mcp",
  tax: "@matex/tax-mcp",
  notifications: "@matex/notifications-mcp",
  esign: "@matex/esign-mcp",
  pricing: "@matex/pricing-mcp",
  analytics: "@matex/analytics-mcp",
  admin: "@matex/admin-mcp",
  storage: "@matex/storage-mcp",
  log: "@matex/log-mcp",
  credit: "@matex/credit-mcp",
};

function expiryToSeconds(value: string, fallbackSeconds: number): number {
  const raw = value.trim();
  const pureNum = Number(raw);
  if (Number.isFinite(pureNum) && pureNum > 0) return Math.floor(pureNum);
  const m = raw.match(/^(\d+)([smhd])$/i);
  if (!m) return fallbackSeconds;
  const amount = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "s") return amount;
  if (unit === "m") return amount * 60;
  if (unit === "h") return amount * 3600;
  if (unit === "d") return amount * 86400;
  return fallbackSeconds;
}

const ACCESS_EXP_SECONDS = expiryToSeconds(JWT_ACCESS_TOKEN_EXPIRY, 900);

function parseDomainEndpoints(raw?: string): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed)
      .filter(([, value]) => typeof value === "string" && value.length > 0)
      .map(([key, value]) => [key, String(value)]);
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: IncomingMessage): Promise<GatewayRequestBody | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as GatewayRequestBody;
  } catch {
    return null;
  }
}

function validateJwt(req: IncomingMessage): AuthClaims | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  try {
    const claims = jwt.verify(token, JWT_SECRET) as AuthClaims;
    return claims;
  } catch {
    return null;
  }
}

function applyRateLimit(key: string): boolean {
  const currentTime = Date.now();
  const bucket = requestLog.get(key) ?? [];
  const recent = bucket.filter((ts) => currentTime - ts < RATE_LIMIT_WINDOW_MS);
  recent.push(currentTime);
  requestLog.set(key, recent);
  return recent.length <= RATE_LIMIT_MAX;
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

function isPublicTool(tool: string): boolean {
  return [
    "auth.register",
    "auth.login",
    "auth.request_email_otp",
    "auth.request_phone_otp",
    "auth.verify_email",
    "auth.verify_phone",
    "auth.refresh_token",
  ].includes(tool);
}

async function publishEvent(eventName: string, payload: Record<string, unknown>): Promise<void> {
  if (!redis) return;
  await redis.xadd(
    EVENT_STREAM,
    "*",
    "event",
    eventName,
    "payload",
    JSON.stringify(payload),
    "timestamp",
    now(),
    "publisher",
    "mcp-gateway",
  );
}

// ---------------------------------------------------------------------------
// Dev-mode in-memory stores (used when no MCP_DOMAIN_ENDPOINTS_JSON is set)
// ---------------------------------------------------------------------------
interface DevUser {
  user_id: string;
  email: string;
  phone: string;
  password_hash: string;
  account_type: string;
  account_status: string;
}

interface DevListing {
  listing_id: string;
  seller_id: string;
  title: string;
  description: string;
  category: string;
  quantity: number;
  unit: string;
  asking_price: number;
  status: string;
  created_at: string;
  published_at: string | null;
  [k: string]: JsonValue | undefined;
}

const devUsers = new Map<string, DevUser>();
const devListings = new Map<string, DevListing>();
const devThreads = new Map<string, { thread_id: string; participants: string[]; subject: string; messages: Array<{ sender_id: string; content: string; created_at: string }> }>();
const devPlatformConfig = new Map<string, string>();
const devPlatformAdminIds = new Set<string>();
/** Keyed by user_id — stores profile + search_prefs from extended registration. */
const devProfiles = new Map<string, Record<string, JsonValue>>();

/**
 * Dev-only: users live in memory and are wiped every time the gateway process restarts.
 * Set MATEX_DEV_SEED_EMAIL + MATEX_DEV_SEED_PASSWORD (and optional MATEX_DEV_SEED_PHONE) so you can log in
 * with the same credentials after each restart without re-registering.
 */
function seedDevUserFromEnv(): void {
  const email = String(process.env.MATEX_DEV_SEED_EMAIL ?? "")
    .toLowerCase()
    .trim();
  const password = String(process.env.MATEX_DEV_SEED_PASSWORD ?? "");
  if (!email || !password) return;
  if (devUsers.has(email)) return;
  const phone = String(process.env.MATEX_DEV_SEED_PHONE ?? "0000000000").trim();
  const accountType = String(process.env.MATEX_DEV_SEED_ACCOUNT_TYPE ?? "both").trim() || "both";
  const id = randomUUID();
  devUsers.set(email, {
    user_id: id,
    email,
    phone,
    password_hash: sha256(password),
    account_type: accountType,
    account_status: "active",
  });
  console.log(
    `[mcp-gateway] Seeded dev user ${email} from MATEX_DEV_SEED_* (persists until this process exits).`,
  );
}

function devAdminEmailSet(): Set<string> {
  const raw = process.env.MATEX_DEV_ADMIN_EMAILS ?? "";
  return new Set(raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
}

function devIsPlatformAdmin(userId: string, email: string): boolean {
  return devPlatformAdminIds.has(userId) || devAdminEmailSet().has(email.toLowerCase().trim());
}

function devBuildTokens(userId: string, email?: string): { access_token: string; refresh_token: string; expires_in: number } {
  return {
    access_token: jwt.sign({ sub: userId, scope: "access", email: email ?? "" }, JWT_SECRET as jwt.Secret, { expiresIn: JWT_ACCESS_TOKEN_EXPIRY }),
    refresh_token: jwt.sign({ sub: userId, scope: "refresh" }, JWT_SECRET as jwt.Secret, { expiresIn: JWT_REFRESH_TOKEN_EXPIRY }),
    expires_in: ACCESS_EXP_SECONDS,
  };
}

function ok(data: Record<string, unknown>): ToolResult { return { success: true, data: data as Record<string, JsonValue> }; }
function fail(code: string, message: string): ToolResult { return { success: false, error: { code, message } }; }

function handleDevTool(tool: string, args: Record<string, JsonValue>, userId: string): ToolResult | null {
  // ── Auth ──
  if (tool === "auth.register") {
    const email = String(args.email ?? "").toLowerCase().trim();
    const phone = String(args.phone ?? "").trim();
    const password = String(args.password ?? "");
    if (!email || !password) return fail("VALIDATION_ERROR", "email, phone, password are required.");
    if (devUsers.has(email)) return fail("DUPLICATE", "An account with this email already exists.");
    const id = randomUUID();
    devUsers.set(email, { user_id: id, email, phone, password_hash: sha256(password), account_type: String(args.account_type ?? "individual"), account_status: "active" });
    return ok({ user: { user_id: id, email, phone }, user_id: id, status: "active" });
  }
  if (tool === "auth.login") {
    const email = String(args.email ?? "").toLowerCase().trim();
    const password = String(args.password ?? "");
    if (!email || !password) return fail("VALIDATION_ERROR", "email and password are required.");
    const user = devUsers.get(email);
    if (!user || user.password_hash !== sha256(password)) return fail("AUTH_ERROR", "Invalid credentials.");
    return ok({
      user_id: user.user_id,
      account_type: user.account_type,
      account_status: user.account_status,
      is_platform_admin: devIsPlatformAdmin(user.user_id, email),
      tokens: devBuildTokens(user.user_id, email),
      mfa_required: false,
    });
  }
  if (tool === "auth.request_email_otp" || tool === "auth.request_phone_otp") {
    return ok({ challenge_id: randomUUID(), expires_at: new Date(Date.now() + 600_000).toISOString(), code: "000000" });
  }
  if (tool === "auth.verify_email" || tool === "auth.verify_phone") {
    return ok({ verified: true });
  }
  if (tool === "auth.refresh_token") {
    try {
      const decoded = jwt.verify(String(args.refresh_token ?? ""), JWT_SECRET) as { sub: string; scope: string };
      if (decoded.scope !== "refresh") return fail("AUTH_ERROR", "Invalid token scope.");
      return ok({
        access_token: jwt.sign({ sub: decoded.sub, scope: "access" }, JWT_SECRET as jwt.Secret, { expiresIn: JWT_ACCESS_TOKEN_EXPIRY }),
        expires_in: ACCESS_EXP_SECONDS,
      });
    } catch { return fail("AUTH_ERROR", "Invalid refresh token."); }
  }

  // ── Listing ──
  if (tool === "listing.create_listing") {
    const listingId = randomUUID();
    const listing: DevListing = {
      listing_id: listingId,
      seller_id: String(args.seller_id ?? userId),
      title: String(args.title ?? ""),
      description: String(args.description ?? ""),
      category: String(args.category ?? ""),
      quantity: Number(args.quantity ?? 0),
      unit: String(args.unit ?? "kg"),
      asking_price: Number(args.asking_price ?? 0),
      status: "draft",
      created_at: now(),
      published_at: null,
    };
    devListings.set(listingId, listing);
    return ok({ listing_id: listingId, status: "draft" });
  }
  if (tool === "listing.update_listing") {
    const id = String(args.listing_id ?? "");
    const listing = devListings.get(id);
    if (listing) {
      if (args.title) listing.title = String(args.title);
      if (args.description) listing.description = String(args.description);
      if (args.category) listing.category = String(args.category);
      if (args.quantity) listing.quantity = Number(args.quantity);
      if (args.asking_price) listing.asking_price = Number(args.asking_price);
    }
    return ok({ listing_id: id, updated: true });
  }
  if (tool === "listing.publish_listing") {
    const id = String(args.listing_id ?? "");
    const listing = devListings.get(id);
    if (listing) { listing.status = "active"; listing.published_at = now(); }
    return ok({ listing_id: id, status: "active", published_at: now() });
  }
  if (tool === "listing.get_listing") {
    const id = String(args.listing_id ?? "");
    const listing = devListings.get(id);
    return ok({ listing: listing ?? null });
  }
  if (tool === "listing.get_my_listings") {
    const sellerId = String(args.seller_id ?? userId);
    const listings = Array.from(devListings.values()).filter((l) => l.seller_id === sellerId);
    return ok({ listings, total: listings.length });
  }
  if (tool === "listing.upload_images") {
    return ok({ listing_id: String(args.listing_id ?? ""), images_uploaded: true, file_id: randomUUID() });
  }
  if (tool === "listing.archive_listing") {
    const id = String(args.listing_id ?? "");
    const listing = devListings.get(id);
    if (listing) listing.status = "archived";
    return ok({ listing_id: id, status: "archived" });
  }
  if (tool === "listing.add_favorite") {
    return ok({ listing_id: String(args.listing_id ?? ""), favorited: true });
  }

  // ── Search ──
  if (tool === "search.search_materials") {
    const q = String(args.query ?? "").toLowerCase();
    const results = Array.from(devListings.values())
      .filter((l) => l.status === "active" && (l.title.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || !q))
      .map(({ listing_id, title, description, asking_price, category, quantity, unit }) => ({ listing_id, title, description, asking_price, category, quantity, unit }));
    return ok({ results, total: results.length });
  }
  if (tool === "search.save_search") { return ok({ search_id: randomUUID() }); }
  if (tool === "search.get_saved_searches") { return ok({ saved_searches: [], total: 0 }); }
  if (tool === "search.geo_search") { return ok({ results: [], total: 0 }); }

  // ── Analytics ──
  if (tool === "analytics.get_dashboard_stats") {
    const activeListings = Array.from(devListings.values()).filter((l) => l.status === "active").length;
    // listings_change_pct: server-sourced only; null until analytics computes real deltas
    return ok({
      active_listings: activeListings,
      total_users: devUsers.size,
      escrow_held: 0,
      active_escrows: 0,
      active_auctions: 0,
      listings_change_pct: null,
      orders_pending_action: 0,
      orders_in_transit: 0,
    });
  }
  if (tool === "analytics.get_revenue_report") { return ok({ period: String(args.period ?? "30d"), transactions: 0, volume: 0, commission_estimate: 0 }); }
  if (tool === "analytics.get_conversion_funnel") { return ok({ funnel: { listings: devListings.size, searches: 0, threads: devThreads.size, orders: 0 } }); }

  // ── Payments ──
  if (tool === "payments.get_wallet_balance") { return ok({ wallet: { user_id: userId, balance: 0, pending_balance: 0 } }); }
  if (tool === "payments.top_up_wallet") { return ok({ user_id: userId, topped_up: Number(args.amount ?? 0) }); }
  if (tool === "payments.get_transaction_history") { return ok({ transactions: [], total: 0 }); }
  if (tool === "payments.process_payment") {
    return ok({ transaction: { transaction_id: randomUUID(), amount: Number(args.amount ?? 0), status: "completed" } });
  }

  // ── Messaging ──
  if (tool === "messaging.get_unread") { return ok({ total_unread: 0, count: 0 }); }
  if (tool === "messaging.create_thread") {
    const threadId = randomUUID();
    devThreads.set(threadId, { thread_id: threadId, participants: Array.isArray(args.participants) ? args.participants.map(String) : [userId], subject: String(args.subject ?? ""), messages: [] });
    return ok({ thread_id: threadId });
  }
  if (tool === "messaging.send_message") {
    const thread = devThreads.get(String(args.thread_id ?? ""));
    const msgId = randomUUID();
    if (thread) thread.messages.push({ sender_id: String(args.sender_id ?? userId), content: String(args.content ?? ""), created_at: now() });
    return ok({ message_id: msgId });
  }
  if (tool === "messaging.get_thread") {
    const thread = devThreads.get(String(args.thread_id ?? ""));
    return ok({ thread: thread ?? null });
  }
  if (tool === "messaging.get_messages") { return ok({ messages: [], total: 0 }); }
  if (tool === "messaging.list_threads") {
    const list = Array.from(devThreads.values())
      .filter((t) => t.participants.includes(userId))
      .map((t) => {
        const lastMsg = t.messages[t.messages.length - 1];
        return {
          thread_id: t.thread_id,
          subject: t.subject,
          participants: t.participants,
          last_message: lastMsg?.content ?? "",
          last_message_at: lastMsg?.created_at ?? "",
          unread_count: 0,
          status: "active" as const,
        };
      });
    return ok({ threads: list, total: list.length });
  }

  // ── Notifications ──
  if (tool === "notifications.get_notifications") { return ok({ notifications: [], total: 0 }); }
  if (tool === "notifications.send_notification") { return ok({ notification_id: randomUUID(), channels_sent: ["in_app"] }); }
  if (tool === "notifications.mark_read") { return ok({ notification_id: String(args.notification_id ?? ""), read: true }); }
  if (tool === "notifications.update_preferences") { return ok({ user_id: userId, preferences_updated: true }); }
  if (tool === "notifications.get_preferences") { return ok({ user_id: userId, preferences: { email: true, sms: true, push: true, in_app: true } }); }

  // ── KYC ──
  if (tool === "kyc.get_kyc_level") { return ok({ current_level: "level_2", updated_at: now() }); }
  if (tool === "kyc.start_verification") { return ok({ verification_id: randomUUID(), status: "pending" }); }
  if (tool === "kyc.submit_document") { return ok({ document_id: randomUUID() }); }
  if (tool === "kyc.assert_kyc_gate") { return ok({ allowed: true, current_level: "level_2" }); }

  // ── Booking ──
  if (tool === "booking.set_availability") { return ok({ availability_id: randomUUID() }); }
  if (tool === "booking.list_user_bookings") { return ok({ bookings: [], total: 0 }); }
  if (tool === "booking.create_booking") { return ok({ booking_id: randomUUID(), status: "pending" }); }
  if (tool === "booking.get_available_slots") {
    const slots = [];
    const base = new Date(); base.setDate(base.getDate() + 2); base.setHours(9, 0, 0, 0);
    for (let i = 0; i < 5; i++) { const d = new Date(base); d.setDate(d.getDate() + i); slots.push({ date: d.toISOString().slice(0, 10), start: "09:00", end: "17:00" }); }
    return ok({ slots, total: slots.length });
  }

  // ── Logistics ──
  if (tool === "logistics.get_quotes") {
    return ok({ order_id: randomUUID(), quotes: [
      { carrier: "Day & Ross", api: "day_ross", price: 1190, transit: "2 days", co2: 124 },
      { carrier: "Manitoulin Transport", api: "manitoulin", price: 1240, transit: "2 days", co2: 132 },
      { carrier: "Purolator Freight", api: "purolator", price: 1305, transit: "1 day", co2: 118 },
    ]});
  }
  if (tool === "logistics.book_shipment") { return ok({ shipment_id: randomUUID(), status: "booked", carrier: String(args.carrier_name ?? "Day & Ross") }); }
  if (tool === "logistics.get_shipment") { return ok({ shipment: { shipment_id: String(args.shipment_id ?? ""), status: "booked", carrier_name: "Day & Ross" } }); }
  if (tool === "logistics.generate_bol") { return ok({ shipment_id: String(args.shipment_id ?? ""), bol_number: `BOL-2026-${randomUUID().slice(0, 8).toUpperCase()}` }); }
  if (tool === "logistics.list_shipments") { return ok({ shipments: [], total: 0 }); }

  // ── Tax ──
  if (tool === "tax.calculate_tax") {
    const subtotal = Number(args.subtotal ?? args.amount ?? 0);
    const buyerProv = String(args.buyer_province ?? "ON").toUpperCase();
    const rates: Record<string, { gst: number; pst: number; hst: number; qst: number }> = {
      ON: { gst: 0, pst: 0, hst: 0.13, qst: 0 }, BC: { gst: 0.05, pst: 0.07, hst: 0, qst: 0 },
      AB: { gst: 0.05, pst: 0, hst: 0, qst: 0 }, QC: { gst: 0.05, pst: 0, hst: 0, qst: 0.09975 },
      NB: { gst: 0, pst: 0, hst: 0.15, qst: 0 }, NS: { gst: 0, pst: 0, hst: 0.15, qst: 0 },
      SK: { gst: 0.05, pst: 0, hst: 0, qst: 0 }, MB: { gst: 0.05, pst: 0, hst: 0, qst: 0 },
    };
    const r = rates[buyerProv] ?? rates["ON"]!;
    const gst = Math.round(subtotal * r.gst * 100) / 100;
    const pst = Math.round(subtotal * r.pst * 100) / 100;
    const hst = Math.round(subtotal * r.hst * 100) / 100;
    const qst = Math.round(subtotal * r.qst * 100) / 100;
    const totalTax = Math.round((gst + pst + hst + qst) * 100) / 100;
    return ok({ seller_province: String(args.seller_province ?? "ON"), buyer_province: buyerProv, subtotal, gst_amount: gst, pst_amount: pst, hst_amount: hst, qst_amount: qst, total_tax: totalTax, total_amount: Math.round((subtotal + totalTax) * 100) / 100 });
  }
  if (tool === "tax.generate_invoice") {
    const seq = Math.floor(Math.random() * 999999) + 1;
    return ok({ invoice_id: randomUUID(), invoice_number: `MTX-2026-${String(seq).padStart(6, "0")}`, total_amount: Number(args.subtotal ?? 0), total_tax: 0 });
  }

  // ── Escrow ──
  if (tool === "escrow.create_escrow") { return ok({ escrow_id: randomUUID(), order_id: String(args.order_id ?? randomUUID()), status: "created" }); }
  if (tool === "escrow.hold_funds") { return ok({ escrow_id: String(args.escrow_id ?? ""), status: "funds_held" }); }
  if (tool === "escrow.release_funds") { return ok({ escrow_id: String(args.escrow_id ?? ""), status: "released" }); }
  if (tool === "escrow.freeze_escrow") { return ok({ escrow_id: String(args.escrow_id ?? ""), status: "frozen" }); }
  if (tool === "escrow.get_escrow") { return ok({ escrow: { escrow_id: String(args.escrow_id ?? ""), status: "created", held_amount: 0 }, timeline: [] }); }
  if (tool === "escrow.list_escrows") { return ok({ escrows: [], total: 0 }); }
  if (tool === "escrow.refund_escrow") { return ok({ escrow_id: String(args.escrow_id ?? ""), status: "refunded" }); }

  // ── Bidding ──
  if (tool === "bidding.place_bid") { return ok({ bid_id: randomUUID(), amount: Number(args.amount ?? 0) }); }
  if (tool === "bidding.get_highest_bid") { return ok({ highest_bid: null }); }

  // ── Auction ──
  if (tool === "auction.place_auction_bid") { return ok({ bid_id: randomUUID(), lot_id: String(args.lot_id ?? ""), amount: Number(args.amount ?? 0) }); }
  if (tool === "auction.get_lot_state") { return ok({ lot: null }); }
  if (tool === "auction.register_bidder") { return ok({ registered: true, lot_id: String(args.lot_id ?? "") }); }
  if (tool === "auction.list_auctions") { return ok({ auctions: [], total: 0 }); }
  if (tool === "auction.get_auction") { return ok({ auction: null, lots: [] }); }

  // ── Inspection ──
  if (tool === "inspection.request_inspection") { return ok({ inspection_id: randomUUID(), status: "requested" }); }
  if (tool === "inspection.complete_inspection") { return ok({ inspection_id: String(args.inspection_id ?? ""), status: "completed" }); }
  if (tool === "inspection.evaluate_discrepancy") { return ok({ delta_pct: 0, exceeded_tolerance: false }); }
  if (tool === "inspection.list_inspections") { return ok({ inspections: [], total: 0 }); }
  if (tool === "inspection.record_weight") { return ok({ record_id: randomUUID(), weight_point: String(args.weight_point ?? "w1_seller") }); }
  if (tool === "inspection.get_inspection") { return ok({ inspection: null }); }

  // ── Profile ──
  if (tool === "profile.get_profile") {
    const stored = devProfiles.get(userId) ?? {};
    return ok({
      profile: {
        user_id: userId,
        display_name: stored.display_name ?? "",
        first_name: stored.first_name ?? "",
        last_name: stored.last_name ?? "",
        bio: stored.bio ?? "",
        search_prefs: stored.search_prefs ?? {},
        ...stored,
      },
    });
  }
  if (tool === "profile.update_profile") {
    const existing = devProfiles.get(userId) ?? {};
    if (args.first_name !== undefined) existing.first_name = args.first_name;
    if (args.last_name !== undefined) existing.last_name = args.last_name;
    if (args.display_name !== undefined) existing.display_name = args.display_name;
    if (args.bio !== undefined) existing.bio = args.bio;
    if (args.search_prefs !== undefined) existing.search_prefs = args.search_prefs;
    if (args.province !== undefined) existing.province = args.province;
    if (args.country !== undefined) existing.country = args.country;
    devProfiles.set(userId, existing);
    return ok({ user_id: userId, updated: true, profile: existing });
  }
  if (tool === "profile.update_company") { return ok({ user_id: userId, updated: true }); }

  // ── Contracts ──
  if (tool === "contracts.create_contract") { return ok({ contract_id: randomUUID(), status: "draft" }); }
  if (tool === "contracts.activate_contract") { return ok({ contract_id: String(args.contract_id ?? ""), status: "active" }); }
  if (tool === "contracts.get_contract") { return ok({ contract: null }); }
  if (tool === "contracts.list_contracts") { return ok({ contracts: [], total: 0 }); }

  // ── Pricing ──
  if (tool === "pricing.get_market_prices") { return ok({ prices: [], total: 0 }); }
  if (tool === "pricing.create_price_alert") { return ok({ alert_id: randomUUID() }); }
  if (tool === "pricing.calculate_mpi") { return ok({ mpi_id: randomUUID(), mpi_value: 0, region: "ontario", sample_size: 0 }); }

  // ── eSign ──
  if (tool === "esign.create_document") { return ok({ document_id: randomUUID(), status: "draft" }); }
  if (tool === "esign.send_for_signing") { return ok({ document_id: String(args.document_id ?? ""), envelope_id: `ENV-${randomUUID().slice(0, 8)}`, status: "sent" }); }

  // ── Credit ──
  if (tool === "credit.assess_credit") { return ok({ user_id: userId, credit_tier: "standard", credit_limit: 50000, matex_credit_score: 650 }); }
  if (tool === "credit.get_credit_facility") { return ok({ facility: null }); }

  // ── Admin (dev in-memory; use MATEX_DEV_ADMIN_EMAILS=a@b.com for platform admin UI) ──
  if (tool === "admin.get_platform_overview") {
    return ok({ total_users: devUsers.size, total_listings: devListings.size, total_orders: 0, open_disputes: 0 });
  }
  if (tool === "admin.list_users") {
    const users = Array.from(devUsers.values()).map((u) => ({
      user_id: u.user_id,
      email: u.email,
      phone: u.phone,
      account_type: u.account_type,
      account_status: u.account_status,
      email_verified: true,
      phone_verified: true,
      created_at: now(),
    }));
    return ok({ users, total: users.length });
  }
  if (tool === "admin.update_user") {
    const uid = String(args.user_id ?? "");
    if (!uid) return fail("VALIDATION_ERROR", "user_id is required.");
    let found = false;
    for (const u of devUsers.values()) {
      if (u.user_id !== uid) continue;
      found = true;
      if (args.account_status) u.account_status = String(args.account_status);
      if (args.account_type) u.account_type = String(args.account_type);
      if (args.phone) u.phone = String(args.phone);
      break;
    }
    if (!found) return fail("NOT_FOUND", "User not found.");
    return ok({ user_id: uid, updated: true });
  }
  if (tool === "admin.suspend_user") {
    const uid = String(args.user_id ?? "");
    for (const u of devUsers.values()) {
      if (u.user_id === uid) {
        u.account_status = "suspended";
        return ok({ user_id: uid, account_status: "suspended", reason: String(args.reason ?? "") });
      }
    }
    return fail("NOT_FOUND", "User not found.");
  }
  if (tool === "admin.unsuspend_user") {
    const uid = String(args.user_id ?? "");
    for (const u of devUsers.values()) {
      if (u.user_id === uid) {
        u.account_status = "active";
        return ok({ user_id: uid, account_status: "active" });
      }
    }
    return fail("NOT_FOUND", "User not found.");
  }
  if (tool === "admin.list_listings") {
    const listings = Array.from(devListings.values()).map((l) => ({
      listing_id: l.listing_id,
      seller_id: l.seller_id,
      title: l.title,
      status: l.status,
      price_type: "fixed",
      asking_price: l.asking_price,
      quantity: l.quantity,
      unit: l.unit,
      created_at: l.created_at,
    }));
    return ok({ listings, total: listings.length });
  }
  if (tool === "admin.moderate_listing") {
    const id = String(args.listing_id ?? "");
    const listing = devListings.get(id);
    if (listing) {
      const action = String(args.action ?? "remove");
      listing.status = action === "remove" ? "cancelled" : "suspended";
    }
    return ok({ listing_id: id, status: listing?.status ?? "unknown" });
  }
  if (tool === "admin.update_listing_status") {
    const id = String(args.listing_id ?? "");
    const listing = devListings.get(id);
    if (listing) listing.status = String(args.status ?? listing.status);
    return ok({ listing_id: id, status: listing?.status ?? String(args.status ?? "") });
  }
  if (tool === "admin.list_escrows") {
    return ok({ escrows: [], total: 0 });
  }
  if (tool === "admin.list_auctions") {
    return ok({ auctions: [], total: 0 });
  }
  if (tool === "admin.list_lots") {
    return ok({ lots: [], total: 0 });
  }
  if (tool === "admin.list_orders") {
    return ok({ orders: [], total: 0 });
  }
  if (tool === "admin.update_order_status") {
    return ok({ order_id: String(args.order_id ?? ""), status: String(args.status ?? "") });
  }
  if (tool === "admin.list_bids") {
    return ok({ bids: [], total: 0 });
  }
  if (tool === "admin.list_transactions") {
    return ok({ transactions: [], total: 0 });
  }
  if (tool === "admin.list_platform_config") {
    const entries = Array.from(devPlatformConfig.entries()).map(([config_key, config_value]) => ({
      config_key,
      config_value,
      updated_at: now(),
    }));
    return ok({ entries, total: entries.length });
  }
  if (tool === "admin.update_platform_config") {
    const key = String(args.key ?? "").trim();
    const value = String(args.value ?? "");
    if (!key) return fail("VALIDATION_ERROR", "key is required.");
    devPlatformConfig.set(key, value);
    return ok({ key, value, updated: true });
  }
  if (tool === "admin.grant_platform_admin") {
    const uid = String(args.user_id ?? "");
    if (!uid) return fail("VALIDATION_ERROR", "user_id is required.");
    devPlatformAdminIds.add(uid);
    return ok({ user_id: uid, granted: true });
  }
  if (tool === "admin.revoke_platform_admin") {
    const uid = String(args.user_id ?? "");
    devPlatformAdminIds.delete(uid);
    return ok({ user_id: uid, revoked: true });
  }
  if (tool === "admin.get_audit_trail") {
    return ok({ entries: [], total: 0 });
  }

  // ── Generic ping ──
  if (tool.endsWith(".ping")) { return ok({ status: "ok", timestamp: now() }); }

  return null;
}

async function routeToolRequest(
  claims: AuthClaims,
  body: GatewayRequestBody,
  ipAddress: string,
): Promise<ToolResult> {
  if (!body.tool || !body.tool.includes(".")) {
    return { success: false, error: { code: "INVALID_TOOL", message: "Expected tool format: domain.action" } };
  }

  const [domain, action] = body.tool.split(".");
  const targetServer = ROUTE_MAP[domain ?? ""];
  if (!targetServer) {
    return {
      success: false,
      error: { code: "UNKNOWN_DOMAIN", message: `No MCP server route for domain '${domain ?? "unknown"}'` },
    };
  }

  // Phase 0 gateway routes and logs requests. Server invocation wiring is added as each MCP server goes live.
  const traceInput = JSON.stringify({ tool: body.tool, args: body.args ?? {} });
  await publishEvent("gateway.tool.routed", {
    trace_id: sha256(`${claims.sub}:${Date.now()}:${traceInput}`),
    user_id: claims.sub,
    role: claims.role ?? "unknown",
    ip_address: ipAddress,
    tool: body.tool,
    action: action ?? "",
    target_server: targetServer,
  });

  const endpoint = domainEndpoints[domain ?? ""];
  if (endpoint) {
    try {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), FORWARD_TIMEOUT_MS);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-matex-user-id": claims.sub,
          "x-matex-user-role": claims.role ?? "unknown",
          "x-matex-gateway-source-ip": ipAddress,
        },
        body: JSON.stringify({
          tool: body.tool,
          args: body.args ?? {},
          auth: {
            sub: claims.sub,
            role: claims.role ?? "unknown",
            email: claims.email ?? "",
          },
        }),
        signal: abortController.signal,
      });
      clearTimeout(timeout);

      const textBody = await response.text();
      let parsedBody: unknown = textBody;
      try {
        parsedBody = JSON.parse(textBody);
      } catch {
        // Keep raw text body if upstream response is not JSON.
      }

      await publishEvent("gateway.tool.forwarded", {
        user_id: claims.sub,
        tool: body.tool,
        action: action ?? "",
        target_server: targetServer,
        endpoint,
        upstream_status: response.status,
      });

      if (!response.ok) {
        return {
          success: false,
          error: {
            code: "UPSTREAM_ERROR",
            message: `Upstream returned ${response.status}`,
          },
          data: {
            endpoint,
            upstream_status: response.status,
            upstream_body: parsedBody as JsonValue,
          },
        };
      }

      return {
        success: true,
        data: {
          status: "forwarded",
          target_server: targetServer,
          endpoint,
          tool: body.tool,
          upstream_response: parsedBody as JsonValue,
        },
      };
    } catch (error) {
      await publishEvent("gateway.tool.forward_failed", {
        user_id: claims.sub,
        tool: body.tool,
        action: action ?? "",
        target_server: targetServer,
        endpoint,
        error: error instanceof Error ? error.message : "unknown",
      });
      return {
        success: false,
        error: { code: "FORWARD_FAILED", message: `Failed to forward request to ${endpoint}` },
      };
    }
  }

  // Dev-mode: handle tools in-memory when no endpoint is configured
  const devResult = handleDevTool(body.tool, (body.args ?? {}) as Record<string, JsonValue>, claims.sub);
  if (devResult) return devResult;

  return {
    success: true,
    data: {
      status: "routed",
      target_server: targetServer,
      tool: body.tool,
      next_step: "Configure MCP_DOMAIN_ENDPOINTS_JSON to enable live forwarding",
    },
  };
}

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

const server = createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = parsedUrl.pathname;

  if (req.method === "GET" && path === "/health") {
    writeJson(res, 200, {
      status: "ok",
      service: "mcp-gateway",
      timestamp: now(),
      redis: redis ? "configured" : "not_configured",
      routes: Object.keys(ROUTE_MAP).length,
    });
    return;
  }

  if (req.method === "POST" && path === "/tool") {
    const body = await readJsonBody(req);
    if (!body) {
      writeJson(res, 400, { success: false, error: { code: "INVALID_JSON", message: "Malformed JSON request body" } });
      return;
    }

    const ipAddress = getClientIp(req);
    const authClaims = validateJwt(req);
    const publicRoute = isPublicTool(body.tool);
    const claims: AuthClaims | null = authClaims?.sub
      ? authClaims
      : publicRoute
        ? { sub: "anonymous", role: "public" }
        : null;

    if (!claims?.sub) {
      writeJson(res, 401, { success: false, error: { code: "UNAUTHORIZED", message: "Invalid or missing JWT" } });
      return;
    }

    const rateUser = claims.sub === "anonymous" ? `ip:${ipAddress}:public` : `user:${claims.sub}`;
    if (!applyRateLimit(`ip:${ipAddress}`) || !applyRateLimit(rateUser)) {
      writeJson(res, 429, { success: false, error: { code: "RATE_LIMITED", message: "Rate limit exceeded" } });
      return;
    }

    const result = await routeToolRequest(claims, body, ipAddress);
    writeJson(res, result.success ? 200 : 400, result);
    return;
  }

  writeJson(res, 404, { success: false, error: { code: "NOT_FOUND", message: "Route not found" } });
});

server.on("error", (err) => {
  console.error("[mcp-gateway] server error:", err);
  process.exit(1);
});

// Bind all interfaces so Railway / Docker can route traffic (not only loopback).
server.listen(PORT, "0.0.0.0", () => {
  seedDevUserFromEnv();
  console.log(`MCP Gateway listening on 0.0.0.0:${PORT}`);
});
