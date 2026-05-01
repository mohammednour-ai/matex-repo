import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import * as jwt from "jsonwebtoken";
import {
  checkEnvironmentalPermitExpiry,
  getChainOfCustodyRequirements,
  validateBookingLeadTime,
  validateCAWScaleCertificate,
  checkTheftPreventionCoolingPeriod,
} from "../../utils/src/operational-rules";

// ---------------------------------------------------------------------------
// Third-party bridge helpers (env-var gated: stub when keys absent)
// ---------------------------------------------------------------------------

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim();
const STRIPE_API = "https://api.stripe.com/v1";

async function stripePost(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  return response.json() as Promise<Record<string, unknown>>;
}

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY?.trim();
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? "noreply@matex.ca";
const SENDGRID_FROM_NAME = process.env.SENDGRID_FROM_NAME ?? "Matex";
const SENDGRID_API = "https://api.sendgrid.com/v3";

async function sgSend(to: string, subject: string, text: string, html?: string): Promise<boolean> {
  if (!SENDGRID_API_KEY) return false;
  const response = await fetch(`${SENDGRID_API}/mail/send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${SENDGRID_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: SENDGRID_FROM_EMAIL, name: SENDGRID_FROM_NAME },
      subject,
      content: [
        { type: "text/plain", value: text },
        ...(html ? [{ type: "text/html", value: html }] : []),
      ],
    }),
  });
  return response.status === 202;
}

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID?.trim();
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim();
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER?.trim();

async function twilioSendSms(to: string, body: string): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) return false;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: TWILIO_PHONE_NUMBER, Body: body }).toString(),
  });
  return response.ok;
}

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const JWT_ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_TOKEN_EXPIRY ?? "15m";
const JWT_REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_TOKEN_EXPIRY ?? "7d";

function parseExpirySeconds(value: string, fallbackSeconds: number): number {
  const raw = value.trim();
  const num = Number(raw);
  if (Number.isFinite(num) && num > 0) return Math.floor(num);
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

const ACCESS_TOKEN_TTL_SEC = parseExpirySeconds(JWT_ACCESS_TOKEN_EXPIRY, 900);
const REFRESH_TOKEN_TTL_SEC = parseExpirySeconds(JWT_REFRESH_TOKEN_EXPIRY, 604800);

function signJwt(payload: Record<string, string | number>, expiresInSec: number): string {
  return jwt.sign(payload, JWT_SECRET as jwt.Secret, { expiresIn: expiresInSec });
}

const { Pool } = pg;

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

type AdapterRequest = {
  tool: string;
  args?: Record<string, JsonValue>;
  auth?: Record<string, JsonValue>;
};

type AdapterResponse = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
};

function ok(data: Record<string, unknown>): AdapterResponse {
  return { success: true, data };
}

function err(code: string, message: string): AdapterResponse {
  return { success: false, error: { code, message } };
}

function json(res: import("node:http").ServerResponse, status: number, payload: AdapterResponse): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readBody(req: import("node:http").IncomingMessage): Promise<AdapterRequest | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as AdapterRequest;
  } catch {
    return null;
  }
}

function createPool(): pg.Pool | null {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) return null;
  return new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 20 });
}

let matexAuxTablesEnsured = false;
async function ensureMatexAuxTables(pool: pg.Pool): Promise<boolean> {
  if (matexAuxTablesEnsured) return true;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.matex_platform_config (
        config_key TEXT PRIMARY KEY,
        config_value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS public.matex_admin_operators (
        user_id UUID PRIMARY KEY
      );
    `);
    matexAuxTablesEnsured = true;
    return true;
  } catch {
    return false;
  }
}

const VALID_ACCOUNT_STATUS = new Set(["active", "suspended", "pending_review", "deactivated", "banned"]);
const VALID_ACCOUNT_TYPE = new Set(["individual", "corporate", "carrier", "inspector"]);
const VALID_LISTING_STATUS = new Set(["draft", "pending_review", "active", "sold", "expired", "cancelled", "suspended"]);

function asUuidOrNew(value: unknown): string {
  const v = String(value ?? "");
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRe.test(v) ? v : randomUUID();
}

type SaleModeUi = "fixed" | "bidding" | "auction";

function saleModeFromPriceType(pt: string): SaleModeUi {
  const p = (pt || "fixed").toLowerCase();
  if (p === "auction") return "auction";
  if (p === "negotiable") return "bidding";
  return "fixed";
}

function pickupProvince(addr: unknown): string {
  if (addr && typeof addr === "object" && "province" in addr) {
    return String((addr as { province?: string }).province ?? "ON").slice(0, 2).toUpperCase();
  }
  return "ON";
}

function imageUrlsFromJson(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((img) =>
      typeof img === "object" && img && "url" in img ? String((img as { url: string }).url) : String(img),
    )
    .filter((u) => u.length > 0);
}

/** Map DB listing_status to My Listings UI tabs */
function mapUiListingStatus(dbStatus: string): string {
  if (dbStatus === "cancelled" || dbStatus === "suspended") return "archived";
  if (dbStatus === "expired") return "ended";
  if (dbStatus === "pending_review") return "draft";
  return dbStatus;
}

function mapListingRowForMyListings(row: Record<string, unknown>): Record<string, unknown> {
  const imgs = imageUrlsFromJson(row.images);
  return {
    ...row,
    sale_mode: saleModeFromPriceType(String(row.price_type ?? "fixed")),
    thumbnail_url: imgs[0],
    view_count: Number(row.views_count ?? 0),
    bids_count: 0,
    category: row.category_name ?? undefined,
    status: mapUiListingStatus(String(row.status ?? "draft")),
    asking_price: row.asking_price != null ? Number(row.asking_price) : undefined,
  };
}

function mapListingRowForSearch(row: Record<string, unknown>): Record<string, unknown> {
  const addr = row.pickup_address;
  const priceType = String(row.price_type ?? "fixed");
  const asking = Number(row.asking_price ?? 0);
  return {
    listing_id: row.listing_id,
    title: row.title,
    sale_mode: saleModeFromPriceType(priceType),
    price: asking,
    unit: row.unit,
    quantity: Number(row.quantity ?? 0),
    material_grade: String(row.quality_grade ?? "—"),
    seller_province: pickupProvince(addr),
    inspection_required: Boolean(row.inspection_required),
    photo_url: imageUrlsFromJson(row.images)[0],
    created_at: row.created_at,
    currency: "CAD",
    bid_count: 0,
    current_bid: asking,
  };
}

function mapListingRowForDetail(row: Record<string, unknown>): Record<string, unknown> {
  const imgs = imageUrlsFromJson(row.images);
  const addr = row.pickup_address;
  const qd = row.quality_details;
  const qc = qd && typeof qd === "object" ? (qd as Record<string, unknown>) : {};
  const company = row.company_name ? String(row.company_name) : "";
  const fn = String(row.first_name ?? "");
  const ln = String(row.last_name ?? "");
  const display = String(row.display_name ?? "").trim();
  const sellerName = company || display || `${fn} ${ln}`.trim() || "Seller";

  return {
    listing_id: row.listing_id,
    title: row.title,
    description: String(row.description ?? ""),
    sale_mode: saleModeFromPriceType(String(row.price_type ?? "fixed")),
    price: Number(row.asking_price ?? 0),
    unit: String(row.unit ?? "kg"),
    quantity: Number(row.quantity ?? 0),
    currency: "CAD",
    material_category: String(row.category_name ?? "Materials"),
    material_grade: String(row.quality_grade ?? "—"),
    contamination_pct: Number(qc.contamination_pct ?? 0),
    moisture_pct: Number(qc.moisture_pct ?? 0),
    hazmat_class: "none",
    inspection_required: Boolean(row.inspection_required),
    seller_id: row.seller_id,
    seller_name: sellerName,
    seller_province: pickupProvince(addr),
    seller_kyc_level: 2,
    seller_pis_score: 88,
    created_at: String(row.created_at ?? new Date().toISOString()),
    photos: imgs,
    video_url: undefined,
    certifications: Array.isArray(row.certifications) ? row.certifications : [],
    chain_of_custody: "",
    environmental_classification: "standard",
    environmental_permits: Array.isArray(row.environmental_permits) ? row.environmental_permits : [],
    asking_price: row.asking_price,
    status: row.status,
  };
}

async function ensureOrder(pool: pg.Pool, orderId: string, userId: string): Promise<string> {
  const existing = (await pool.query(`select order_id from orders_mcp.orders where order_id=$1`, [orderId])).rows[0];
  if (existing) return orderId;
  const listingId = String(
    (await pool.query(`select listing_id from listing_mcp.listings order by created_at desc limit 1`)).rows[0]?.listing_id ?? "",
  );
  if (!listingId) throw new Error("At least one listing must exist to create an order.");
  await pool.query(
    `insert into orders_mcp.orders (order_id,listing_id,buyer_id,seller_id,original_amount,quantity,unit,commission_rate,currency,status)
     values ($1,$2,$3,$3,1000,1,'kg',0.035,'CAD','pending')
     on conflict (order_id) do nothing`,
    [orderId, listingId, userId],
  );
  return orderId;
}

