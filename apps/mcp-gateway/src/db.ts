/**
 * Database layer — thin wrapper around node-postgres.
 *
 * When DATABASE_URL is set the gateway uses a real PostgreSQL connection pool
 * (Supabase or any compatible Postgres). When it is absent the gateway falls
 * back to the in-memory dev stores defined in index.ts.
 */
import { Pool } from "pg";
import { sha256 } from "@matex/utils";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Pool singleton
// ---------------------------------------------------------------------------

let _pool: Pool | null = null;

export function getPool(): Pool | null {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  _pool = new Pool({
    connectionString: url,
    ssl: url.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  _pool.on("error", (err) => {
    console.error("[db] Pool error:", err.message);
  });
  return _pool;
}

export function isDbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

export interface DbUser {
  user_id: string;
  email: string;
  phone: string;
  password_hash: string;
  account_type: string;
  account_status: string;
  is_platform_admin: boolean;
}

export async function dbFindUserByEmail(email: string): Promise<DbUser | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query<DbUser>(
    `SELECT user_id, email, phone, password_hash, account_type, account_status,
            COALESCE(is_platform_admin, false) AS is_platform_admin
     FROM auth_mcp.users
     WHERE email = $1
     LIMIT 1`,
    [email.toLowerCase().trim()],
  );
  return rows[0] ?? null;
}

export async function dbFindUserById(userId: string): Promise<DbUser | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query<DbUser>(
    `SELECT user_id, email, phone, password_hash, account_type, account_status,
            COALESCE(is_platform_admin, false) AS is_platform_admin
     FROM auth_mcp.users
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function dbCreateUser(opts: {
  email: string;
  phone: string;
  password: string;
  account_type?: string;
}): Promise<DbUser> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  const id = randomUUID();
  const hash = sha256(opts.password);
  await pool.query(
    `INSERT INTO auth_mcp.users
       (user_id, email, phone, password_hash, account_type, account_status)
     VALUES ($1, $2, $3, $4, $5, 'active')`,
    [id, opts.email.toLowerCase().trim(), opts.phone, hash, opts.account_type ?? "individual"],
  );
  return {
    user_id: id,
    email: opts.email.toLowerCase().trim(),
    phone: opts.phone,
    password_hash: hash,
    account_type: opts.account_type ?? "individual",
    account_status: "active",
    is_platform_admin: false,
  };
}

export async function dbUpdatePassword(email: string, newPassword: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  await pool.query(
    `UPDATE auth_mcp.users SET password_hash = $1 WHERE email = $2`,
    [sha256(newPassword), email.toLowerCase().trim()],
  );
}

export async function dbUpdateUserStatus(userId: string, status: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  await pool.query(
    `UPDATE auth_mcp.users SET account_status = $1 WHERE user_id = $2`,
    [status, userId],
  );
}

export async function dbListUsers(limit = 50, offset = 0): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT user_id, email, phone, account_type, account_status,
            email_verified, phone_verified, created_at,
            COALESCE(is_platform_admin, false) AS is_platform_admin
     FROM auth_mcp.users
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

export async function dbCountUsers(): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM auth_mcp.users`);
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Profile helpers
// ---------------------------------------------------------------------------

export async function dbGetProfile(userId: string): Promise<Record<string, unknown> | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT user_id, display_name, first_name, last_name, bio, province, country,
            search_prefs, created_at, updated_at
     FROM profile_mcp.profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function dbUpsertProfile(userId: string, fields: Record<string, unknown>): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  const cols = ["display_name", "first_name", "last_name", "bio", "province", "country", "search_prefs"];
  const setClauses: string[] = [];
  const values: unknown[] = [userId];
  const insertCols: string[] = [];
  const insertPlaceholders: string[] = ["$1"];
  for (const col of cols) {
    if (fields[col] !== undefined) {
      values.push(col === "search_prefs" ? JSON.stringify(fields[col]) : fields[col]);
      setClauses.push(`${col} = $${values.length}`);
      insertCols.push(col);
      insertPlaceholders.push(`$${values.length}`);
    }
  }
  if (setClauses.length === 0) return;
  await pool.query(
    `INSERT INTO profile_mcp.profiles (user_id${insertCols.length ? ", " + insertCols.join(", ") : ""})
     VALUES (${insertPlaceholders.join(", ")})
     ON CONFLICT (user_id) DO UPDATE SET ${setClauses.join(", ")}, updated_at = now()`,
    values,
  );
}

