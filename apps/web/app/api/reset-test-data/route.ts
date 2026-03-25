import { NextRequest, NextResponse } from "next/server";
import pg from "pg";

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;
const RESET_SECRET = process.env.UI_RESET_SECRET;
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 2,
    })
  : null;

type TrackedPayload = {
  tracked?: {
    userIds?: string[];
    listingIds?: string[];
    threadIds?: string[];
    messageIds?: string[];
    transactionIds?: string[];
    verificationIds?: string[];
    escrowIds?: string[];
    auctionIds?: string[];
    lotIds?: string[];
    inspectionIds?: string[];
    bookingIds?: string[];
  };
  secret?: string;
};

function list(value: string[] | undefined): string[] {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.length > 0) : [];
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Disabled in production." } }, { status: 403 });
  }
  if (!pool) {
    return NextResponse.json({ success: false, error: { code: "CONFIG_ERROR", message: "DATABASE_URL is required." } }, { status: 500 });
  }

  const body = (await req.json()) as TrackedPayload;
  if (RESET_SECRET && body.secret !== RESET_SECRET) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Invalid reset secret." } }, { status: 403 });
  }
  const tracked = body.tracked ?? {};
  const client = await pool.connect();
  try {
    await client.query("begin");

    const messageIds = list(tracked.messageIds);
    const threadIds = list(tracked.threadIds);
    const transactionIds = list(tracked.transactionIds);
    const listingIds = list(tracked.listingIds);
    const userIds = list(tracked.userIds);
    const verificationIds = list(tracked.verificationIds);
    const escrowIds = list(tracked.escrowIds);
    const lotIds = list(tracked.lotIds);
    const auctionIds = list(tracked.auctionIds);
    const inspectionIds = list(tracked.inspectionIds);
    const bookingIds = list(tracked.bookingIds);

    // Delete in FK-safe order: leaf tables first, parent tables last

    // Notifications (no children)
    if (userIds.length) await client.query(`delete from notifications_mcp.notifications where user_id = any($1::uuid[])`, [userIds]);

    // Credit (children before parent)
    if (userIds.length) {
      await client.query(`delete from credit_mcp.credit_score_history where user_id = any($1::uuid[])`, [userIds]);
      await client.query(`delete from credit_mcp.credit_invoices where credit_facility_id in (select credit_facility_id from credit_mcp.credit_facilities where user_id = any($1::uuid[]))`, [userIds]);
      await client.query(`delete from credit_mcp.credit_facilities where user_id = any($1::uuid[])`, [userIds]);
    }

    // Pricing alerts
    if (userIds.length) await client.query(`delete from pricing_mcp.price_alerts where user_id = any($1::uuid[])`, [userIds]);

    // Messages before threads
    if (messageIds.length) await client.query(`delete from messaging_mcp.messages where message_id = any($1::uuid[])`, [messageIds]);
    if (threadIds.length) {
      await client.query(`delete from messaging_mcp.messages where thread_id = any($1::uuid[])`, [threadIds]);
      await client.query(`delete from messaging_mcp.threads where thread_id = any($1::uuid[])`, [threadIds]);
    }

    // Payments
    if (transactionIds.length) await client.query(`delete from payments_mcp.transactions where transaction_id = any($1::uuid[])`, [transactionIds]);
    if (userIds.length) await client.query(`delete from payments_mcp.wallets where user_id = any($1::uuid[])`, [userIds]);

    // Inspections + weight records
    if (inspectionIds.length) await client.query(`delete from inspection_mcp.inspections where inspection_id = any($1::uuid[])`, [inspectionIds]);

    // Bookings
    if (bookingIds.length) await client.query(`delete from booking_mcp.bookings where booking_id = any($1::uuid[])`, [bookingIds]);
    if (userIds.length) await client.query(`delete from booking_mcp.availability where user_id = any($1::uuid[])`, [userIds]);

    // KYC (documents before verifications, kyc_levels)
    if (verificationIds.length) {
      await client.query(`delete from kyc_mcp.documents where verification_id = any($1::uuid[])`, [verificationIds]);
      await client.query(`delete from kyc_mcp.verifications where verification_id = any($1::uuid[])`, [verificationIds]);
    }
    if (userIds.length) await client.query(`delete from kyc_mcp.kyc_levels where user_id = any($1::uuid[])`, [userIds]);

    // Escrow (timeline before escrows)
    if (escrowIds.length) {
      await client.query(`delete from escrow_mcp.escrow_timeline where escrow_id = any($1::uuid[])`, [escrowIds]);
      await client.query(`delete from escrow_mcp.escrows where escrow_id = any($1::uuid[])`, [escrowIds]);
    }

    // Bids before lots before auctions (bids reference listings too)
    if (listingIds.length) await client.query(`delete from bidding_mcp.bids where listing_id = any($1::uuid[])`, [listingIds]);
    if (lotIds.length) await client.query(`delete from auction_mcp.lots where lot_id = any($1::uuid[])`, [lotIds]);
    if (auctionIds.length) {
      await client.query(`delete from auction_mcp.lots where auction_id = any($1::uuid[])`, [auctionIds]);
      await client.query(`delete from auction_mcp.auctions where auction_id = any($1::uuid[])`, [auctionIds]);
    }

    // Disputes (evidence + settlements + penalties before disputes)
    if (userIds.length) {
      await client.query(`delete from dispute_mcp.penalties where user_id = any($1::uuid[])`, [userIds]);
      await client.query(`delete from dispute_mcp.platform_integrity_scores where user_id = any($1::uuid[])`, [userIds]);
    }

    // Contracts (orders + negotiations before contracts)
    if (userIds.length) {
      await client.query(`delete from contracts_mcp.negotiations where proposed_by = any($1::uuid[])`, [userIds]);
    }

    // Tax invoices
    if (userIds.length) await client.query(`delete from tax_mcp.invoices where buyer_id = any($1::uuid[]) or seller_id = any($1::uuid[])`, [userIds]);

    // Logistics (quotes + shipments reference orders)
    if (userIds.length) {
      await client.query(`delete from logistics_mcp.shipping_quotes where order_id in (select order_id from orders_mcp.orders where buyer_id = any($1::uuid[]) or seller_id = any($1::uuid[]))`, [userIds]);
      await client.query(`delete from logistics_mcp.shipments where order_id in (select order_id from orders_mcp.orders where buyer_id = any($1::uuid[]) or seller_id = any($1::uuid[]))`, [userIds]);
    }

    // eSign documents
    if (userIds.length) await client.query(`delete from esign_mcp.documents where order_id in (select order_id from orders_mcp.orders where buyer_id = any($1::uuid[]) or seller_id = any($1::uuid[]))`, [userIds]);

    // Disputes reference orders
    if (userIds.length) await client.query(`delete from dispute_mcp.disputes where filing_party_id = any($1::uuid[]) or responding_party_id = any($1::uuid[])`, [userIds]);

    // Contract orders + contracts
    if (userIds.length) {
      await client.query(`delete from contracts_mcp.contract_orders where contract_id in (select contract_id from contracts_mcp.contracts where buyer_id = any($1::uuid[]) or seller_id = any($1::uuid[]))`, [userIds]);
      await client.query(`delete from contracts_mcp.contracts where buyer_id = any($1::uuid[]) or seller_id = any($1::uuid[])`, [userIds]);
    }

    // Escrows that reference orders (catch any not tracked by escrowIds)
    if (userIds.length) {
      await client.query(`delete from escrow_mcp.escrow_timeline where escrow_id in (select escrow_id from escrow_mcp.escrows where buyer_id = any($1::uuid[]) or seller_id = any($1::uuid[]))`, [userIds]);
      await client.query(`delete from escrow_mcp.escrows where buyer_id = any($1::uuid[]) or seller_id = any($1::uuid[])`, [userIds]);
    }

    // Orders (before listings and users)
    if (userIds.length) await client.query(`delete from orders_mcp.orders where buyer_id = any($1::uuid[]) or seller_id = any($1::uuid[])`, [userIds]);

    // Favorites + saved searches before listings
    if (listingIds.length) {
      await client.query(`delete from listing_mcp.favorites where listing_id = any($1::uuid[])`, [listingIds]);
    }
    if (userIds.length) {
      await client.query(`delete from listing_mcp.saved_searches where user_id = any($1::uuid[])`, [userIds]);
      await client.query(`delete from listing_mcp.favorites where user_id = any($1::uuid[])`, [userIds]);
    }

    // Listings (after all children removed)
    if (listingIds.length) await client.query(`delete from listing_mcp.listings where listing_id = any($1::uuid[])`, [listingIds]);

    // Profile data before users
    if (userIds.length) {
      await client.query(`delete from profile_mcp.preferences where user_id = any($1::uuid[])`, [userIds]);
      await client.query(`delete from profile_mcp.bank_accounts where user_id = any($1::uuid[])`, [userIds]);
      await client.query(`delete from profile_mcp.profiles where user_id = any($1::uuid[])`, [userIds]);
      await client.query(`delete from auth_mcp.sessions where user_id = any($1::uuid[])`, [userIds]);
    }

    // Users last
    if (userIds.length) await client.query(`delete from auth_mcp.users where user_id = any($1::uuid[])`, [userIds]);

    await client.query("commit");
    return NextResponse.json({ success: true, data: { deleted: { userIds, listingIds, threadIds, messageIds, transactionIds, verificationIds, escrowIds, lotIds, auctionIds, inspectionIds, bookingIds } } });
  } catch (error) {
    await client.query("rollback");
    return NextResponse.json({ success: false, error: { code: "DB_ERROR", message: error instanceof Error ? error.message : String(error) } }, { status: 400 });
  } finally {
    client.release();
  }
}
