#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL.");
  process.exit(1);
}

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const runId = Date.now().toString();
const sellerEmail = `seller.${runId}@matex-smoke.local`;
const buyerEmail = `buyer.${runId}@matex-smoke.local`;
const sellerPhone = `+1416${runId.slice(-7)}`;
const buyerPhone = `+1647${runId.slice(-7)}`;
const passwordHash = createHash("sha256").update(`P@ssw0rd-${runId}`).digest("hex");

const ids = {
  sellerId: randomUUID(),
  buyerId: randomUUID(),
  listingId: randomUUID(),
  threadId: randomUUID(),
  messageId: randomUUID(),
  topupTxId: randomUUID(),
  purchaseTxId: randomUUID(),
};

const results = [];

async function step(name, fn) {
  try {
    const info = await fn();
    results.push({ step: name, status: "PASS", info: info ?? "" });
  } catch (error) {
    results.push({
      step: name,
      status: "FAIL",
      info: error instanceof Error ? error.message : String(error),
    });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await client.connect();

  try {
    await step("auth: create seller/buyer users", async () => {
      await client.query(
        `insert into auth_mcp.users
          (user_id, email, phone, password_hash, account_type, account_status, email_verified, phone_verified)
         values
          ($1, $2, $3, $4, 'corporate', 'active', true, true),
          ($5, $6, $7, $8, 'individual', 'active', true, true)`,
        [ids.sellerId, sellerEmail, sellerPhone, passwordHash, ids.buyerId, buyerEmail, buyerPhone, passwordHash],
      );
      return `seller=${ids.sellerId}, buyer=${ids.buyerId}`;
    });

    await step("profile: upsert profile + preferences", async () => {
      await client.query(
        `insert into profile_mcp.profiles
          (user_id, first_name, last_name, language, timezone, country)
         values ($1, 'Seller', 'Smoke', 'en', 'America/Toronto', 'CA')
         on conflict (user_id) do update
         set first_name = excluded.first_name, last_name = excluded.last_name`,
        [ids.sellerId],
      );

      await client.query(
        `insert into profile_mcp.preferences (user_id, notification_prefs)
         values ($1, $2::jsonb)
         on conflict (user_id) do update
         set notification_prefs = excluded.notification_prefs`,
        [ids.sellerId, JSON.stringify({ email: true, sms: false })],
      );
      return "profile persisted";
    });

    await step("listing: create and publish listing", async () => {
      const categoryRes = await client.query(
        `select category_id from listing_mcp.categories where slug = 'ferrous-metals' limit 1`,
      );
      assert(categoryRes.rowCount > 0, "Seeded category ferrous-metals not found");
      const categoryId = categoryRes.rows[0].category_id;

      await client.query(
        `insert into listing_mcp.listings
          (listing_id, seller_id, title, slug, category_id, description, quantity, unit, price_type, asking_price, images, location, pickup_address, status)
         values
          ($1, $2, 'Smoke Test Scrap Steel', $3, $4, 'Phase 1.5 DB smoke listing', 1250.5, 'kg', 'fixed', 500, '[]'::jsonb,
           ST_SetSRID(ST_MakePoint(-79.3832, 43.6532), 4326)::geography, $5::jsonb, 'draft')`,
        [
          ids.listingId,
          ids.sellerId,
          `smoke-listing-${runId}`,
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
        `update listing_mcp.listings
         set status = 'active', published_at = now()
         where listing_id = $1`,
        [ids.listingId],
      );
      return `listing=${ids.listingId}`;
    });

    await step("search: query active listing", async () => {
      const searchRes = await client.query(
        `select listing_id from listing_mcp.listings
         where status = 'active' and title ilike '%Smoke Test Scrap Steel%'`,
      );
      assert(searchRes.rowCount > 0, "Search did not return smoke listing");
      return `matches=${searchRes.rowCount}`;
    });

    await step("messaging: create thread and send message", async () => {
      await client.query(
        `insert into messaging_mcp.threads
          (thread_id, listing_id, participants, thread_type)
         values ($1, $2, $3::uuid[], 'general')`,
        [ids.threadId, ids.listingId, [ids.sellerId, ids.buyerId]],
      );
      await client.query(
        `insert into messaging_mcp.messages
          (message_id, thread_id, sender_id, content)
         values ($1, $2, $3, 'Smoke test message')`,
        [ids.messageId, ids.threadId, ids.buyerId],
      );
      return `thread=${ids.threadId}, message=${ids.messageId}`;
    });

    await step("payments: wallet + topup + purchase", async () => {
      await client.query(
        `insert into payments_mcp.wallets (user_id, balance, pending_balance, currency)
         values ($1, 1000, 0, 'CAD')
         on conflict (user_id) do update set balance = excluded.balance, pending_balance = excluded.pending_balance`,
        [ids.buyerId],
      );

      await client.query(
        `insert into payments_mcp.transactions
          (transaction_id, payer_id, amount, currency, payment_method, transaction_type, status)
         values ($1, $2, 200, 'CAD', 'wallet', 'wallet_topup', 'completed')`,
        [ids.topupTxId, ids.buyerId],
      );

      await client.query(
        `insert into payments_mcp.transactions
          (transaction_id, payer_id, payee_id, amount, original_amount, currency, payment_method, transaction_type, status, metadata)
         values ($1, $2, $3, 500, 500, 'CAD', 'stripe_card', 'purchase', 'completed', $4::jsonb)`,
        [ids.purchaseTxId, ids.buyerId, ids.sellerId, JSON.stringify({ escrow_reference: { order_id: null, escrow_state: "pending_funding" } })],
      );

      return `wallet_user=${ids.buyerId}`;
    });
  } finally {
    // Best-effort cleanup
    await client.query(`delete from payments_mcp.transactions where transaction_id in ($1, $2)`, [ids.topupTxId, ids.purchaseTxId]);
    await client.query(`delete from payments_mcp.wallets where user_id = $1`, [ids.buyerId]);
    await client.query(`delete from messaging_mcp.messages where thread_id = $1`, [ids.threadId]);
    await client.query(`delete from messaging_mcp.threads where thread_id = $1`, [ids.threadId]);
    await client.query(`delete from listing_mcp.favorites where listing_id = $1`, [ids.listingId]);
    await client.query(`delete from listing_mcp.listings where listing_id = $1`, [ids.listingId]);
    await client.query(`delete from profile_mcp.preferences where user_id = $1`, [ids.sellerId]);
    await client.query(`delete from profile_mcp.profiles where user_id = $1`, [ids.sellerId]);
    await client.query(`delete from auth_mcp.users where user_id in ($1, $2)`, [ids.sellerId, ids.buyerId]);
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
  console.error("Smoke test crashed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