// ---------------------------------------------------------------------------
// KYC helpers
// ---------------------------------------------------------------------------

export async function dbGetKycLevel(userId: string): Promise<{ current_level: string; updated_at: string } | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT current_level, updated_at
     FROM kyc_mcp.kyc_levels
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function dbEnsureKycLevel(userId: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `INSERT INTO kyc_mcp.kyc_levels (user_id, current_level)
     VALUES ($1, 'level_0')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

// ---------------------------------------------------------------------------
// Listing helpers
// ---------------------------------------------------------------------------

export async function dbCreateListing(opts: Record<string, unknown>): Promise<string> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  const id = randomUUID();
  await pool.query(
    `INSERT INTO listing_mcp.listings
       (listing_id, seller_id, title, description, category, quantity, unit, asking_price, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')`,
    [
      id,
      opts.seller_id,
      opts.title,
      opts.description ?? "",
      opts.category ?? "",
      opts.quantity ?? 0,
      opts.unit ?? "kg",
      opts.asking_price ?? 0,
    ],
  );
  return id;
}

export async function dbUpdateListing(listingId: string, fields: Record<string, unknown>): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  const allowed = ["title", "description", "category", "quantity", "unit", "asking_price", "status"];
  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const col of allowed) {
    if (fields[col] !== undefined) {
      values.push(fields[col]);
      setClauses.push(`${col} = $${values.length}`);
    }
  }
  if (setClauses.length === 0) return;
  values.push(listingId);
  await pool.query(
    `UPDATE listing_mcp.listings SET ${setClauses.join(", ")}, updated_at = now()
     WHERE listing_id = $${values.length}`,
    values,
  );
}

export async function dbPublishListing(listingId: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  await pool.query(
    `UPDATE listing_mcp.listings SET status = 'active', published_at = now(), updated_at = now()
     WHERE listing_id = $1`,
    [listingId],
  );
}

export async function dbGetListingById(listingId: string): Promise<Record<string, unknown> | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT * FROM listing_mcp.listings WHERE listing_id = $1 LIMIT 1`,
    [listingId],
  );
  return rows[0] ?? null;
}

export async function dbListListingsBySeller(sellerId: string): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT * FROM listing_mcp.listings WHERE seller_id = $1 ORDER BY created_at DESC`,
    [sellerId],
  );
  return rows;
}

