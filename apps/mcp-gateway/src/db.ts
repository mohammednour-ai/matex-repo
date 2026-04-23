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
  for (const col of cols) {
    if (fields[col] !== undefined) {
      values.push(col === "search_prefs" ? JSON.stringify(fields[col]) : fields[col]);
      setClauses.push(`${col} = $${values.length}`);
    }
  }
  if (setClauses.length === 0) return;
  await pool.query(
    `INSERT INTO profile_mcp.profiles (user_id, ${cols.filter((c) => fields[c] !== undefined).join(", ")})
     VALUES ($1, ${values.slice(1).map((_, i) => `$${i + 2}`).join(", ")})
     ON CONFLICT (user_id) DO UPDATE SET ${setClauses.join(", ")}, updated_at = now()`,
    values,
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

export async function dbSearchListings(query: string, limit = 20): Promise<Record<string, unknown>[]> {
  const pool = getPool();
  if (!pool) return [];
  const q = `%${query.toLowerCase()}%`;
  const { rows } = await pool.query(
    `SELECT listing_id, title, description, asking_price, category, quantity, unit
     FROM listing_mcp.listings
     WHERE status = 'active' AND (lower(title) LIKE $1 OR lower(description) LIKE $1 OR $2 = '%%')
     ORDER BY created_at DESC
     LIMIT $3`,
    [q, q, limit],
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
      (SELECT COUNT(*) FROM auth_mcp.users)::int                             AS total_users,
      (SELECT COUNT(*) FROM listing_mcp.listings)::int                       AS total_listings,
      (SELECT COUNT(*) FROM orders_mcp.orders)::int                          AS total_orders,
      (SELECT COALESCE(SUM(amount),0) FROM payments_mcp.transactions
         WHERE status = 'completed')::numeric                                 AS total_revenue,
      (SELECT COUNT(*) FROM auth_mcp.users
         WHERE last_seen_at > now() - interval '30 days')::int               AS active_users_30d,
      (SELECT COUNT(*) FROM listing_mcp.listings
         WHERE created_at > now() - interval '7 days')::int                  AS new_listings_7d
  `);
  return rows[0] ?? null;
}