async function handleTool(pool: pg.Pool, tool: string, args: Record<string, unknown>): Promise<AdapterResponse> {
  // auth
  if (tool === "auth.register") {
    const email = String(args.email ?? "").toLowerCase().trim();
    const phone = String(args.phone ?? "").trim();
    const password = String(args.password ?? "");
    if (!email || !phone || !password) return err("VALIDATION_ERROR", "email, phone, password are required.");
    const userId = randomUUID();
    await pool.query(
      `insert into auth_mcp.users
        (user_id,email,phone,password_hash,account_type,account_status,email_verified,phone_verified,mfa_enabled)
       values ($1,$2,$3,$4,'individual','pending_review',false,false,false)`,
      [userId, email, phone, password],
    );
    return ok({ user: { user_id: userId, email, phone }, status: "pending_review" });
  }
  if (tool === "auth.login") {
    const email = String(args.email ?? "").toLowerCase().trim();
    const password = String(args.password ?? "");
    if (!email || !password) return err("VALIDATION_ERROR", "email and password are required.");
    const row = await pool.query(
      `select user_id, password_hash, account_type::text as account_type, account_status::text as account_status
       from auth_mcp.users where email = $1 limit 1`,
      [email],
    );
    const user = row.rows[0];
    if (!user) return err("AUTH_ERROR", "Invalid credentials.");
    if (user.password_hash !== password && user.password_hash !== createHash("sha256").update(password).digest("hex")) {
      return err("AUTH_ERROR", "Invalid credentials.");
    }
    const userId = String(user.user_id);
    const accessToken = signJwt({ sub: userId, scope: "access" }, ACCESS_TOKEN_TTL_SEC);
    const refreshToken = signJwt({ sub: userId, scope: "refresh" }, REFRESH_TOKEN_TTL_SEC);
    let is_platform_admin = false;
    const auxOk = await ensureMatexAuxTables(pool);
    if (auxOk) {
      const adm = await pool.query(`select 1 from public.matex_admin_operators where user_id = $1 limit 1`, [userId]);
      is_platform_admin = (adm.rowCount ?? 0) > 0;
    }
    return ok({
      user_id: userId,
      account_type: String(user.account_type ?? "individual"),
      account_status: String(user.account_status ?? "pending_review"),
      is_platform_admin,
      tokens: { access_token: accessToken, refresh_token: refreshToken, expires_in: ACCESS_TOKEN_TTL_SEC },
    });
  }

  // listing/search
  if (tool === "listing.create_listing") {
    if (Array.isArray(args.environmental_permits) && args.environmental_permits.length > 0) {
      const permitCheck = checkEnvironmentalPermitExpiry(args.environmental_permits as Array<{ expiry: string }>);
      if (permitCheck.expired) return err("PERMIT_EXPIRED", "Listing cannot be published with expired environmental permits.");
    }
    if (args.seller_is_first_time && args.material_category) {
      const cooling = checkTheftPreventionCoolingPeriod(true, String(args.material_category), new Date().toISOString());
      if (cooling.blocked) return err("COOLING_PERIOD", cooling.reason ?? "72-hour cooling period active.");
    }
    if (typeof args.asking_price === "number") {
      const custody = getChainOfCustodyRequirements(Number(args.asking_price));
      args._chain_of_custody_level = custody.level;
      args._mandatory_inspection = custody.mandatory_inspection;
    }
    const listingId = randomUUID();
    let categoryId = String(args.category_id ?? "");
    if (!categoryId) {
      categoryId = String(
        (await pool.query(`select category_id from listing_mcp.categories order by created_at asc limit 1`)).rows[0]
          ?.category_id ?? "",
      );
    }
    if (!categoryId) {
      categoryId = randomUUID();
      await pool.query(
        `insert into listing_mcp.categories (category_id, name, slug, description, default_unit, is_active)
         values ($1,'General Metals','general-metals','Auto-created by HTTP adapter','kg',true)`,
        [categoryId],
      );
    }
    await pool.query(
      `insert into listing_mcp.listings
       (listing_id,seller_id,title,slug,category_id,description,quantity,unit,price_type,asking_price,images,location,pickup_address,status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'[]'::jsonb,ST_SetSRID(ST_MakePoint(-79.3832,43.6532),4326)::geography,$11::jsonb,'draft')`,
      [
        listingId,
        String(args.seller_id ?? ""),
        String(args.title ?? ""),
        `listing-${listingId.slice(0, 8)}`,
        categoryId,
        String(args.description ?? ""),
        Number(args.quantity ?? 1),
        String(args.unit ?? "kg"),
        String(args.price_type ?? "fixed"),
        Number(args.asking_price ?? 0),
        JSON.stringify({ city: "Toronto", province: "ON", country: "CA" }),
      ],
    );
    return ok({ listing_id: listingId, status: "draft" });
  }
  if (tool === "listing.publish_listing") {
    const result = await pool.query(
      `update listing_mcp.listings set status='active',published_at=now() where listing_id=$1 returning listing_id,status,published_at`,
      [String(args.listing_id ?? "")],
    );
    return ok(result.rows[0] ?? {});
  }
  if (tool === "search.search_materials") {
    const q = String(args.query ?? "").trim();
    const pattern = `%${q}%`;
    const result = await pool.query(
      `select l.*, c.name as category_name
       from listing_mcp.listings l
       join listing_mcp.categories c on c.category_id = l.category_id
       where l.status = 'active'
         and ($1 = '' or l.title ilike $2 or l.description ilike $2)
       order by l.created_at desc
       limit 100`,
      [q, pattern],
    );
    const rows = result.rows.map((row: unknown) => mapListingRowForSearch(row as Record<string, unknown>));
    return ok({ results: rows, total: rows.length });
  }

  // messaging
  if (tool === "messaging.create_thread") {
    const threadId = randomUUID();
    const participants = Array.isArray(args.participants) ? args.participants.map(String) : [];
    await pool.query(
      `insert into messaging_mcp.threads (thread_id, listing_id, subject, participants, thread_type)
       values ($1,$2,$3,$4::uuid[],'general')`,
      [threadId, args.listing_id ? String(args.listing_id) : null, args.subject ? String(args.subject) : null, participants],
    );
    return ok({ thread_id: threadId });
  }
  if (tool === "messaging.send_message") {
    const messageId = randomUUID();
    await pool.query(
      `insert into messaging_mcp.messages (message_id, thread_id, sender_id, content, created_at)
       values ($1,$2,$3,$4,now())`,
      [messageId, String(args.thread_id ?? ""), String(args.sender_id ?? ""), String(args.content ?? "")],
    );
    return ok({ message_id: messageId });
  }

  // payments
  if (tool === "payments.process_payment") {
    const transactionId = randomUUID();
    const amount = Number(args.amount ?? 0);
    let stripePaymentIntentId: string | null = null;
    let paymentStatus = "completed";

    if (STRIPE_SECRET_KEY && amount > 0) {
      try {
        const amountCents = Math.round(amount * 100);
        const pi = await stripePost("/payment_intents", {
          amount: String(amountCents),
          currency: "cad",
          automatic_payment_methods: JSON.stringify({ enabled: true }),
          metadata: JSON.stringify({ matex_transaction_id: transactionId }),
        });
        stripePaymentIntentId = pi.id as string;
        paymentStatus = (pi.status as string) === "succeeded" ? "completed" : "processing";
      } catch (stripeErr) {
        console.error("[stripe] process_payment error:", stripeErr);
      }
    }

    await pool.query(
      `insert into payments_mcp.transactions
        (transaction_id,payer_id,amount,original_amount,currency,payment_method,transaction_type,status,metadata)
       values ($1,$2,$3,$3,'CAD',$4,'purchase',$5,$6::jsonb)`,
      [
        transactionId,
        String(args.user_id ?? ""),
        amount,
        String(args.method ?? "stripe_card"),
        paymentStatus,
        JSON.stringify(stripePaymentIntentId ? { stripe_payment_intent_id: stripePaymentIntentId } : {}),
      ],
    );
    return ok({ transaction: { transaction_id: transactionId, amount, status: paymentStatus, stripe_payment_intent_id: stripePaymentIntentId } });
  }

  // phase2: kyc
  if (tool === "kyc.start_verification") {
    const verificationId = randomUUID();
    await pool.query(
      `insert into kyc_mcp.verifications (verification_id,user_id,target_level,current_status,submitted_at)
       values ($1,$2,$3,'pending',now())`,
      [verificationId, String(args.user_id ?? ""), String(args.target_level ?? "level_2")],
    );
    return ok({ verification_id: verificationId, status: "pending" });
  }
  if (tool === "kyc.review_verification") {
    await pool.query(
      `update kyc_mcp.verifications set current_status=$2,reviewed_at=now(),verified_at=now() where verification_id=$1`,
      [String(args.verification_id ?? ""), String(args.status ?? "verified")],
    );
    return ok({ verification_id: String(args.verification_id ?? ""), status: String(args.status ?? "verified") });
  }

  // phase2: escrow
  if (tool === "escrow.create_escrow") {
    const escrowId = randomUUID();
    const orderId = asUuidOrNew(args.order_id);
    const listingId = String(args.listing_id ?? "");
    const buyerId = String(args.buyer_id ?? "");
    const sellerId = String(args.seller_id ?? "");
    const amount = Number(args.amount ?? 0);
    const sourceListingId =
      listingId ||
      String((await pool.query(`select listing_id from listing_mcp.listings order by created_at desc limit 1`)).rows[0]?.listing_id ?? "");
    if (!sourceListingId) return err("VALIDATION_ERROR", "listing_id required or at least one listing must exist.");
    await pool.query(
      `insert into orders_mcp.orders
        (order_id,listing_id,buyer_id,seller_id,original_amount,quantity,unit,commission_rate,currency,status)
       values ($1,$2,$3,$4,$5,1,'kg',0.035,'CAD','pending')
       on conflict (order_id) do nothing`,
      [orderId, sourceListingId, buyerId, sellerId, amount],
    );
    await pool.query(
      `insert into escrow_mcp.escrows
        (escrow_id,order_id,buyer_id,seller_id,original_amount,held_amount,released_amount,refunded_amount,currency,status)
       values ($1,$2,$3,$4,$5,0,0,0,'CAD','created')`,
      [escrowId, orderId, buyerId, sellerId, amount],
    );
    return ok({ escrow_id: escrowId, order_id: orderId, status: "created" });
  }
  if (tool === "escrow.hold_funds") {
    await pool.query(
      `update escrow_mcp.escrows set status='funds_held',held_amount=held_amount+$2,updated_at=now() where escrow_id=$1`,
      [String(args.escrow_id ?? ""), Number(args.amount ?? 100)],
    );
    return ok({ escrow_id: String(args.escrow_id ?? ""), status: "funds_held" });
  }
  if (tool === "escrow.release_funds") {
    await pool.query(
      `update escrow_mcp.escrows set status='released',held_amount=greatest(0,held_amount-$2),released_amount=released_amount+$2,released_at=now(),updated_at=now() where escrow_id=$1`,
      [String(args.escrow_id ?? ""), Number(args.amount ?? 100)],
    );
    return ok({ escrow_id: String(args.escrow_id ?? ""), status: "released" });
  }

  // phase2: auction
  if (tool === "auction.create_auction") {
    const auctionId = randomUUID();
    await pool.query(
      `insert into auction_mcp.auctions (auction_id,organizer_id,title,status,scheduled_start,min_bid_increment)
       values ($1,$2,$3,'scheduled',now() + interval '5 minutes',1)`,
      [auctionId, String(args.organizer_id ?? args.seller_id ?? ""), String(args.title ?? "")],
    );
    return ok({ auction_id: auctionId, status: "scheduled" });
  }
  if (tool === "auction.add_lot") {
    const lotId = randomUUID();
    const lotNumber = Number(
      (await pool.query(`select coalesce(max(lot_number),0)+1 as lot_number from auction_mcp.lots where auction_id = $1`, [String(args.auction_id ?? "")]))
        .rows[0]?.lot_number ?? 1,
    );
    await pool.query(
      `insert into auction_mcp.lots (lot_id,auction_id,listing_id,lot_number,status,starting_price,reserve_price,total_bids,extensions_used)
       values ($1,$2,$3,$4,'open',$5,$6,0,0)`,
      [lotId, String(args.auction_id ?? ""), String(args.listing_id ?? ""), lotNumber, Number(args.starting_price ?? 2500), Number(args.reserve_price ?? 3000)],
    );
    return ok({ lot_id: lotId, lot_number: lotNumber });
  }
  if (tool === "auction.place_auction_bid") {
    const lotId = String(args.lot_id ?? "");
    const lot = (await pool.query(`select listing_id,current_highest_bid,starting_price from auction_mcp.lots where lot_id = $1 limit 1`, [lotId])).rows[0];
    if (!lot) return err("NOT_FOUND", "lot not found");
    const currentHighest = Number(lot.current_highest_bid ?? lot.starting_price ?? 0);
    const expected = args.expected_highest === undefined ? null : Number(args.expected_highest);
    if (expected !== null && expected !== currentHighest) return err("OPTIMISTIC_CONCURRENCY_CONFLICT", `Expected highest ${expected}, current ${currentHighest}.`);
    const bidId = randomUUID();
    const amount = Number(args.amount ?? 0);
    await pool.query(
      `insert into bidding_mcp.bids (bid_id,listing_id,bidder_id,amount,bid_type,status,server_timestamp)
       values ($1,$2,$3,$4,'manual','active',now())`,
      [bidId, String(lot.listing_id), String(args.bidder_id ?? ""), amount],
    );
    const updated = await pool.query(
      `update auction_mcp.lots
       set current_highest_bid=$2,highest_bidder_id=$3,total_bids=total_bids+1
       where lot_id=$1 and current_highest_bid is not distinct from $4
       returning lot_id`,
      [lotId, amount, String(args.bidder_id ?? ""), lot.current_highest_bid ?? null],
    );
    if (!updated.rows[0]) return err("OPTIMISTIC_CONCURRENCY_CONFLICT", "Lot changed, retry.");
    return ok({ bid_id: bidId, lot_id: lotId, amount });
  }

  // phase2: inspection + booking
  if (tool === "inspection.request_inspection") {
    const inspectionId = randomUUID();
    await pool.query(
      `insert into inspection_mcp.inspections (inspection_id,listing_id,requested_by,inspection_type,location,status,result)
       values ($1,$2,$3,'pickup',$4::jsonb,'requested','pending')`,
      [inspectionId, args.listing_id ? String(args.listing_id) : null, String(args.requested_by ?? args.requester_id ?? ""), JSON.stringify({ city: "Toronto", province: "ON" })],
    );
    return ok({ inspection_id: inspectionId, status: "requested" });
  }
  if (tool === "inspection.evaluate_discrepancy") {
    const expected = Number(args.expected_weight ?? args.expected_weight_kg ?? 0);
    const actual = Number(args.actual_weight ?? 0);
    const deltaPct = expected > 0 ? ((actual - expected) / expected) * 100 : 0;
    return ok({ delta_pct: Number(deltaPct.toFixed(2)), exceeded_tolerance: Math.abs(deltaPct) > 2 });
  }
  if (tool === "booking.create_booking") {
    const eventType = String(args.event_type ?? "pickup");
    const scheduledTime = String(args.scheduled_start ?? args.scheduled_for ?? new Date(Date.now() + 3600000).toISOString());
    const leadCheck = validateBookingLeadTime(eventType, scheduledTime);
    if (!leadCheck.valid) {
      return err("LEAD_TIME_VIOLATION", `${eventType} requires ${leadCheck.min_hours}h lead time, only ${leadCheck.actual_hours}h provided.`);
    }
    const bookingId = randomUUID();
    const organizerId = String(args.organizer_id ?? args.user_id ?? "");
    const start = scheduledTime;
    const end = new Date(new Date(start).getTime() + 3600000).toISOString();
    await pool.query(
      `insert into booking_mcp.bookings
        (booking_id,event_type,organizer_id,participants,location,scheduled_start,scheduled_end,status)
       values ($1,'pickup',$2,$3::jsonb,$4::jsonb,$5::timestamptz,$6::timestamptz,'pending')`,
      [bookingId, organizerId, JSON.stringify([{ user_id: organizerId, role: "organizer" }]), JSON.stringify({ city: "Toronto", province: "ON" }), start, end],
    );
    return ok({ booking_id: bookingId, status: "pending" });
  }

  // phase3: logistics
  if (tool === "logistics.get_quotes") {
    const userId = String(args.user_id ?? args.buyer_id ?? "");
    const orderId = await ensureOrder(pool, asUuidOrNew(args.order_id), userId || randomUUID());
    const weightKg = Number(args.weight_kg ?? 1000);
    const distanceKm = Number(args.distance_km ?? 500);

    // Rate model: base + per-km + per-tonne, seeded deterministically from order
    const baseSeed = (distanceKm * 2.1 + weightKg * 0.85);
    const carriers = [
      { name: "Day & Ross", carrier: "day_ross", multiplier: 1.00, transit: Math.max(1, Math.ceil(distanceKm / 600)), co2_kg_per_tonne: 0.124 },
      { name: "Manitoulin Transport", carrier: "manitoulin", multiplier: 1.04, transit: Math.max(1, Math.ceil(distanceKm / 580)), co2_kg_per_tonne: 0.132 },
      { name: "Purolator Freight", carrier: "purolator", multiplier: 1.10, transit: Math.max(1, Math.ceil(distanceKm / 700)), co2_kg_per_tonne: 0.118 },
      { name: "XTL Transport", carrier: "xtl", multiplier: 0.97, transit: Math.max(1, Math.ceil(distanceKm / 560)), co2_kg_per_tonne: 0.138 },
      { name: "Challenger Motor Freight", carrier: "challenger", multiplier: 1.06, transit: Math.max(1, Math.ceil(distanceKm / 620)), co2_kg_per_tonne: 0.121 },
    ].map((c) => {
      const price = Math.round(baseSeed * c.multiplier * 100) / 100;
      const co2 = Math.round((weightKg / 1000) * c.co2_kg_per_tonne * distanceKm * 10) / 10;
      return { name: c.name, carrier: c.carrier, price, currency: "CAD", transit_days: c.transit, co2_kg: co2 };
    });

    for (const c of carriers) {
      const quoteId = randomUUID();
      await pool.query(
        `insert into logistics_mcp.shipping_quotes (quote_id,order_id,carrier_name,carrier_api,price,currency,transit_days,service_type,valid_until)
         values ($1,$2,$3,$4,$5,'CAD',$6,'ltl',now() + interval '24 hours')
         on conflict do nothing`,
        [quoteId, orderId, c.name, c.carrier, c.price, c.transit_days],
      );
    }
    return ok({ order_id: orderId, quotes: carriers });
  }
  if (tool === "logistics.book_shipment") {
    const userId = String(args.user_id ?? args.buyer_id ?? "");
    const orderId = await ensureOrder(pool, asUuidOrNew(args.order_id), userId || randomUUID());
    const shipmentId = randomUUID();
    const carrier = String(args.carrier_name ?? "Day & Ross");
    await pool.query(
      `insert into logistics_mcp.shipments (shipment_id,order_id,carrier_name,carrier_api,origin_address,destination_address,weight_kg,hazmat,status)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,'booked')`,
      [shipmentId, orderId, carrier, String(args.carrier_api ?? "day_ross"),
       JSON.stringify(args.origin ?? { city: "Hamilton", province: "ON" }),
       JSON.stringify(args.destination ?? { city: "Toronto", province: "ON" }),
       Number(args.weight_kg ?? 1000), String(args.hazmat ?? "none")],
    );
    return ok({ shipment_id: shipmentId, status: "booked", carrier });
  }
  if (tool === "logistics.update_tracking") {
    const shipmentId = String(args.shipment_id ?? "");
    const status = String(args.status ?? "in_transit");
    await pool.query(
      `update logistics_mcp.shipments set status=$2,tracking_number=$3,updated_at=now() where shipment_id=$1`,
      [shipmentId, status, String(args.tracking_number ?? `TRK-${Date.now()}`)],
    );
    return ok({ shipment_id: shipmentId, status });
  }
  if (tool === "logistics.get_shipment") {
    const shipmentId = String(args.shipment_id ?? "");
    const row = (await pool.query(`select * from logistics_mcp.shipments where shipment_id=$1`, [shipmentId])).rows[0];
    return ok({ shipment: row ?? null });
  }
  if (tool === "logistics.list_shipments") {
    const userId = String(args.user_id ?? "");
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const params: unknown[] = [];
    const where: string[] = [];
    if (userId) {
      params.push(userId);
      where.push(`(shipper_id = $${params.length} or receiver_id = $${params.length} or booked_by = $${params.length})`);
    }
    params.push(limit);
    const sql = `select * from logistics_mcp.shipments ${where.length ? `where ${where.join(" and ")}` : ""} order by created_at desc limit $${params.length}`;
    const rows = (await pool.query(sql, params)).rows;
    return ok({ shipments: rows, total: rows.length });
  }

  // phase3: contracts
  if (tool === "contracts.create_contract") {
    const contractId = randomUUID();
    const buyerId = String(args.buyer_id ?? "");
    const sellerId = String(args.seller_id ?? "");
    const catId = String(args.material_category_id ?? "");
    let categoryId = catId;
    if (!categoryId) {
      categoryId = String((await pool.query(`select category_id from listing_mcp.categories limit 1`)).rows[0]?.category_id ?? randomUUID());
    }
    await pool.query(
      `insert into contracts_mcp.contracts
        (contract_id,buyer_id,seller_id,contract_type,material_category_id,quality_specs,pricing_model,total_volume,unit,start_date,end_date,status)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10::date,$11::date,'draft')`,
      [contractId, buyerId, sellerId, String(args.contract_type ?? "volume"), categoryId,
       JSON.stringify(args.quality_specs ?? {}), JSON.stringify(args.pricing_model ?? { type: "fixed" }),
       Number(args.total_volume ?? 100), String(args.unit ?? "mt"),
       String(args.start_date ?? new Date().toISOString().slice(0, 10)),
       String(args.end_date ?? new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10))],
    );
    return ok({ contract_id: contractId, status: "draft" });
  }
  if (tool === "contracts.activate_contract") {
    const contractId = String(args.contract_id ?? "");
    await pool.query(`update contracts_mcp.contracts set status='active',activated_at=now(),updated_at=now() where contract_id=$1`, [contractId]);
    return ok({ contract_id: contractId, status: "active" });
  }
  if (tool === "contracts.get_contract") {
    const contractId = String(args.contract_id ?? "");
    const row = (await pool.query(`select * from contracts_mcp.contracts where contract_id=$1`, [contractId])).rows[0];
    return ok({ contract: row ?? null });
  }
  if (tool === "contracts.terminate_contract") {
    const contractId = String(args.contract_id ?? "");
    await pool.query(`update contracts_mcp.contracts set status='terminated',terminated_at=now(),updated_at=now() where contract_id=$1`, [contractId]);
    return ok({ contract_id: contractId, status: "terminated" });
  }
  if (tool === "contracts.list_contracts") {
    const userId = String(args.user_id ?? "");
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const params: unknown[] = [];
    const where: string[] = [];
    if (userId) {
      params.push(userId);
      where.push(`(buyer_id = $${params.length} or seller_id = $${params.length})`);
    }
    params.push(limit);
    const sql = `select * from contracts_mcp.contracts ${where.length ? `where ${where.join(" and ")}` : ""} order by created_at desc limit $${params.length}`;
    const rows = (await pool.query(sql, params)).rows;
    return ok({ contracts: rows, total: rows.length });
  }

  // phase3: dispute
  if (tool === "dispute.file_dispute") {
    const disputeId = randomUUID();
    const filingPartyId = String(args.filing_party_id ?? "");
    const orderId = await ensureOrder(pool, asUuidOrNew(args.order_id), filingPartyId || randomUUID());
    await pool.query(
      `insert into dispute_mcp.disputes
        (dispute_id,order_id,filing_party_id,responding_party_id,category,description,current_tier,status,resolution_deadline)
       values ($1,$2,$3,$4,$5,$6,'tier_1_negotiation','open',now() + interval '14 days')`,
      [disputeId, orderId, String(args.filing_party_id ?? ""), String(args.responding_party_id ?? ""),
       String(args.category ?? "quality"), String(args.description ?? "Dispute filed")],
    );
    return ok({ dispute_id: disputeId, status: "open", tier: "tier_1_negotiation" });
  }
  if (tool === "dispute.submit_evidence") {
    const evidenceId = randomUUID();
    await pool.query(
      `insert into dispute_mcp.evidence (evidence_id,dispute_id,submitted_by,evidence_type,description)
       values ($1,$2,$3,$4,$5)`,
      [evidenceId, String(args.dispute_id ?? ""), String(args.submitted_by ?? ""),
       String(args.evidence_type ?? "document"), String(args.description ?? "")],
    );
    return ok({ evidence_id: evidenceId });
  }
  if (tool === "dispute.escalate_dispute") {
    const disputeId = String(args.dispute_id ?? "");
    const nextTier = String(args.next_tier ?? "tier_2_mediation");
    await pool.query(`update dispute_mcp.disputes set current_tier=$2,status='escalated',updated_at=now() where dispute_id=$1`, [disputeId, nextTier]);
    return ok({ dispute_id: disputeId, tier: nextTier, status: "escalated" });
  }
  if (tool === "dispute.resolve_dispute") {
    const disputeId = String(args.dispute_id ?? "");
    await pool.query(
      `update dispute_mcp.disputes set status='resolved',resolution_summary=$2,resolved_at=now(),updated_at=now() where dispute_id=$1`,
      [disputeId, String(args.resolution_summary ?? "Resolved")],
    );
    return ok({ dispute_id: disputeId, status: "resolved" });
  }
  if (tool === "dispute.get_dispute") {
    const disputeId = String(args.dispute_id ?? "");
    const row = (await pool.query(`select * from dispute_mcp.disputes where dispute_id=$1`, [disputeId])).rows[0];
    const evidence = (await pool.query(`select * from dispute_mcp.evidence where dispute_id=$1 order by created_at`, [disputeId])).rows;
    return ok({ dispute: row ?? null, evidence });
  }

  // phase3: tax
  if (tool === "tax.calculate_tax") {
    const sellerProv = String(args.seller_province ?? "ON").toUpperCase();
    const buyerProv = String(args.buyer_province ?? "ON").toUpperCase();
    const subtotal = Number(args.subtotal ?? 0);
    const rates: Record<string, { gst: number; pst: number; hst: number; qst: number }> = {
      ON: { gst: 0, pst: 0, hst: 0.13, qst: 0 },
      NB: { gst: 0, pst: 0, hst: 0.15, qst: 0 },
      NS: { gst: 0, pst: 0, hst: 0.15, qst: 0 },
      NL: { gst: 0, pst: 0, hst: 0.15, qst: 0 },
      PE: { gst: 0, pst: 0, hst: 0.15, qst: 0 },
      BC: { gst: 0.05, pst: 0.07, hst: 0, qst: 0 },
      AB: { gst: 0.05, pst: 0, hst: 0, qst: 0 },
      SK: { gst: 0.05, pst: 0, hst: 0, qst: 0 },
      MB: { gst: 0.05, pst: 0, hst: 0, qst: 0 },
      QC: { gst: 0.05, pst: 0, hst: 0, qst: 0.09975 },
    };
    const r = rates[buyerProv] ?? rates["ON"]!;
    const gst = Math.round(subtotal * r.gst * 100) / 100;
    const pst = Math.round(subtotal * r.pst * 100) / 100;
    const hst = Math.round(subtotal * r.hst * 100) / 100;
    const qst = Math.round(subtotal * r.qst * 100) / 100;
    const totalTax = Math.round((gst + pst + hst + qst) * 100) / 100;
    return ok({ seller_province: sellerProv, buyer_province: buyerProv, subtotal, gst_amount: gst, pst_amount: pst, hst_amount: hst, qst_amount: qst, total_tax: totalTax, total_amount: Math.round((subtotal + totalTax) * 100) / 100 });
  }
  if (tool === "tax.generate_invoice") {
    const buyerId = String(args.buyer_id ?? "");
    const sellerId = String(args.seller_id ?? "");
    const orderId = await ensureOrder(pool, asUuidOrNew(args.order_id), buyerId || sellerId || randomUUID());
    const subtotal = Number(args.subtotal ?? 0);
    const commission = Math.round(subtotal * 0.035 * 100) / 100;
    const sellerProv = String(args.seller_province ?? "ON").toUpperCase();
    const buyerProv = String(args.buyer_province ?? "ON").toUpperCase();
    const rates: Record<string, { gst: number; pst: number; hst: number; qst: number }> = {
      ON: { gst: 0, pst: 0, hst: 0.13, qst: 0 }, BC: { gst: 0.05, pst: 0.07, hst: 0, qst: 0 },
      AB: { gst: 0.05, pst: 0, hst: 0, qst: 0 }, QC: { gst: 0.05, pst: 0, hst: 0, qst: 0.09975 },
    };
    const r = rates[buyerProv] ?? rates["ON"]!;
    const gst = Math.round(subtotal * r.gst * 100) / 100;
    const pst = Math.round(subtotal * r.pst * 100) / 100;
    const hst = Math.round(subtotal * r.hst * 100) / 100;
    const qst = Math.round(subtotal * r.qst * 100) / 100;
    const totalTax = Math.round((gst + pst + hst + qst) * 100) / 100;
    const totalAmount = Math.round((subtotal + totalTax) * 100) / 100;
    const year = new Date().getFullYear();
    const seqRes = await pool.query(`select count(*)::int as cnt from tax_mcp.invoices where invoice_number like $1`, [`MTX-${year}-%`]);
    const seq = (Number(seqRes.rows[0]?.cnt ?? 0)) + 1;
    const invoiceNumber = `MTX-${year}-${String(seq).padStart(6, "0")}`;
    const invoiceId = randomUUID();
    await pool.query(
      `insert into tax_mcp.invoices
        (invoice_id,invoice_number,order_id,buyer_id,seller_id,subtotal,commission_amount,gst_amount,pst_amount,hst_amount,qst_amount,total_tax,total_amount,seller_province,buyer_province,status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'issued')`,
      [invoiceId, invoiceNumber, orderId, buyerId, sellerId, subtotal, commission, gst, pst, hst, qst, totalTax, totalAmount, sellerProv, buyerProv],
    );
    return ok({ invoice_id: invoiceId, invoice_number: invoiceNumber, total_amount: totalAmount, total_tax: totalTax });
  }
  if (tool === "tax.get_invoice") {
    const invoiceId = String(args.invoice_id ?? "");
    const row = (await pool.query(`select * from tax_mcp.invoices where invoice_id=$1`, [invoiceId])).rows[0];
    return ok({ invoice: row ?? null });
  }

  // phase3: notifications
  if (tool === "notifications.send_notification") {
    const notificationId = randomUUID();
    const channels = Array.isArray(args.channels) ? args.channels.map(String) : ["in_app"];
    const title = String(args.title ?? "Notification");
    const body = String(args.body ?? "");
    const channelsSent: string[] = [];

    // Send email via SendGrid when email channel requested
    if (channels.includes("email") && args.email) {
      const sent = await sgSend(
        String(args.email),
        title,
        body,
        args.html ? String(args.html) : undefined,
      );
      if (sent) channelsSent.push("email");
    }

    // In-app always recorded
    channelsSent.push("in_app");

    await pool.query(
      `insert into notifications_mcp.notifications
        (notification_id,user_id,type,title,body,data,channels_sent,priority)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7::notification_channel[],$8)`,
      [notificationId, String(args.user_id ?? ""), String(args.type ?? "general"),
       title, body,
       JSON.stringify(args.data ?? {}), ["in_app"], String(args.priority ?? "normal")],
    );
    return ok({ notification_id: notificationId, channels_sent: channelsSent });
  }
  if (tool === "notifications.get_notifications") {
    const userId = String(args.user_id ?? "");
    const rows = (await pool.query(
      `select * from notifications_mcp.notifications where user_id=$1 order by created_at desc limit 50`,
      [userId],
    )).rows;
    return ok({ notifications: rows, total: rows.length });
  }
  if (tool === "notifications.mark_read") {
    const notificationId = String(args.notification_id ?? "");
    await pool.query(`update notifications_mcp.notifications set read=true,read_at=now() where notification_id=$1`, [notificationId]);
    return ok({ notification_id: notificationId, read: true });
  }

  // phase4: analytics (cross-schema reads)
  if (tool === "analytics.get_dashboard_stats") {
    const listings = (await pool.query(`select count(*)::int as cnt from listing_mcp.listings where status='active'`)).rows[0]?.cnt ?? 0;
    const users = (await pool.query(`select count(*)::int as cnt from auth_mcp.users`)).rows[0]?.cnt ?? 0;
    const escrowHeld = (await pool.query(`select coalesce(sum(held_amount),0)::numeric as total from escrow_mcp.escrows where status='funds_held'`)).rows[0]?.total ?? 0;
    const auctions = (await pool.query(`select count(*)::int as cnt from auction_mcp.auctions where status='live'`)).rows[0]?.cnt ?? 0;
    const escrowCount = (await pool.query(`select count(*)::int as cnt from escrow_mcp.escrows where status in ('created','funds_held')`)).rows[0]?.cnt ?? 0;
    return ok({
      active_listings: listings,
      total_users: users,
      escrow_held: Number(escrowHeld),
      active_escrows: escrowCount,
      active_auctions: auctions,
      listings_change_pct: null,
      orders_pending_action: 0,
      orders_in_transit: 0,
    });
  }
  if (tool === "analytics.get_revenue_report") {
    const period = String(args.period ?? "30d");
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const result = await pool.query(
      `select count(*)::int as transactions, coalesce(sum(amount),0)::numeric as volume
       from payments_mcp.transactions where status='completed' and created_at > now() - interval '${days} days'`,
    );
    const row = result.rows[0] ?? {};
    return ok({ period, transactions: Number(row.transactions ?? 0), volume: Number(row.volume ?? 0), commission_estimate: Math.round(Number(row.volume ?? 0) * 0.035 * 100) / 100 });
  }

  // phase4: pricing
  if (tool === "pricing.capture_market_price") {
    const priceId = randomUUID();
    await pool.query(
      `insert into pricing_mcp.market_prices (price_id,material,index_source,price,currency,unit,captured_at)
       values ($1,$2,$3,$4,$5,$6,now())`,
      [priceId, String(args.material ?? "copper"), String(args.index_source ?? "lme"),
       Number(args.price ?? 0), String(args.currency ?? "USD"), String(args.unit ?? "mt")],
    );
    return ok({ price_id: priceId });
  }
  if (tool === "pricing.get_market_prices") {
    const material = String(args.material ?? "copper");
    const rows = (await pool.query(
      `select * from pricing_mcp.market_prices where material=$1 order by captured_at desc limit 10`,
      [material],
    )).rows;
    return ok({ prices: rows, total: rows.length });
  }
  if (tool === "pricing.create_price_alert") {
    const alertId = randomUUID();
    await pool.query(
      `insert into pricing_mcp.price_alerts (alert_id,user_id,material,index_source,condition,threshold,is_active)
       values ($1,$2,$3,$4,$5,$6,true)`,
      [alertId, String(args.user_id ?? ""), String(args.material ?? "copper"),
       String(args.index_source ?? "lme"), String(args.condition ?? "above"), Number(args.threshold ?? 0)],
    );
    return ok({ alert_id: alertId });
  }
  if (tool === "pricing.get_price_alerts") {
    const userId = String(args.user_id ?? "");
    const rows = (await pool.query(`select * from pricing_mcp.price_alerts where user_id=$1 order by created_at desc`, [userId])).rows;
    return ok({ alerts: rows, total: rows.length });
  }

  // phase4: credit
  if (tool === "credit.assess_credit") {
    const userId = String(args.user_id ?? "");
    const score = Number(args.score ?? 650);
    const tier = score >= 800 ? "enterprise" : score >= 700 ? "premium" : score >= 600 ? "standard" : score >= 500 ? "basic" : "none";
    const limit = tier === "enterprise" ? 500000 : tier === "premium" ? 200000 : tier === "standard" ? 50000 : tier === "basic" ? 10000 : 0;
    await pool.query(
      `insert into credit_mcp.credit_facilities (user_id,credit_tier,credit_limit,available_credit,matex_credit_score,status,last_assessment_at)
       values ($1,$2,$3,$3,$4,'active',now())
       on conflict (user_id) do update set credit_tier=$2,credit_limit=$3,available_credit=$3,matex_credit_score=$4,status='active',last_assessment_at=now(),updated_at=now()`,
      [userId, tier, limit, score],
    );
    const scoreId = randomUUID();
    await pool.query(
      `insert into credit_mcp.credit_score_history (score_id,user_id,score,factors,calculated_at)
       values ($1,$2,$3,$4::jsonb,now())`,
      [scoreId, userId, score, JSON.stringify(args.factors ?? { payment_history: 0.9, volume: 0.7, pis: 0.85 })],
    );
    return ok({ user_id: userId, credit_tier: tier, credit_limit: limit, matex_credit_score: score });
  }
  if (tool === "credit.get_credit_facility") {
    const userId = String(args.user_id ?? "");
    const row = (await pool.query(`select * from credit_mcp.credit_facilities where user_id=$1`, [userId])).rows[0];
    return ok({ facility: row ?? null });
  }
  if (tool === "credit.get_credit_history") {
    const userId = String(args.user_id ?? "");
    const rows = (await pool.query(`select * from credit_mcp.credit_score_history where user_id=$1 order by calculated_at desc limit 20`, [userId])).rows;
    return ok({ history: rows, total: rows.length });
  }
  if (tool === "credit.freeze_facility") {
    const userId = String(args.user_id ?? "");
    await pool.query(`update credit_mcp.credit_facilities set status='frozen',available_credit=0,updated_at=now() where user_id=$1`, [userId]);
    return ok({ user_id: userId, status: "frozen" });
  }

  // phase4: admin (cross-schema)
  if (tool === "admin.get_platform_overview") {
    const users = (await pool.query(`select count(*)::int as cnt from auth_mcp.users`)).rows[0]?.cnt ?? 0;
    const listings = (await pool.query(`select count(*)::int as cnt from listing_mcp.listings`)).rows[0]?.cnt ?? 0;
    const orders = (await pool.query(`select count(*)::int as cnt from orders_mcp.orders`)).rows[0]?.cnt ?? 0;
    const disputes = (await pool.query(`select count(*)::int as cnt from dispute_mcp.disputes where status='open'`)).rows[0]?.cnt ?? 0;
    return ok({ total_users: users, total_listings: listings, total_orders: orders, open_disputes: disputes });
  }
  if (tool === "admin.suspend_user") {
    const userId = String(args.user_id ?? "");
    const reason = String(args.reason ?? "admin action");
    await pool.query(`update auth_mcp.users set account_status='suspended' where user_id=$1`, [userId]);
    return ok({ user_id: userId, account_status: "suspended", reason });
  }
  if (tool === "admin.unsuspend_user") {
    const userId = String(args.user_id ?? "");
    await pool.query(`update auth_mcp.users set account_status='active' where user_id=$1`, [userId]);
    return ok({ user_id: userId, account_status: "active" });
  }
  if (tool === "admin.moderate_listing") {
    const listingId = String(args.listing_id ?? "");
    const action = String(args.action ?? "remove");
    const newStatus = action === "remove" ? "cancelled" : action === "flag" ? "suspended" : "suspended";
    await pool.query(`update listing_mcp.listings set status=$2::listing_status,updated_at=now() where listing_id=$1`, [listingId, newStatus]);
    return ok({ listing_id: listingId, status: newStatus });
  }
  if (tool === "admin.list_users") {
    const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);
    const rows = (
      await pool.query(
        `select user_id, email, phone, account_type::text, account_status::text, email_verified, phone_verified, created_at
         from auth_mcp.users order by created_at desc limit $1`,
        [limit],
      )
    ).rows;
    return ok({ users: rows, total: rows.length });
  }
  if (tool === "admin.update_user") {
    const userId = String(args.user_id ?? "");
    if (!userId) return err("VALIDATION_ERROR", "user_id is required.");
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (args.account_status !== undefined && args.account_status !== null && String(args.account_status) !== "") {
      const s = String(args.account_status);
      if (!VALID_ACCOUNT_STATUS.has(s)) return err("VALIDATION_ERROR", `Invalid account_status: ${s}`);
      sets.push(`account_status = $${i}::account_status`);
      vals.push(s);
      i++;
    }
    if (args.account_type !== undefined && args.account_type !== null && String(args.account_type) !== "") {
      const t = String(args.account_type);
      if (!VALID_ACCOUNT_TYPE.has(t)) return err("VALIDATION_ERROR", `Invalid account_type: ${t}`);
      sets.push(`account_type = $${i}::account_type`);
      vals.push(t);
      i++;
    }
    if (args.phone !== undefined && args.phone !== null && String(args.phone).trim() !== "") {
      sets.push(`phone = $${i}`);
      vals.push(String(args.phone).trim());
      i++;
    }
    if (sets.length === 0) return err("VALIDATION_ERROR", "No fields to update (account_status, account_type, phone).");
    vals.push(userId);
    await pool.query(`update auth_mcp.users set ${sets.join(", ")}, updated_at = now() where user_id = $${i}`, vals);
    return ok({ user_id: userId, updated: true });
  }
  if (tool === "admin.list_listings") {
    const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);
    const rows = (
      await pool.query(
        `select l.listing_id, l.seller_id, l.title, l.status::text, l.price_type::text, l.asking_price, l.quantity, l.unit, l.created_at
         from listing_mcp.listings l
         order by l.created_at desc
         limit $1`,
        [limit],
      )
    ).rows;
    return ok({ listings: rows, total: rows.length });
  }
  if (tool === "admin.update_listing_status") {
    const listingId = String(args.listing_id ?? "");
    const status = String(args.status ?? "");
    if (!listingId || !VALID_LISTING_STATUS.has(status)) {
      return err("VALIDATION_ERROR", "listing_id and valid status are required.");
    }
    await pool.query(`update listing_mcp.listings set status=$2::listing_status,updated_at=now() where listing_id=$1`, [listingId, status]);
    return ok({ listing_id: listingId, status });
  }
  if (tool === "admin.list_escrows") {
    const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);
    const rows = (await pool.query(`select * from escrow_mcp.escrows order by updated_at desc limit $1`, [limit])).rows;
    return ok({ escrows: rows, total: rows.length });
  }
  if (tool === "admin.list_auctions") {
    const limit = Math.min(Math.max(Number(args.limit ?? 50), 1), 200);
    const rows = (
      await pool.query(
        `select a.*,
          (select count(*)::int from auction_mcp.lots l where l.auction_id = a.auction_id) as lot_count
         from auction_mcp.auctions a
         order by a.created_at desc
         limit $1`,
        [limit],
      )
    ).rows;
    return ok({ auctions: rows, total: rows.length });
  }
  if (tool === "admin.list_lots") {
    const auctionId = args.auction_id ? String(args.auction_id) : null;
    const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);
    const rows = auctionId
      ? (await pool.query(`select * from auction_mcp.lots where auction_id = $1 order by lot_number`, [auctionId])).rows
      : (await pool.query(`select * from auction_mcp.lots order by opened_at desc nulls last, auction_id, lot_number limit $1`, [limit])).rows;
    return ok({ lots: rows, total: rows.length });
  }
  if (tool === "admin.list_orders") {
    const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);
    const rows = (await pool.query(`select * from orders_mcp.orders order by created_at desc limit $1`, [limit])).rows;
    return ok({ orders: rows, total: rows.length });
  }
  if (tool === "admin.update_order_status") {
    const orderId = String(args.order_id ?? "");
    const status = String(args.status ?? "");
    if (!orderId || !status) return err("VALIDATION_ERROR", "order_id and status are required.");
    await pool.query(`update orders_mcp.orders set status=$2, updated_at=now() where order_id=$1`, [orderId, status]);
    return ok({ order_id: orderId, status });
  }
  if (tool === "admin.list_bids") {
    const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);
    const rows = (await pool.query(`select * from bidding_mcp.bids order by server_timestamp desc nulls last limit $1`, [limit])).rows;
    return ok({ bids: rows, total: rows.length });
  }
  if (tool === "admin.list_transactions") {
    const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 500);
    const rows = (await pool.query(`select * from payments_mcp.transactions order by created_at desc limit $1`, [limit])).rows;
    return ok({ transactions: rows, total: rows.length });
  }
  if (tool === "admin.list_platform_config") {
    const ready = await ensureMatexAuxTables(pool);
    if (!ready) return err("CONFIG_ERROR", "Could not ensure public.matex_platform_config (database permissions).");
    const rows = (await pool.query(`select config_key, config_value, updated_at from public.matex_platform_config order by config_key`)).rows;
    return ok({ entries: rows, total: rows.length });
  }
  if (tool === "admin.grant_platform_admin") {
    const targetId = String(args.user_id ?? "");
    if (!targetId) return err("VALIDATION_ERROR", "user_id is required.");
    const ready = await ensureMatexAuxTables(pool);
    if (!ready) return err("CONFIG_ERROR", "Could not ensure matex_admin_operators table.");
    await pool.query(`insert into public.matex_admin_operators (user_id) values ($1) on conflict (user_id) do nothing`, [targetId]);
    return ok({ user_id: targetId, granted: true });
  }
  if (tool === "admin.revoke_platform_admin") {
    const targetId = String(args.user_id ?? "");
    if (!targetId) return err("VALIDATION_ERROR", "user_id is required.");
    await ensureMatexAuxTables(pool);
    await pool.query(`delete from public.matex_admin_operators where user_id = $1`, [targetId]);
    return ok({ user_id: targetId, revoked: true });
  }

  // ── missing auth tools ──
  if (tool === "auth.request_email_otp") {
    const challengeId = randomUUID();
    const expiresAt = new Date(Date.now() + 600_000).toISOString();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const toEmail = String(args.email ?? "");

    // Store challenge in DB for later verification
    await pool.query(
      `insert into auth_mcp.otp_challenges (challenge_id, user_id, code_hash, channel, expires_at)
       values ($1, $2, encode(digest($3,'sha256'),'hex'), 'email', $4)
       on conflict do nothing`,
      [challengeId, String(args.user_id ?? challengeId), createHash("sha256").update(code).digest("hex"), expiresAt],
    ).catch(() => { /* table may not exist yet — non-blocking */ });

    if (SENDGRID_API_KEY && toEmail) {
      await sgSend(
        toEmail,
        "Your Matex verification code",
        `Your Matex verification code is: ${code}\n\nThis code expires in 10 minutes.`,
        `<p>Your Matex verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`,
      );
    }

    const isProd = process.env.NODE_ENV === "production";
    return ok({
      challenge_id: challengeId,
      expires_at: expiresAt,
      status: "otp_sent",
      ...(isProd ? {} : { code }), // only expose code in dev
    });
  }

  if (tool === "auth.request_phone_otp") {
    const challengeId = randomUUID();
    const expiresAt = new Date(Date.now() + 600_000).toISOString();
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const toPhone = String(args.phone ?? "");

    await pool.query(
      `insert into auth_mcp.otp_challenges (challenge_id, user_id, code_hash, channel, expires_at)
       values ($1, $2, encode(digest($3,'sha256'),'hex'), 'sms', $4)
       on conflict do nothing`,
      [challengeId, String(args.user_id ?? challengeId), createHash("sha256").update(code).digest("hex"), expiresAt],
    ).catch(() => { /* table may not exist yet — non-blocking */ });

    if (toPhone) {
      await twilioSendSms(
        toPhone,
        `Your Matex verification code is: ${code}. Expires in 10 minutes.`,
      );
    }

    const isProd = process.env.NODE_ENV === "production";
    return ok({
      challenge_id: challengeId,
      expires_at: expiresAt,
      status: "otp_sent",
      ...(isProd ? {} : { code }), // only expose code in dev
    });
  }
  if (tool === "auth.verify_email") {
    const userId = String(args.user_id ?? "");
    if (userId) await pool.query(`update auth_mcp.users set email_verified=true where user_id=$1`, [userId]);
    return ok({ verified: true });
  }
  if (tool === "auth.verify_phone") {
    const userId = String(args.user_id ?? "");
    if (userId) await pool.query(`update auth_mcp.users set phone_verified=true where user_id=$1`, [userId]);
    return ok({ verified: true });
  }
  if (tool === "auth.refresh_token") {
    return ok({ access_token: `ui-token-${String(args.user_id ?? randomUUID())}`, expires_in: ACCESS_TOKEN_TTL_SEC });
  }

  // ── missing profile tools ──
  if (tool === "profile.get_profile") {
    const row = (await pool.query(`select * from profile_mcp.profiles where user_id=$1 limit 1`, [String(args.user_id ?? "")])).rows[0];
    return ok({ profile: row ?? null });
  }
  if (tool === "profile.update_profile") {
    const userId = String(args.user_id ?? "");
    await pool.query(
      `insert into profile_mcp.profiles (user_id,display_name,bio) values ($1,$2,$3)
       on conflict (user_id) do update set display_name=coalesce($2,profile_mcp.profiles.display_name),bio=coalesce($3,profile_mcp.profiles.bio),updated_at=now()`,
      [userId, args.display_name ? String(args.display_name) : null, args.bio ? String(args.bio) : null],
    );
    return ok({ user_id: userId, updated: true });
  }
  if (tool === "profile.add_bank_account") {
    return ok({ user_id: String(args.user_id ?? ""), bank_added: true });
  }
  if (tool === "profile.set_preferences") {
    return ok({ user_id: String(args.user_id ?? ""), preferences_set: true });
  }

  // ── missing listing tools ──
  if (tool === "listing.update_listing") {
    const listingId = String(args.listing_id ?? "");
    if (args.title) await pool.query(`update listing_mcp.listings set title=$2,updated_at=now() where listing_id=$1`, [listingId, String(args.title)]);
    return ok({ listing_id: listingId, updated: true });
  }
  if (tool === "listing.upload_images") {
    const listingId = String(args.listing_id ?? "");
    const imageUrls = Array.isArray(args.urls) ? args.urls.map(String) : [];
    if (listingId && imageUrls.length > 0) {
      await pool.query(
        `update listing_mcp.listings set images = $2::jsonb, updated_at = now() where listing_id = $1`,
        [listingId, JSON.stringify(imageUrls.map((url, i) => ({ url, order: i, alt_text: `Image ${i + 1}` })))],
      );
    }
    const fileId = randomUUID();
    if (args.file_name) {
      const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
      const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (SUPABASE_URL && SUPABASE_KEY) {
        const storagePath = `listings/${listingId}/${fileId}-${String(args.file_name ?? "image.jpg")}`;
        const uploadUrl = `${SUPABASE_URL}/storage/v1/object/listing-images/${storagePath}`;
        return ok({
          listing_id: listingId,
          file_id: fileId,
          upload_url: uploadUrl,
          storage_path: storagePath,
          method: "PUT",
          headers: { "authorization": `Bearer ${SUPABASE_KEY}`, "content-type": String(args.content_type ?? "image/jpeg") },
        });
      }
    }
    return ok({ listing_id: listingId, file_id: fileId, images_uploaded: true, note: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for real storage upload" });
  }
  if (tool === "listing.get_listing") {
    const row = (
      await pool.query(
        `select l.*, c.name as category_name,
          p.first_name, p.last_name, p.display_name,
          (select co.company_name from profile_mcp.companies co where co.user_id = l.seller_id order by co.created_at asc limit 1) as company_name
         from listing_mcp.listings l
         join listing_mcp.categories c on c.category_id = l.category_id
         left join profile_mcp.profiles p on p.user_id = l.seller_id
         where l.listing_id = $1
         limit 1`,
        [String(args.listing_id ?? "")],
      )
    ).rows[0];
    const listing = row ? mapListingRowForDetail(row as Record<string, unknown>) : null;
    return ok({ listing });
  }
  if (tool === "listing.get_my_listings") {
    const rows = (
      await pool.query(
        `select l.*, c.name as category_name
         from listing_mcp.listings l
         join listing_mcp.categories c on c.category_id = l.category_id
         where l.seller_id = $1
         order by l.created_at desc`,
        [String(args.seller_id ?? "")],
      )
    ).rows;
    const mapped = rows.map((row: unknown) => mapListingRowForMyListings(row as Record<string, unknown>));
    return ok({ listings: mapped, total: mapped.length });
  }
  if (tool === "listing.archive_listing") {
    const listingId = String(args.listing_id ?? "");
    if (!listingId) return err("VALIDATION_ERROR", "listing_id is required.");
    await pool.query(`update listing_mcp.listings set status = 'cancelled', updated_at = now() where listing_id = $1`, [listingId]);
    return ok({ listing_id: listingId, status: "archived" });
  }

  // ── missing search tools ──
  if (tool === "search.geo_search") {
    const lat = Number(args.lat ?? 43.65);
    const lng = Number(args.lng ?? -79.38);
    const radiusKm = Number(args.radius_km ?? 50);
    const rows = (await pool.query(
      `select listing_id,title,asking_price from listing_mcp.listings where status='active' and ST_DWithin(location,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3) limit 50`,
      [lng, lat, radiusKm * 1000],
    )).rows;
    return ok({ results: rows, total: rows.length });
  }
  if (tool === "search.filter_by_category") {
    const categoryId = String(args.category_id ?? "");
    const rows = (await pool.query(`select listing_id,title,asking_price from listing_mcp.listings where category_id=$1 and status='active' limit 50`, [categoryId])).rows;
    return ok({ results: rows, total: rows.length });
  }
  if (tool === "search.save_search") {
    const searchId = randomUUID();
    const q = String(args.query ?? args.name ?? "");
    await pool.query(
      `insert into listing_mcp.saved_searches (saved_search_id,user_id,name,query,filters,alert_enabled,alert_channels)
       values ($1,$2,$3,$4,$5::jsonb,true,'["email"]'::jsonb)`,
      [searchId, String(args.user_id ?? ""), String(args.name ?? "Saved search"), q, JSON.stringify(args.filters ?? {})],
    );
    return ok({ search_id: searchId, saved_search_id: searchId });
  }
  if (tool === "search.get_saved_searches") {
    const rows = (await pool.query(`select * from listing_mcp.saved_searches where user_id=$1 order by created_at desc`, [String(args.user_id ?? "")])).rows;
    return ok({ saved_searches: rows, total: rows.length });
  }
  if (tool === "search.index_listing") {
    return ok({ listing_id: String(args.listing_id ?? ""), indexed: true });
  }

  // ── missing messaging tools ──
  if (tool === "messaging.get_thread") {
    const threadId = String(args.thread_id ?? "");
    const thread = (await pool.query(`select * from messaging_mcp.threads where thread_id=$1`, [threadId])).rows[0];
    if (!thread) return ok({ thread: null });
    const messages = (await pool.query(`select * from messaging_mcp.messages where thread_id=$1 order by created_at asc`, [threadId])).rows;
    return ok({ thread: { ...thread, messages } });
  }
  if (tool === "messaging.get_unread") {
    const userId = String(args.user_id ?? "");
    const cnt = (await pool.query(
      `select count(*)::int as cnt from messaging_mcp.messages m
       join messaging_mcp.threads t on m.thread_id=t.thread_id
       where $1=any(t.participants) and m.sender_id!=$1`,
      [userId],
    )).rows[0]?.cnt ?? 0;
    return ok({ total_unread: cnt });
  }
  if (tool === "messaging.list_threads") {
    const userId = String(args.user_id ?? "");
    const limit = Math.min(Number(args.limit ?? 50), 100);
    const rows = (await pool.query(
      `select t.thread_id,
              t.subject,
              t.participants,
              t.listing_id,
              (select m2.content from messaging_mcp.messages m2
                where m2.thread_id = t.thread_id
                order by m2.created_at desc limit 1) as last_message,
              (select m2.created_at from messaging_mcp.messages m2
                where m2.thread_id = t.thread_id
                order by m2.created_at desc limit 1) as last_message_at,
              (select count(*)::int from messaging_mcp.messages m3
                where m3.thread_id = t.thread_id
                  and m3.sender_id != $1) as unread_count
         from messaging_mcp.threads t
        where $1 = any(t.participants)
        order by last_message_at desc nulls last
        limit $2`,
      [userId, limit],
    )).rows;
    return ok({ threads: rows, total: rows.length });
  }

  // ── missing payments tools ──
  if (tool === "payments.get_wallet_balance") {
    const row = (await pool.query(`select user_id,balance,pending_balance from payments_mcp.wallets where user_id=$1`, [String(args.user_id ?? "")])).rows[0];
    return ok({ wallet: row ?? { user_id: String(args.user_id ?? ""), balance: 0, pending_balance: 0 } });
  }
  if (tool === "payments.top_up_wallet") {
    const userId = String(args.user_id ?? "");
    const amount = Number(args.amount ?? 0);
    await pool.query(
      `insert into payments_mcp.wallets (user_id,balance,pending_balance) values ($1,$2,0)
       on conflict (user_id) do update set balance=payments_mcp.wallets.balance+$2`,
      [userId, amount],
    );
    return ok({ user_id: userId, topped_up: amount });
  }
  if (tool === "payments.manage_payment_methods") {
    return ok({ user_id: String(args.user_id ?? ""), methods: [] });
  }
  if (tool === "payments.get_transaction_history") {
    const rows = (await pool.query(`select * from payments_mcp.transactions where payer_id=$1 order by created_at desc limit 50`, [String(args.user_id ?? "")])).rows;
    return ok({ transactions: rows, total: rows.length });
  }

  // ── missing kyc tools ──
  if (tool === "kyc.submit_document") {
    const documentId = randomUUID();
    await pool.query(
      `insert into kyc_mcp.documents (document_id,verification_id,user_id,doc_type,file_url,file_hash) values ($1,$2,$3,$4,$5,$6)`,
      [documentId, String(args.verification_id ?? ""), String(args.user_id ?? ""), String(args.doc_type ?? "id"), String(args.file_url ?? ""), String(args.file_hash ?? "")],
    );
    return ok({ document_id: documentId });
  }
  if (tool === "kyc.get_kyc_level") {
    const row = (await pool.query(`select current_level,updated_at from kyc_mcp.kyc_levels where user_id=$1`, [String(args.user_id ?? "")])).rows[0];
    return ok({ current_level: row?.current_level ?? "level_0", updated_at: row?.updated_at ?? null });
  }
  if (tool === "kyc.assert_kyc_gate") {
    const userId = String(args.user_id ?? "");
    const requiredLevel = String(args.required_level ?? "level_2");
    const rank: Record<string, number> = { level_0: 0, level_1: 1, level_2: 2, level_3: 3 };
    const row = (await pool.query(`select current_level from kyc_mcp.kyc_levels where user_id=$1`, [userId])).rows[0];
    const current = String(row?.current_level ?? "level_0");
    if ((rank[current] ?? 0) < (rank[requiredLevel] ?? 0)) return err("KYC_GATE_BLOCKED", `Required ${requiredLevel}, current ${current}.`);
    return ok({ allowed: true, current_level: current });
  }

  // ── missing escrow tools ──
  if (tool === "escrow.freeze_escrow") {
    const escrowId = String(args.escrow_id ?? "");
    await pool.query(`update escrow_mcp.escrows set status='frozen',frozen_reason=$2,frozen_at=now(),updated_at=now() where escrow_id=$1`, [escrowId, String(args.reason ?? "admin action")]);
    await pool.query(`insert into escrow_mcp.escrow_timeline (event_id,escrow_id,action,reason,metadata) values ($1,$2,'frozen',$3,'{}'::jsonb)`, [randomUUID(), escrowId, String(args.reason ?? "")]);
    return ok({ escrow_id: escrowId, status: "frozen" });
  }
  if (tool === "escrow.refund_escrow") {
    const escrowId = String(args.escrow_id ?? "");
    const amount = Number(args.amount ?? 0);
    await pool.query(`update escrow_mcp.escrows set status='refunded',held_amount=greatest(0,held_amount-$2),refunded_amount=refunded_amount+$2,refunded_at=now(),updated_at=now() where escrow_id=$1`, [escrowId, amount]);
    await pool.query(`insert into escrow_mcp.escrow_timeline (event_id,escrow_id,action,amount,reason,metadata) values ($1,$2,'refunded',$3,$4,'{}'::jsonb)`, [randomUUID(), escrowId, amount, String(args.reason ?? "")]);
    return ok({ escrow_id: escrowId, status: "refunded" });
  }
  if (tool === "escrow.get_escrow") {
    const escrowId = String(args.escrow_id ?? "");
    const escrow = (await pool.query(`select * from escrow_mcp.escrows where escrow_id=$1`, [escrowId])).rows[0];
    const timeline = (await pool.query(`select * from escrow_mcp.escrow_timeline where escrow_id=$1 order by created_at`, [escrowId])).rows;
    return ok({ escrow: escrow ?? null, timeline });
  }
  if (tool === "escrow.list_escrows") {
    const userId = String(args.user_id ?? "");
    const status = args.status ? String(args.status) : null;
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const where: string[] = [];
    const params: unknown[] = [];
    if (userId) {
      params.push(userId);
      where.push(`(buyer_id = $${params.length} or seller_id = $${params.length})`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    params.push(limit);
    const sql = `select * from escrow_mcp.escrows ${where.length ? `where ${where.join(" and ")}` : ""} order by created_at desc limit $${params.length}`;
    const rows = (await pool.query(sql, params)).rows;
    return ok({ escrows: rows, total: rows.length });
  }

  // ── missing auction tools ──
  if (tool === "auction.start_auction") {
    const auctionId = String(args.auction_id ?? "");
    await pool.query(`update auction_mcp.auctions set status='live',actual_start=now(),updated_at=now() where auction_id=$1`, [auctionId]);
    await pool.query(`update auction_mcp.lots set status='open',opened_at=now() where auction_id=$1 and status='pending'`, [auctionId]);
    return ok({ auction_id: auctionId, status: "live" });
  }
  if (tool === "auction.close_lot") {
    const lotId = String(args.lot_id ?? "");
    const lot = (await pool.query(`select highest_bidder_id from auction_mcp.lots where lot_id=$1`, [lotId])).rows[0];
    const sold = lot?.highest_bidder_id ? "sold" : "unsold";
    await pool.query(`update auction_mcp.lots set status=$2,closed_at=now() where lot_id=$1`, [lotId, sold]);
    return ok({ lot_id: lotId, status: sold });
  }
  if (tool === "auction.get_lot_state") {
    const row = (await pool.query(`select * from auction_mcp.lots where lot_id=$1`, [String(args.lot_id ?? "")])).rows[0];
    return ok({ lot: row ?? null });
  }
  if (tool === "auction.list_auctions") {
    const status = args.status ? String(args.status) : null;
    const limit = Math.min(Number(args.limit ?? 100), 500);
    const params: unknown[] = [];
    const where: string[] = [];
    if (status) {
      params.push(status);
      where.push(`a.status = $${params.length}`);
    }
    params.push(limit);
    const sql = `select a.*, (select count(*)::int from auction_mcp.lots l where l.auction_id = a.auction_id) as lot_count
                 from auction_mcp.auctions a
                 ${where.length ? `where ${where.join(" and ")}` : ""}
                 order by a.start_time desc limit $${params.length}`;
    const rows = (await pool.query(sql, params)).rows;
    return ok({ auctions: rows, total: rows.length });
  }
  if (tool === "auction.get_auction") {
    const auctionId = String(args.auction_id ?? "");
    const auction = (await pool.query(`select * from auction_mcp.auctions where auction_id=$1`, [auctionId])).rows[0];
    const lots = (await pool.query(`select * from auction_mcp.lots where auction_id=$1 order by created_at`, [auctionId])).rows;
    return ok({ auction: auction ?? null, lots });
  }

  // ── missing bidding tools ──
  if (tool === "bidding.place_bid") {
    const bidId = randomUUID();
    await pool.query(
      `insert into bidding_mcp.bids (bid_id,listing_id,bidder_id,amount,bid_type,status,server_timestamp) values ($1,$2,$3,$4,$5,'active',now())`,
      [bidId, String(args.listing_id ?? ""), String(args.bidder_id ?? ""), Number(args.amount ?? 0), String(args.bid_type ?? "manual")],
    );
    return ok({ bid_id: bidId, amount: Number(args.amount ?? 0) });
  }
  if (tool === "bidding.retract_bid") {
    await pool.query(`update bidding_mcp.bids set status='retracted' where bid_id=$1`, [String(args.bid_id ?? "")]);
    return ok({ bid_id: String(args.bid_id ?? ""), status: "retracted" });
  }
  if (tool === "bidding.get_highest_bid") {
    const row = (await pool.query(`select * from bidding_mcp.bids where listing_id=$1 and status='active' order by amount desc limit 1`, [String(args.listing_id ?? "")])).rows[0];
    return ok({ highest_bid: row ?? null });
  }
  if (tool === "bidding.flag_suspicious_bid") {
    const flagId = randomUUID();
    await pool.query(
      `insert into bidding_mcp.anti_manipulation_flags (flag_id,listing_id,flagged_user_id,flag_type,severity,details) values ($1,$2,$3,$4,$5,$6::jsonb)`,
      [flagId, String(args.listing_id ?? ""), String(args.flagged_user_id ?? ""), String(args.flag_type ?? "shill"), String(args.severity ?? "medium"), JSON.stringify(args.details ?? {})],
    );
    return ok({ flag_id: flagId });
  }

  // ── missing inspection tools ──
  if (tool === "inspection.record_weight") {
    const cawCheck = validateCAWScaleCertificate(Boolean(args.scale_certified), args.scale_certificate ? String(args.scale_certificate) : null);
    if (!cawCheck.valid) return err("CAW_VALIDATION", cawCheck.error ?? "Invalid CAW certificate");
    const recordId = randomUUID();
    await pool.query(
      `insert into inspection_mcp.weight_records (record_id,order_id,weight_point,weight_kg,recorded_by,scale_certified,recorded_at)
       values ($1,$2,$3,$4,$5,$6,now())
       on conflict (order_id,weight_point) do update set weight_kg=$4,recorded_by=$5,recorded_at=now()`,
      [recordId, String(args.order_id ?? ""), String(args.weight_point ?? "w1_seller"), Number(args.weight_kg ?? 0), String(args.recorded_by ?? ""), Boolean(args.scale_certified ?? false)],
    );
    return ok({ record_id: recordId, weight_point: String(args.weight_point ?? "w1_seller") });
  }
  if (tool === "inspection.complete_inspection") {
    const inspectionId = String(args.inspection_id ?? "");
    await pool.query(
      `update inspection_mcp.inspections set result=$2,status='completed',weight_actual_kg=$3,completed_at=now(),updated_at=now() where inspection_id=$1`,
      [inspectionId, String(args.result ?? "pass"), args.weight_actual_kg ? Number(args.weight_actual_kg) : null],
    );
    return ok({ inspection_id: inspectionId, status: "completed" });
  }
  if (tool === "inspection.get_inspection") {
    const inspectionId = String(args.inspection_id ?? "");
    const insp = (await pool.query(`select * from inspection_mcp.inspections where inspection_id=$1`, [inspectionId])).rows[0];
    return ok({ inspection: insp ?? null });
  }
  if (tool === "inspection.list_inspections") {
    const userId = String(args.user_id ?? "");
    const limit = Math.min(Number(args.limit ?? 50), 200);
    const params: unknown[] = [];
    const where: string[] = [];
    if (userId) {
      params.push(userId);
      where.push(`(requested_by = $${params.length} or inspector_id = $${params.length})`);
    }
    params.push(limit);
    const sql = `select * from inspection_mcp.inspections ${where.length ? `where ${where.join(" and ")}` : ""} order by scheduled_at desc nulls last limit $${params.length}`;
    const rows = (await pool.query(sql, params)).rows;
    return ok({ inspections: rows, total: rows.length });
  }

  // ── missing booking tools ──
  if (tool === "booking.set_availability") {
    const availId = randomUUID();
    await pool.query(
      `insert into booking_mcp.availability (availability_id,user_id,day_of_week,start_time,end_time) values ($1,$2,$3,$4,$5)`,
      [availId, String(args.user_id ?? ""), Number(args.day_of_week ?? 1), String(args.start_time ?? "09:00"), String(args.end_time ?? "17:00")],
    );
    return ok({ availability_id: availId });
  }
  if (tool === "booking.update_booking_status") {
    const bookingId = String(args.booking_id ?? "");
    const status = String(args.status ?? "confirmed");
    await pool.query(`update booking_mcp.bookings set status=$2,updated_at=now() where booking_id=$1`, [bookingId, status]);
    return ok({ booking_id: bookingId, status });
  }
  if (tool === "booking.list_user_bookings") {
    const rows = (await pool.query(`select * from booking_mcp.bookings where organizer_id=$1 order by scheduled_start desc`, [String(args.user_id ?? "")])).rows;
    return ok({ bookings: rows, total: rows.length });
  }
  if (tool === "booking.enqueue_reminder") {
    return ok({ booking_id: String(args.booking_id ?? ""), reminder_enqueued: true, minutes_before: Number(args.minutes_before ?? 30) });
  }

  // ── missing logistics tools ──
  if (tool === "logistics.generate_bol") {
    const shipmentId = String(args.shipment_id ?? "");
    const bolNumber = `BOL-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    await pool.query(`update logistics_mcp.shipments set bol_document_id=$2,updated_at=now() where shipment_id=$1`, [shipmentId, bolNumber]);
    return ok({ shipment_id: shipmentId, bol_number: bolNumber });
  }

  // ── missing contracts tools ──
  if (tool === "contracts.generate_order") {
    const contractId = String(args.contract_id ?? "");
    const orderId = randomUUID();
    await pool.query(
      `insert into contracts_mcp.contract_orders (contract_order_id,contract_id,scheduled_date,quantity,status) values ($1,$2,now()::date,$3,'generated')`,
      [orderId, contractId, Number(args.quantity ?? 10)],
    );
    return ok({ contract_order_id: orderId, contract_id: contractId });
  }
  if (tool === "contracts.negotiate_terms") {
    const negotiationId = randomUUID();
    await pool.query(
      `insert into contracts_mcp.negotiations (negotiation_id,contract_id,proposed_by,proposed_changes,message,status) values ($1,$2,$3,$4::jsonb,$5,'pending')`,
      [negotiationId, String(args.contract_id ?? ""), String(args.proposed_by ?? ""), JSON.stringify(args.proposed_changes ?? {}), String(args.message ?? "")],
    );
    return ok({ negotiation_id: negotiationId });
  }

  // ── missing dispute tools ──
  if (tool === "dispute.propose_settlement") {
    const proposalId = randomUUID();
    await pool.query(
      `insert into dispute_mcp.settlement_proposals (proposal_id,dispute_id,proposed_by,terms,message,status) values ($1,$2,$3,$4::jsonb,$5,'pending')`,
      [proposalId, String(args.dispute_id ?? ""), String(args.proposed_by ?? ""), JSON.stringify(args.terms ?? {}), String(args.message ?? "")],
    );
    return ok({ proposal_id: proposalId });
  }
  if (tool === "dispute.update_pis") {
    const userId = String(args.user_id ?? "");
    const score = Number(args.pis_score ?? 100);
    const tier = score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : score >= 30 ? "poor" : "critical";
    await pool.query(
      `insert into dispute_mcp.platform_integrity_scores (user_id,pis_score,tier,last_calculated_at) values ($1,$2,$3,now())
       on conflict (user_id) do update set pis_score=$2,tier=$3,last_calculated_at=now()`,
      [userId, score, tier],
    );
    return ok({ user_id: userId, pis_score: score, tier });
  }

  // ── missing tax tools ──
  if (tool === "tax.void_invoice") {
    await pool.query(`update tax_mcp.invoices set status='void' where invoice_id=$1`, [String(args.invoice_id ?? "")]);
    return ok({ invoice_id: String(args.invoice_id ?? ""), status: "void" });
  }
  if (tool === "tax.get_remittance_summary") {
    const rows = (await pool.query(`select tax_type,province,sum(collected_amount)::numeric as collected,sum(remitted_amount)::numeric as remitted from tax_mcp.tax_remittances group by tax_type,province`)).rows;
    return ok({ remittances: rows });
  }

  // ── missing notifications tools ──
  if (tool === "notifications.get_preferences") {
    return ok({ user_id: String(args.user_id ?? ""), preferences: { email: true, sms: true, push: true, in_app: true } });
  }
  if (tool === "notifications.update_preferences") {
    return ok({ user_id: String(args.user_id ?? ""), preferences_updated: true });
  }

  // ── missing analytics tools ──
  if (tool === "analytics.get_conversion_funnel") {
    const listings = (await pool.query(`select count(*)::int as cnt from listing_mcp.listings`)).rows[0]?.cnt ?? 0;
    const searches = (await pool.query(`select count(*)::int as cnt from listing_mcp.saved_searches`)).rows[0]?.cnt ?? 0;
    const threads = (await pool.query(`select count(*)::int as cnt from messaging_mcp.threads`)).rows[0]?.cnt ?? 0;
    const orders = (await pool.query(`select count(*)::int as cnt from orders_mcp.orders`)).rows[0]?.cnt ?? 0;
    return ok({ funnel: { listings, searches, threads, orders } });
  }
  if (tool === "analytics.export_data") {
    const query = String(args.query ?? "select 1");
    const rows = (await pool.query(query)).rows;
    return ok({ rows, total: rows.length, exported_at: new Date().toISOString() });
  }

  // ── missing pricing tools ──
  if (tool === "pricing.calculate_mpi") {
    const categoryId = String(args.category_id ?? "");
    const region = String(args.region ?? "ontario");
    const rows = (await pool.query(
      `select avg(asking_price)::numeric as avg_price, count(*)::int as sample_size
       from listing_mcp.listings where category_id=$1 and status='active'`,
      [categoryId],
    )).rows[0];
    const mpiValue = Number(rows?.avg_price ?? 0);
    const mpiId = randomUUID();
    if (mpiValue > 0) {
      await pool.query(
        `insert into pricing_mcp.matex_price_index (mpi_id,category_id,region,mpi_value,sample_size,period_start,period_end) values ($1,$2,$3,$4,$5,now()-interval '7 days',now())`,
        [mpiId, categoryId, region, mpiValue, Number(rows?.sample_size ?? 0)],
      );
    }
    return ok({ mpi_id: mpiId, mpi_value: mpiValue, region, sample_size: Number(rows?.sample_size ?? 0) });
  }
  if (tool === "pricing.check_alerts") {
    const alerts = (await pool.query(`select * from pricing_mcp.price_alerts where is_active=true`)).rows;
    return ok({ active_alerts: alerts.length, checked_at: new Date().toISOString() });
  }

  // ── missing credit tools ──
  if (tool === "credit.draw_credit") {
    const userId = String(args.user_id ?? "");
    const amount = Number(args.amount ?? 0);
    const orderId = asUuidOrNew(args.order_id);
    const facility = (await pool.query(`select credit_facility_id,available_credit from credit_mcp.credit_facilities where user_id=$1 and status='active'`, [userId])).rows[0];
    if (!facility) return err("NO_FACILITY", "No active credit facility.");
    if (Number(facility.available_credit) < amount) return err("INSUFFICIENT_CREDIT", "Amount exceeds available credit.");
    const invoiceId = randomUUID();
    await pool.query(
      `insert into credit_mcp.credit_invoices (credit_invoice_id,credit_facility_id,order_id,principal_amount,total_amount,due_date,status) values ($1,$2,$3,$4,$4,(now()+interval '30 days')::date,'outstanding')`,
      [invoiceId, facility.credit_facility_id, orderId, amount],
    );
    await pool.query(`update credit_mcp.credit_facilities set available_credit=available_credit-$2,total_outstanding=total_outstanding+$2,updated_at=now() where user_id=$1`, [userId, amount]);
    return ok({ credit_invoice_id: invoiceId, amount, status: "outstanding" });
  }
  if (tool === "credit.record_payment") {
    const invoiceId = String(args.credit_invoice_id ?? "");
    const amount = Number(args.amount ?? 0);
    await pool.query(`update credit_mcp.credit_invoices set paid_amount=paid_amount+$2,status='paid',paid_at=now() where credit_invoice_id=$1`, [invoiceId, amount]);
    return ok({ credit_invoice_id: invoiceId, paid: amount });
  }

  // ── missing admin tools ──
  if (tool === "admin.get_audit_trail") {
    const rows = (await pool.query(`select * from log_mcp.audit_log order by created_at desc limit 50`)).rows;
    return ok({ entries: rows, total: rows.length });
  }
  if (tool === "admin.update_platform_config") {
    const key = String(args.key ?? "").trim();
    const value = String(args.value ?? "");
    if (!key) return err("VALIDATION_ERROR", "key is required.");
    const ready = await ensureMatexAuxTables(pool);
    if (!ready) return err("CONFIG_ERROR", "Could not ensure public.matex_platform_config.");
    await pool.query(
      `insert into public.matex_platform_config (config_key, config_value, updated_at)
       values ($1, $2, now())
       on conflict (config_key) do update set config_value = $2, updated_at = now()`,
      [key, value],
    );
    return ok({ key, value, updated: true });
  }

  // ── esign tools ──
  if (tool === "esign.create_document") {
    const documentId = randomUUID();
    await pool.query(
      `insert into esign_mcp.documents (document_id,template_type,order_id,contract_id,generated_data,signatories,provider,status)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,'draft')`,
      [documentId, String(args.template_type ?? "purchase_agreement"),
       args.order_id ? String(args.order_id) : null, args.contract_id ? String(args.contract_id) : null,
       JSON.stringify(args.generated_data ?? {}), JSON.stringify(args.signatories ?? []),
       String(args.provider ?? "docusign")],
    );
    return ok({ document_id: documentId, status: "draft" });
  }
  if (tool === "esign.send_for_signing") {
    const documentId = String(args.document_id ?? "");
    const envelopeId = `ENV-${randomUUID().slice(0, 8)}`;
    await pool.query(
      `update esign_mcp.documents set status='sent',provider_envelope_id=$2,expires_at=now()+interval '7 days',updated_at=now() where document_id=$1`,
      [documentId, envelopeId],
    );
    return ok({ document_id: documentId, envelope_id: envelopeId, status: "sent" });
  }
  if (tool === "esign.record_signature") {
    const documentId = String(args.document_id ?? "");
    const hash = `sha256-${randomUUID().replace(/-/g, "")}`;
    await pool.query(
      `update esign_mcp.documents set status='signed',document_hash=$2,completed_at=now(),updated_at=now() where document_id=$1`,
      [documentId, hash],
    );
    return ok({ document_id: documentId, status: "signed", document_hash: hash });
  }
  if (tool === "esign.get_document") {
    const row = (await pool.query(`select * from esign_mcp.documents where document_id=$1`, [String(args.document_id ?? "")])).rows[0];
    return ok({ document: row ?? null });
  }
  if (tool === "esign.void_document") {
    await pool.query(`update esign_mcp.documents set status='voided',updated_at=now() where document_id=$1`, [String(args.document_id ?? "")]);
    return ok({ document_id: String(args.document_id ?? ""), status: "voided" });
  }
  if (tool === "esign.verify_hash") {
    const row = (await pool.query(`select document_hash from esign_mcp.documents where document_id=$1`, [String(args.document_id ?? "")])).rows[0];
    const match = row?.document_hash === String(args.hash ?? "");
    return ok({ document_id: String(args.document_id ?? ""), hash_match: match });
  }

  if (tool.endsWith(".ping")) return ok({ status: "ok", timestamp: new Date().toISOString() });
  return err("UNKNOWN_TOOL", `Unsupported tool: ${tool}`);
}

export function startDomainHttpAdapter(domain: string, port: number): void {
  const pool = createPool();
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, ok({ status: "ok", domain, database: pool ? "configured" : "missing", timestamp: new Date().toISOString() }));
    }
    if (req.method !== "POST" || req.url !== "/tool") {
      return json(res, 404, err("NOT_FOUND", "Route not found"));
    }
    if (!pool) return json(res, 500, err("CONFIG_ERROR", "DATABASE_URL is required."));
    const body = await readBody(req);
    if (!body?.tool) return json(res, 400, err("INVALID_REQUEST", "tool is required."));
    if (!body.tool.startsWith(`${domain}.`)) {
      return json(res, 400, err("INVALID_DOMAIN", `Adapter '${domain}' cannot handle '${body.tool}'.`));
    }
    try {
      const rawArgs = (body.args ?? {}) as Record<string, unknown>;
      // Inject authenticated user ID from the gateway JWT payload so MCP servers can enforce ownership.
      if (body.auth?.sub && !rawArgs._user_id) {
        rawArgs._user_id = body.auth.sub;
      }
      const result = await handleTool(pool, body.tool, rawArgs);
      return json(res, result.success ? 200 : 400, result);
    } catch (error) {
      return json(res, 400, err("DB_ERROR", error instanceof Error ? error.message : String(error)));
    }
  });
  server.listen(port, () => {
    console.log(`${domain} HTTP adapter listening on http://localhost:${port}`);
  });
}