export async function dbSearchListings(query: string, limit = 20, offset = 0): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const q = `%${query.toLowerCase()}%`;
  const { rows } = await pool.query(
    `SELECT listing_id, title, description, asking_price, category, quantity, unit, seller_id, status
     FROM listing_mcp.listings
     WHERE status = 'active'
       AND ($1 = '%%' OR lower(title) LIKE $1 OR lower(description) LIKE $1 OR lower(category) LIKE $1)
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [q, limit, offset],
  );
  return rows;
}

export async function dbListAllListings(limit = 50, offset = 0): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT listing_id, seller_id, title, status, asking_price, quantity, unit, category, created_at
     FROM listing_mcp.listings
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

export async function dbUpdateListingStatus(listingId: string, status: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  await pool.query(
    `UPDATE listing_mcp.listings SET status = $1, updated_at = now() WHERE listing_id = $2`,
    [status, listingId],
  );
}

// ---------------------------------------------------------------------------
// Messaging helpers
// ---------------------------------------------------------------------------

export async function dbCreateThread(opts: {
  participants: string[];
  subject: string;
  listing_id?: string;
}): Promise<string> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  const id = randomUUID();
  await pool.query(
    `INSERT INTO messaging_mcp.threads (thread_id, participants, subject, listing_id, status)
     VALUES ($1, $2, $3, $4, 'active')`,
    [id, opts.participants, opts.subject, opts.listing_id ?? null],
  );
  return id;
}

export async function dbSendMessage(opts: {
  thread_id: string;
  sender_id: string;
  content: string;
}): Promise<string> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  const id = randomUUID();
  await pool.query(
    `INSERT INTO messaging_mcp.messages (message_id, thread_id, sender_id, content)
     VALUES ($1, $2, $3, $4)`,
    [id, opts.thread_id, opts.sender_id, opts.content],
  );
  await pool.query(
    `UPDATE messaging_mcp.threads SET last_message_at = now(), updated_at = now()
     WHERE thread_id = $1`,
    [opts.thread_id],
  );
  return id;
}

export async function dbGetThread(threadId: string): Promise<Record<string, unknown> | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT t.*,
       (SELECT json_agg(m ORDER BY m.created_at ASC)
        FROM messaging_mcp.messages m WHERE m.thread_id = t.thread_id) AS messages
     FROM messaging_mcp.threads t
     WHERE t.thread_id = $1
     LIMIT 1`,
    [threadId],
  );
  return rows[0] ?? null;
}

export async function dbListThreads(userId: string): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT t.thread_id, t.subject, t.participants, t.status, t.last_message_at,
       (SELECT content FROM messaging_mcp.messages m
        WHERE m.thread_id = t.thread_id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
       (SELECT COUNT(*)::int FROM messaging_mcp.messages m
        WHERE m.thread_id = t.thread_id AND m.sender_id != $1 AND m.read_at IS NULL) AS unread_count
     FROM messaging_mcp.threads t
     WHERE $1 = ANY(t.participants)
     ORDER BY COALESCE(t.last_message_at, t.created_at) DESC`,
    [userId],
  );
  return rows;
}

export async function dbGetMessages(threadId: string, limit = 50, offset = 0): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT message_id, thread_id, sender_id, content, created_at, read_at
     FROM messaging_mcp.messages
     WHERE thread_id = $1
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [threadId, limit, offset],
  );
  return rows;
}

export async function dbGetUnreadCount(userId: string): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM messaging_mcp.messages m
     JOIN messaging_mcp.threads t ON t.thread_id = m.thread_id
     WHERE $1 = ANY(t.participants)
       AND m.sender_id != $1
       AND m.read_at IS NULL`,
    [userId],
  );
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Notifications helpers
// ---------------------------------------------------------------------------

export async function dbGetNotifications(userId: string, limit = 20, offset = 0): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT notification_id, user_id, title, body, channel, priority, read_at, created_at
     FROM notifications_mcp.notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return rows;
}

export async function dbCreateNotification(opts: {
  user_id: string;
  title: string;
  body: string;
  channel?: string;
  priority?: string;
}): Promise<string> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  const id = randomUUID();
  await pool.query(
    `INSERT INTO notifications_mcp.notifications
       (notification_id, user_id, title, body, channel, priority)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, opts.user_id, opts.title, opts.body, opts.channel ?? "in_app", opts.priority ?? "normal"],
  );
  return id;
}

export async function dbMarkNotificationRead(notificationId: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  await pool.query(
    `UPDATE notifications_mcp.notifications SET read_at = now() WHERE notification_id = $1`,
    [notificationId],
  );
}

// ---------------------------------------------------------------------------
// Payments helpers
// ---------------------------------------------------------------------------

export async function dbGetWalletBalance(userId: string): Promise<{ balance: number; pending_balance: number }> {
  const pool = getPool();
  if (!pool) return { balance: 0, pending_balance: 0 };
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN status = 'completed' AND transaction_type IN ('wallet_topup','credit_payment') THEN amount
                              WHEN status = 'completed' AND transaction_type IN ('purchase','commission') THEN -amount
                              ELSE 0 END), 0)::numeric AS balance,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0)::numeric AS pending_balance
     FROM payments_mcp.transactions
     WHERE user_id = $1`,
    [userId],
  );
  return { balance: Number(rows[0]?.balance ?? 0), pending_balance: Number(rows[0]?.pending_balance ?? 0) };
}

