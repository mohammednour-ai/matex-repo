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

    if (messageIds.length) await client.query(`delete from messaging_mcp.messages where message_id = any($1::uuid[])`, [messageIds]);
    if (threadIds.length) await client.query(`delete from messaging_mcp.threads where thread_id = any($1::uuid[])`, [threadIds]);
    if (transactionIds.length) await client.query(`delete from payments_mcp.transactions where transaction_id = any($1::uuid[])`, [transactionIds]);
    if (inspectionIds.length) await client.query(`delete from inspection_mcp.inspections where inspection_id = any($1::uuid[])`, [inspectionIds]);
    if (bookingIds.length) await client.query(`delete from booking_mcp.bookings where booking_id = any($1::uuid[])`, [bookingIds]);
    if (verificationIds.length) {
      await client.query(`delete from kyc_mcp.documents where verification_id = any($1::uuid[])`, [verificationIds]);
      await client.query(`delete from kyc_mcp.verifications where verification_id = any($1::uuid[])`, [verificationIds]);
    }
    if (escrowIds.length) {
      await client.query(`delete from escrow_mcp.escrow_timeline where escrow_id = any($1::uuid[])`, [escrowIds]);
      await client.query(`delete from escrow_mcp.escrows where escrow_id = any($1::uuid[])`, [escrowIds]);
    }
    if (lotIds.length) await client.query(`delete from auction_mcp.lots where lot_id = any($1::uuid[])`, [lotIds]);
    if (auctionIds.length) await client.query(`delete from auction_mcp.auctions where auction_id = any($1::uuid[])`, [auctionIds]);
    if (listingIds.length) await client.query(`delete from listing_mcp.listings where listing_id = any($1::uuid[])`, [listingIds]);
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
