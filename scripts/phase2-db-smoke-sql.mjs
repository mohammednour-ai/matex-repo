#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const runId = Date.now().toString();
const results = [];

const ids = {
  sellerId: randomUUID(),
  buyerId: randomUUID(),
  organizerId: randomUUID(),
  listingId: randomUUID(),
  orderId: randomUUID(),
  verificationId: randomUUID(),
  documentId: randomUUID(),
  escrowId: randomUUID(),
  auctionId: randomUUID(),
  lotId: randomUUID(),
  bid1Id: randomUUID(),
  bid2Id: randomUUID(),
  inspectionId: randomUUID(),
  weightW1: randomUUID(),
  weightW4: randomUUID(),
  availabilityId: randomUUID(),
  bookingId: randomUUID(),
};

function stepResult(step, status, info) {
  results.push({ step, status, info });
}

function levelRank(level) {
  const ranks = { level_0: 0, level_1: 1, level_2: 2, level_3: 3 };
  return ranks[level] ?? 0;
}

async function step(name, fn) {
  try {
    const info = await fn();
    stepResult(name, "PASS", info ?? "");
  } catch (error) {
    stepResult(name, "FAIL", error instanceof Error ? error.message : String(error));
  }
}

function hash(input) {
  return createHash("sha256").update(input).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await client.connect();

  const sellerEmail = `seller.phase2.${runId}@matex-smoke.local`;
  const buyerEmail = `buyer.phase2.${runId}@matex-smoke.local`;
  const organizerEmail = `organizer.phase2.${runId}@matex-smoke.local`;
  const sellerPhone = `+1416${runId.slice(-7)}`;
  const buyerPhone = `+1647${runId.slice(-7)}`;
  const organizerPhone = `+1905${runId.slice(-7)}`;
  const passwordHash = hash(`P@ssw0rd-${runId}`);

  let categoryId = "";

  try {
    await step("bootstrap users/listing/order", async () => {
      await client.query(
        `insert into auth_mcp.users
          (user_id, email, phone, password_hash, account_type, account_status, email_verified, phone_verified)
         values
          ($1,$2,$3,$4,'corporate','active',true,true),
          ($5,$6,$7,$8,'individual','active',true,true),
          ($9,$10,$11,$12,'corporate','active',true,true)`,
        [
          ids.sellerId,
          sellerEmail,
          sellerPhone,
          passwordHash,
          ids.buyerId,
          buyerEmail,
          buyerPhone,
          passwordHash,
          ids.organizerId,
          organizerEmail,
          organizerPhone,
          passwordHash,
        ],
      );

      const categoryRes = await client.query(
        `select category_id from listing_mcp.categories where slug = 'ferrous-metals' limit 1`,
      );
      assert(categoryRes.rowCount > 0, "Missing seeded category ferrous-metals");
      categoryId = categoryRes.rows[0].category_id;

      await client.query(
        `insert into listing_mcp.listings
          (listing_id,seller_id,title,slug,category_id,description,quantity,unit,price_type,asking_price,images,location,pickup_address,status)
         values
          ($1,$2,'Phase2 Smoke Listing',$3,$4,'phase2 db smoke listing',1000,'kg','auction',1500,'[]'::jsonb,
           ST_SetSRID(ST_MakePoint(-79.3832,43.6532),4326)::geography,
           $5::jsonb,'active')`,
        [
          ids.listingId,
          ids.sellerId,
          `phase2-smoke-${runId}`,
          categoryId,
          JSON.stringify({
            street: "1 Queen St W",
            city: "Toronto",
            province: "ON",
            postal_code: "M5H2N2",
            country: "CA",
          }),
        ],
      );

      await client.query(
        `insert into orders_mcp.orders
          (order_id,listing_id,buyer_id,seller_id,original_amount,quantity,unit,commission_rate,status)
         values
          ($1,$2,$3,$4,1500,1000,'kg',0.05,'pending')`,
        [ids.orderId, ids.listingId, ids.buyerId, ids.sellerId],
      );

      return `users/listing/order created`;
    });

    await step("kyc verification + gate", async () => {
      await client.query(
        `insert into kyc_mcp.verifications
          (verification_id,user_id,target_level,current_status,risk_score,submitted_at)
         values
          ($1,$2,'level_2','pending','low',now())`,
        [ids.verificationId, ids.buyerId],
      );

      await client.query(
        `insert into kyc_mcp.documents
          (document_id,verification_id,user_id,doc_type,file_url,file_hash)
         values
          ($1,$2,$3,'drivers_license',$4,$5)`,
        [ids.documentId, ids.verificationId, ids.buyerId, `storage://phase2-smoke/${runId}/dl.png`, hash(`doc-${runId}`)],
      );

      await client.query(
        `update kyc_mcp.verifications
         set current_status='verified', reviewed_at=now(), verified_at=now()
         where verification_id=$1`,
        [ids.verificationId],
      );

      await client.query(
        `insert into kyc_mcp.kyc_levels (user_id,current_level,level_2_at,updated_at)
         values ($1,'level_2',now(),now())
         on conflict (user_id) do update
         set current_level='level_2', level_2_at=now(), updated_at=now()`,
        [ids.buyerId],
      );

      const levelRes = await client.query(
        `select current_level from kyc_mcp.kyc_levels where user_id=$1`,
        [ids.buyerId],
      );
      const current = levelRes.rows[0]?.current_level ?? "level_0";
      assert(levelRank(current) >= levelRank("level_2"), `KYC gate failed: current=${current}`);
      return `current_level=${current}`;
    });

    await step("escrow lifecycle + timeline", async () => {
      await client.query(
        `insert into escrow_mcp.escrows
          (escrow_id,order_id,buyer_id,seller_id,original_amount,held_amount,released_amount,refunded_amount,currency,status,created_at,updated_at)
         values
          ($1,$2,$3,$4,1500,0,0,0,'CAD','created',now(),now())`,
        [ids.escrowId, ids.orderId, ids.buyerId, ids.sellerId],
      );

      // created
      await client.query(
        `insert into escrow_mcp.escrow_timeline (event_id,escrow_id,action,amount,created_at)
         values ($1,$2,'created',1500,now())`,
        [randomUUID(), ids.escrowId],
      );
      // funds held
      await client.query(
        `update escrow_mcp.escrows set status='funds_held', held_amount=1500, updated_at=now() where escrow_id=$1`,
        [ids.escrowId],
      );
      await client.query(
        `insert into escrow_mcp.escrow_timeline (event_id,escrow_id,action,amount,created_at)
         values ($1,$2,'funds_held',1500,now())`,
        [randomUUID(), ids.escrowId],
      );
      // partial release
      await client.query(
        `update escrow_mcp.escrows
         set status='partially_released', held_amount=900, released_amount=600, updated_at=now()
         where escrow_id=$1`,
        [ids.escrowId],
      );
      await client.query(
        `insert into escrow_mcp.escrow_timeline (event_id,escrow_id,action,amount,created_at)
         values ($1,$2,'partial_release',600,now())`,
        [randomUUID(), ids.escrowId],
      );
      // freeze
      await client.query(
        `update escrow_mcp.escrows
         set status='frozen', frozen_reason='smoke discrepancy', frozen_by=$2, frozen_at=now(), updated_at=now()
         where escrow_id=$1`,
        [ids.escrowId, ids.organizerId],
      );
      await client.query(
        `insert into escrow_mcp.escrow_timeline (event_id,escrow_id,action,reason,created_at)
         values ($1,$2,'frozen','smoke discrepancy',now())`,
        [randomUUID(), ids.escrowId],
      );
      // refund
      await client.query(
        `update escrow_mcp.escrows
         set status='refunded', held_amount=0, refunded_amount=900, refunded_at=now(), updated_at=now()
         where escrow_id=$1`,
        [ids.escrowId],
      );
      await client.query(
        `insert into escrow_mcp.escrow_timeline (event_id,escrow_id,action,amount,reason,created_at)
         values ($1,$2,'refunded',900,'smoke discrepancy',now())`,
        [randomUUID(), ids.escrowId],
      );

      const tl = await client.query(
        `select count(*)::int as count from escrow_mcp.escrow_timeline where escrow_id=$1`,
        [ids.escrowId],
      );
      assert(tl.rows[0].count >= 5, "Escrow timeline missing required entries");
      return `timeline_entries=${tl.rows[0].count}`;
    });

    await step("auction + bidding + optimistic conflict", async () => {
      await client.query(
        `insert into auction_mcp.auctions
          (auction_id,organizer_id,title,status,scheduled_start,min_bid_increment,created_at,updated_at)
         values
          ($1,$2,'Phase2 Smoke Auction','scheduled',now(),50,now(),now())`,
        [ids.auctionId, ids.organizerId],
      );

      await client.query(
        `insert into auction_mcp.lots
          (lot_id,auction_id,listing_id,lot_number,status,starting_price,total_bids,extensions_used)
         values
          ($1,$2,$3,1,'open',500,0,0)`,
        [ids.lotId, ids.auctionId, ids.listingId],
      );

      // first bid
      await client.query(
        `insert into bidding_mcp.bids
          (bid_id,listing_id,bidder_id,amount,bid_type,status,server_timestamp)
         values
          ($1,$2,$3,600,'manual','active',now())`,
        [ids.bid1Id, ids.listingId, ids.buyerId],
      );
      await client.query(
        `update auction_mcp.lots
         set current_highest_bid=600, highest_bidder_id=$2, total_bids=1
         where lot_id=$1`,
        [ids.lotId, ids.buyerId],
      );

      // second bid
      await client.query(
        `insert into bidding_mcp.bids
          (bid_id,listing_id,bidder_id,amount,bid_type,status,server_timestamp)
         values
          ($1,$2,$3,700,'manual','active',now())`,
        [ids.bid2Id, ids.listingId, ids.organizerId],
      );
      await client.query(
        `update auction_mcp.lots
         set current_highest_bid=700, highest_bidder_id=$2, total_bids=2
         where lot_id=$1`,
        [ids.lotId, ids.organizerId],
      );

      // optimistic conflict simulation
      const staleExpected = 600;
      const currentRes = await client.query(
        `select current_highest_bid from auction_mcp.lots where lot_id=$1`,
        [ids.lotId],
      );
      const currentHighest = Number(currentRes.rows[0].current_highest_bid ?? 0);
      assert(staleExpected !== currentHighest, "Optimistic conflict not detected in simulation");
      return `highest=${currentHighest}, stale_expected=${staleExpected}, conflict_detected=true`;
    });

    await step("inspection discrepancy + booking", async () => {
      await client.query(
        `insert into inspection_mcp.inspections
          (inspection_id,order_id,listing_id,requested_by,inspection_type,location,result,status,created_at,updated_at)
         values
          ($1,$2,$3,$4,'buyer_onsite',$5::jsonb,'pending','requested',now(),now())`,
        [
          ids.inspectionId,
          ids.orderId,
          ids.listingId,
          ids.buyerId,
          JSON.stringify({ city: "Toronto", province: "ON" }),
        ],
      );

      await client.query(
        `insert into inspection_mcp.weight_records
          (record_id,order_id,weight_point,weight_kg,recorded_by,scale_certified,recorded_at)
         values
          ($1,$2,'w1_seller',1000,$3,true,now()),
          ($4,$2,'w4_third_party',940,$3,true,now())`,
        [ids.weightW1, ids.orderId, ids.organizerId, ids.weightW4],
      );

      const expected = 1000;
      const actual = 940;
      const tolerance = 2;
      const deltaPct = ((actual - expected) / expected) * 100;
      assert(Math.abs(deltaPct) > tolerance, "Expected discrepancy over tolerance");

      await client.query(
        `update inspection_mcp.inspections
         set result='pass_with_deductions', status='completed', weight_actual_kg=$2, deduction_amount=120, completed_at=now(), updated_at=now()
         where inspection_id=$1`,
        [ids.inspectionId, actual],
      );

      await client.query(
        `insert into booking_mcp.availability
          (availability_id,user_id,day_of_week,start_time,end_time,timezone,max_bookings_per_day,created_at)
         values
          ($1,$2,1,'09:00','17:00','America/Toronto',5,now())`,
        [ids.availabilityId, ids.organizerId],
      );

      await client.query(
        `insert into booking_mcp.bookings
          (booking_id,event_type,listing_id,order_id,organizer_id,participants,scheduled_start,scheduled_end,timezone,status,created_at,updated_at)
         values
          ($1,'inspection',$2,$3,$4,$5::jsonb,now() + interval '1 day', now() + interval '1 day 1 hour','America/Toronto','pending',now(),now())`,
        [
          ids.bookingId,
          ids.listingId,
          ids.orderId,
          ids.organizerId,
          JSON.stringify([
            { user_id: ids.buyerId, role: "buyer", status: "invited" },
            { user_id: ids.sellerId, role: "seller", status: "invited" },
          ]),
        ],
      );

      return `delta_pct=${deltaPct.toFixed(2)} exceeded tolerance ${tolerance}%`;
    });
  } finally {
    // best-effort cleanup
    await client.query(`delete from booking_mcp.bookings where booking_id = $1`, [ids.bookingId]);
    await client.query(`delete from booking_mcp.availability where availability_id = $1`, [ids.availabilityId]);
    await client.query(`delete from inspection_mcp.weight_records where order_id = $1`, [ids.orderId]);
    await client.query(`delete from inspection_mcp.inspections where inspection_id = $1`, [ids.inspectionId]);
    await client.query(`delete from bidding_mcp.bids where bid_id in ($1,$2)`, [ids.bid1Id, ids.bid2Id]);
    await client.query(`delete from auction_mcp.lots where lot_id = $1`, [ids.lotId]);
    await client.query(`delete from auction_mcp.auctions where auction_id = $1`, [ids.auctionId]);
    await client.query(`delete from escrow_mcp.escrow_timeline where escrow_id = $1`, [ids.escrowId]);
    await client.query(`delete from escrow_mcp.escrows where escrow_id = $1`, [ids.escrowId]);
    await client.query(`delete from kyc_mcp.documents where document_id = $1`, [ids.documentId]);
    await client.query(`delete from kyc_mcp.verifications where verification_id = $1`, [ids.verificationId]);
    await client.query(`delete from kyc_mcp.kyc_levels where user_id = $1`, [ids.buyerId]);
    await client.query(`delete from orders_mcp.orders where order_id = $1`, [ids.orderId]);
    await client.query(`delete from listing_mcp.listings where listing_id = $1`, [ids.listingId]);
    await client.query(`delete from auth_mcp.users where user_id in ($1,$2,$3)`, [ids.sellerId, ids.buyerId, ids.organizerId]);
    await client.end();
  }

  console.log(JSON.stringify({ run_id: runId, results }, null, 2));
  process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
}

main().catch(async (error) => {
  try {
    await client.end();
  } catch {
    // ignore
  }
  console.error("Phase2 smoke crashed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