export async function dbGetTransactionHistory(userId: string, limit = 20, offset = 0): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT transaction_id, user_id, transaction_type, amount, currency, status, created_at, description
     FROM payments_mcp.transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return rows;
}

export async function dbCreateTransaction(opts: {
  user_id: string;
  transaction_type: string;
  amount: number;
  currency?: string;
  status?: string;
  description?: string;
  reference_id?: string;
}): Promise<string> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  const id = randomUUID();
  await pool.query(
    `INSERT INTO payments_mcp.transactions
       (transaction_id, user_id, transaction_type, amount, currency, status, description, reference_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      opts.user_id,
      opts.transaction_type,
      opts.amount,
      opts.currency ?? "CAD",
      opts.status ?? "completed",
      opts.description ?? "",
      opts.reference_id ?? null,
    ],
  );
  return id;
}

export async function dbListAllTransactions(limit = 50, offset = 0): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT transaction_id, user_id, transaction_type, amount, currency, status, created_at
     FROM payments_mcp.transactions
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Escrow helpers
// ---------------------------------------------------------------------------

export async function dbCreateEscrow(opts: {
  order_id: string;
  buyer_id: string;
  seller_id: string;
  held_amount: number;
  currency?: string;
}): Promise<string> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  const id = randomUUID();
  await pool.query(
    `INSERT INTO escrow_mcp.escrows
       (escrow_id, order_id, buyer_id, seller_id, held_amount, currency, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'created')`,
    [id, opts.order_id, opts.buyer_id, opts.seller_id, opts.held_amount, opts.currency ?? "CAD"],
  );
  return id;
}

export async function dbUpdateEscrowStatus(escrowId: string, status: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  await pool.query(
    `UPDATE escrow_mcp.escrows SET status = $1, updated_at = now() WHERE escrow_id = $2`,
    [status, escrowId],
  );
}

export async function dbGetEscrow(escrowId: string): Promise<Record<string, unknown> | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT * FROM escrow_mcp.escrows WHERE escrow_id = $1 LIMIT 1`,
    [escrowId],
  );
  return rows[0] ?? null;
}

export async function dbListEscrows(userId: string): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT escrow_id, order_id, buyer_id, seller_id, held_amount, currency, status, created_at
     FROM escrow_mcp.escrows
     WHERE buyer_id = $1 OR seller_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function dbListAllEscrows(limit = 50, offset = 0): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT escrow_id, order_id, buyer_id, seller_id, held_amount, currency, status, created_at
     FROM escrow_mcp.escrows
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Orders helpers
// ---------------------------------------------------------------------------

export async function dbListAllOrders(limit = 50, offset = 0): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT order_id, buyer_id, seller_id, listing_id, status, total_amount, currency, created_at
     FROM orders_mcp.orders
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return rows;
}

export async function dbUpdateOrderStatus(orderId: string, status: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  await pool.query(
    `UPDATE orders_mcp.orders SET status = $1, updated_at = now() WHERE order_id = $2`,
    [status, orderId],
  );
}

// ---------------------------------------------------------------------------
// Bidding helpers
// ---------------------------------------------------------------------------

export async function dbPlaceBid(opts: {
  listing_id: string;
  bidder_id: string;
  amount: number;
  bid_type?: string;
}): Promise<string> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  const id = randomUUID();
  // Mark previous bids as outbid
  await pool.query(
    `UPDATE bidding_mcp.bids SET status = 'outbid' WHERE listing_id = $1 AND status = 'active'`,
    [opts.listing_id],
  );
  await pool.query(
    `INSERT INTO bidding_mcp.bids (bid_id, listing_id, bidder_id, amount, bid_type, status)
     VALUES ($1, $2, $3, $4, $5, 'active')`,
    [id, opts.listing_id, opts.bidder_id, opts.amount, opts.bid_type ?? "manual"],
  );
  return id;
}

export async function dbGetHighestBid(listingId: string): Promise<Record<string, unknown> | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT bid_id, listing_id, bidder_id, amount, bid_type, status, created_at
     FROM bidding_mcp.bids
     WHERE listing_id = $1
     ORDER BY amount DESC
     LIMIT 1`,
    [listingId],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Dispute helpers
// ---------------------------------------------------------------------------

export async function dbFileDispute(opts: {
  escrow_id: string;
  filed_by: string;
  category: string;
  reason: string;
  description?: string;
}): Promise<string> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  const id = randomUUID();
  await pool.query(
    `INSERT INTO dispute_mcp.disputes
       (dispute_id, escrow_id, filed_by, category, reason, description, status, tier)
     VALUES ($1, $2, $3, $4, $5, $6, 'open', 'tier_1_negotiation')`,
    [id, opts.escrow_id, opts.filed_by, opts.category, opts.reason, opts.description ?? ""],
  );
  return id;
}

export async function dbGetDispute(disputeId: string): Promise<Record<string, unknown> | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT * FROM dispute_mcp.disputes WHERE dispute_id = $1 LIMIT 1`,
    [disputeId],
  );
  return rows[0] ?? null;
}

export async function dbUpdateDisputeStatus(disputeId: string, status: string, tier?: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  if (tier) {
    await pool.query(
      `UPDATE dispute_mcp.disputes SET status = $1, tier = $2, updated_at = now() WHERE dispute_id = $3`,
      [status, tier, disputeId],
    );
  } else {
    await pool.query(
      `UPDATE dispute_mcp.disputes SET status = $1, updated_at = now() WHERE dispute_id = $2`,
      [status, disputeId],
    );
  }
}

// ---------------------------------------------------------------------------
// Contracts helpers
// ---------------------------------------------------------------------------

export async function dbCreateContract(opts: {
  buyer_id: string;
  seller_id: string;
  contract_type?: string;
  terms?: Record<string, unknown>;
}): Promise<string> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  const id = randomUUID();
  await pool.query(
    `INSERT INTO contracts_mcp.contracts
       (contract_id, buyer_id, seller_id, contract_type, terms, status)
     VALUES ($1, $2, $3, $4, $5, 'draft')`,
    [id, opts.buyer_id, opts.seller_id, opts.contract_type ?? "standing", JSON.stringify(opts.terms ?? {})],
  );
  return id;
}

export async function dbGetContract(contractId: string): Promise<Record<string, unknown> | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT * FROM contracts_mcp.contracts WHERE contract_id = $1 LIMIT 1`,
    [contractId],
  );
  return rows[0] ?? null;
}

export async function dbListContracts(userId: string): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT contract_id, buyer_id, seller_id, contract_type, status, created_at
     FROM contracts_mcp.contracts
     WHERE buyer_id = $1 OR seller_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Analytics helpers
// ---------------------------------------------------------------------------

export async function dbGetDashboardStats(): Promise<Record<string, number> | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM auth_mcp.users)                                   AS total_users,
      (SELECT COUNT(*)::int FROM listing_mcp.listings)                             AS total_listings,
      (SELECT COUNT(*)::int FROM orders_mcp.orders)                                AS total_orders,
      (SELECT COALESCE(SUM(amount),0)::numeric FROM payments_mcp.transactions
         WHERE status = 'completed' AND transaction_type = 'commission')           AS total_revenue,
      (SELECT COUNT(*)::int FROM auth_mcp.users
         WHERE last_login_at > now() - interval '30 days')                        AS active_users_30d,
      (SELECT COUNT(*)::int FROM listing_mcp.listings
         WHERE created_at > now() - interval '7 days')                            AS new_listings_7d
  `);
  return rows[0] ?? null;
}

/** Dashboard home stats: platform-wide plus user-scoped overlays (matches analytics HTTP adapter). */
export async function dbGetUserDashboardStats(userId: string): Promise<Record<string, unknown> | null> {
  const pool = getPool();
  if (!pool) return null;

  const [
    listingsRes,
    usersRes,
    escrowHeldRes,
    auctionsRes,
    escrowCountRes,
    ordersPendingRes,
    ordersTransitRes,
    wowRes,
  ] = await Promise.all([
    pool.query(`select count(*)::int as cnt from listing_mcp.listings where status='active'`),
    pool.query(`select count(*)::int as cnt from auth_mcp.users`),
    pool.query(
      `select coalesce(sum(held_amount),0)::numeric as total from escrow_mcp.escrows where status='funds_held'`,
    ),
    pool.query(`select count(*)::int as cnt from auction_mcp.auctions where status='live'`),
    pool.query(
      `select count(*)::int as cnt from escrow_mcp.escrows where status in ('created','funds_held')`,
    ),
    pool.query(
      `select count(*)::int as cnt from orders_mcp.orders where status in ('pending','confirmed')`,
    ),
    pool.query(
      `select count(*)::int as cnt from orders_mcp.orders where status in ('shipped','delivered')`,
    ),
    pool.query(`
      with w as (
        select
          (select count(*)::int from listing_mcp.listings where created_at >= now() - interval '7 days') as n0,
          (select count(*)::int from listing_mcp.listings where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days') as n1
      )
      select case when n1 = 0 then null else round(((n0 - n1)::numeric / n1) * 100, 1) end as pct from w
    `),
  ]);

  const base: Record<string, unknown> = {
    active_listings: Number(listingsRes.rows[0]?.cnt ?? 0),
    total_users: Number(usersRes.rows[0]?.cnt ?? 0),
    escrow_held: Number(escrowHeldRes.rows[0]?.total ?? 0),
    active_escrows: Number(escrowCountRes.rows[0]?.cnt ?? 0),
    active_auctions: Number(auctionsRes.rows[0]?.cnt ?? 0),
    listings_change_pct: wowRes.rows[0]?.pct != null ? Number(wowRes.rows[0].pct) : null,
    orders_pending_action: Number(ordersPendingRes.rows[0]?.cnt ?? 0),
    orders_in_transit: Number(ordersTransitRes.rows[0]?.cnt ?? 0),
  };

  const uid = userId;
  const [
    myListings,
    myEscrowHeld,
    myEscrowCount,
    myOrdersPend,
    myOrdersTransit,
    myWow,
    mySpark,
    myBids,
  ] = await Promise.all([
    pool.query(
      `select count(*)::int as cnt from listing_mcp.listings where seller_id=$1::uuid and status='active'`,
      [uid],
    ),
    pool.query(
      `select coalesce(sum(held_amount),0)::numeric as total from escrow_mcp.escrows where status='funds_held' and (buyer_id=$1::uuid or seller_id=$1::uuid)`,
      [uid],
    ),
    pool.query(
      `select count(*)::int as cnt from escrow_mcp.escrows where status in ('created','funds_held') and (buyer_id=$1::uuid or seller_id=$1::uuid)`,
      [uid],
    ),
    pool.query(
      `select count(*)::int as cnt from orders_mcp.orders where (buyer_id=$1::uuid or seller_id=$1::uuid) and status in ('pending','confirmed')`,
      [uid],
    ),
    pool.query(
      `select count(*)::int as cnt from orders_mcp.orders where (buyer_id=$1::uuid or seller_id=$1::uuid) and status in ('shipped','delivered')`,
      [uid],
    ),
    pool.query(
      `with w as (
         select
           (select count(*)::int from listing_mcp.listings where seller_id=$1::uuid and created_at >= now() - interval '7 days') as n0,
           (select count(*)::int from listing_mcp.listings where seller_id=$1::uuid and created_at >= now() - interval '14 days' and created_at < now() - interval '7 days') as n1
       )
       select case when n1 = 0 then null else round(((n0 - n1)::numeric / n1) * 100, 1) end as pct from w`,
      [uid],
    ),
    pool.query(
      `select coalesce(array_agg(cnt order by d), array_fill(0, array[7])) as arr from (
         select gs::date as d,
                (select count(*)::int from listing_mcp.listings l
                 where l.seller_id = $1::uuid and l.created_at::date = gs::date) as cnt
         from generate_series((current_date - 6), current_date, interval '1 day') as gs
       ) q`,
      [uid],
    ),
    pool.query(
      `select count(*)::int as cnt from bidding_mcp.bids where bidder_id=$1::uuid and status='active'`,
      [uid],
    ),
  ]);

  const sparkRaw = mySpark.rows[0]?.arr as number[] | undefined;
  return {
    ...base,
    active_listings: Number(myListings.rows[0]?.cnt ?? 0),
    escrow_held: Number(myEscrowHeld.rows[0]?.total ?? 0),
    active_escrows: Number(myEscrowCount.rows[0]?.cnt ?? 0),
    listings_change_pct: myWow.rows[0]?.pct != null ? Number(myWow.rows[0].pct) : null,
    orders_pending_action: Number(myOrdersPend.rows[0]?.cnt ?? 0),
    orders_in_transit: Number(myOrdersTransit.rows[0]?.cnt ?? 0),
    listings_spark_7d: Array.isArray(sparkRaw) ? sparkRaw : null,
    active_bids: Number(myBids.rows[0]?.cnt ?? 0),
  };
}

export async function dbGetRevenueReport(period: string): Promise<Record<string, unknown>> {
  const pool = getPool();
  if (!pool) return { period, transactions: 0, volume: 0, commission_estimate: 0 };
  const interval = period === "7d" ? "7 days" : period === "90d" ? "90 days" : "30 days";
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int                                                      AS transactions,
       COALESCE(SUM(amount), 0)::numeric                                  AS volume,
       COALESCE(SUM(amount) * 0.025, 0)::numeric                         AS commission_estimate
     FROM payments_mcp.transactions
     WHERE status = 'completed'
       AND transaction_type = 'purchase'
       AND created_at > now() - $1::interval`,
    [interval],
  );
  return { period, ...(rows[0] ?? { transactions: 0, volume: 0, commission_estimate: 0 }) };
}

export async function dbGetConversionFunnel(): Promise<Record<string, number>> {
  const pool = getPool();
  if (!pool) return { listings: 0, searches: 0, threads: 0, orders: 0 };
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM listing_mcp.listings)            AS listings,
      0                                                           AS searches,
      (SELECT COUNT(*)::int FROM messaging_mcp.threads)           AS threads,
      (SELECT COUNT(*)::int FROM orders_mcp.orders)               AS orders
  `);
  return rows[0] ?? { listings: 0, searches: 0, threads: 0, orders: 0 };
}

// ---------------------------------------------------------------------------
// Admin helpers
// ---------------------------------------------------------------------------

export async function dbGrantPlatformAdmin(userId: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  await pool.query(
    `UPDATE auth_mcp.users SET is_platform_admin = true WHERE user_id = $1`,
    [userId],
  );
}

export async function dbRevokePlatformAdmin(userId: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  await pool.query(
    `UPDATE auth_mcp.users SET is_platform_admin = false WHERE user_id = $1`,
    [userId],
  );
}

export async function dbGetPlatformConfig(): Promise<Array<{ config_key: string; config_value: string; updated_at: string }>> {
  const pool = getPool();
  if (!pool) return [];
  const { rows } = await pool.query(
    `SELECT config_key, config_value, updated_at
     FROM log_mcp.platform_config
     ORDER BY config_key`,
  );
  return rows;
}

export async function dbSetPlatformConfig(key: string, value: string): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error("No database connection");
  await pool.query(
    `INSERT INTO log_mcp.platform_config (config_key, config_value)
     VALUES ($1, $2)
     ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = now()`,
    [key, value],
  );
}
