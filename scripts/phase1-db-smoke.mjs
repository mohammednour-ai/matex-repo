#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const runId = Date.now().toString();
const created = {
  users: [],
  listingId: null,
  threadId: null,
  walletUserId: null,
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

function hash(input) {
  return createHash("sha256").update(input).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const sellerEmail = `seller.${runId}@matex-smoke.local`;
  const buyerEmail = `buyer.${runId}@matex-smoke.local`;
  const sellerPhone = `+1416${runId.slice(-7)}`;
  const buyerPhone = `+1647${runId.slice(-7)}`;
  const passwordHash = hash(`P@ssw0rd-${runId}`);

  let sellerId = "";
  let buyerId = "";
  let categoryId = "";

  await step("auth: create seller/buyer users", async () => {
    const sellerInsert = await supabase
      .schema("auth_mcp")
      .from("users")
      .insert({
        user_id: randomUUID(),
        email: sellerEmail,
        phone: sellerPhone,
        password_hash: passwordHash,
        account_type: "corporate",
        account_status: "active",
        email_verified: true,
        phone_verified: true,
      })
      .select("user_id")
      .single();
    if (sellerInsert.error) throw new Error(sellerInsert.error.message);

    const buyerInsert = await supabase
      .schema("auth_mcp")
      .from("users")
      .insert({
        user_id: randomUUID(),
        email: buyerEmail,
        phone: buyerPhone,
        password_hash: passwordHash,
        account_type: "individual",
        account_status: "active",
        email_verified: true,
        phone_verified: true,
      })
      .select("user_id")
      .single();
    if (buyerInsert.error) throw new Error(buyerInsert.error.message);

    sellerId = sellerInsert.data.user_id;
    buyerId = buyerInsert.data.user_id;
    created.users.push(sellerId, buyerId);
    return `seller=${sellerId}, buyer=${buyerId}`;
  });

  await step("profile: upsert profile + preferences", async () => {
    const profileUpsert = await supabase
      .schema("profile_mcp")
      .from("profiles")
      .upsert({
        user_id: sellerId,
        first_name: "Seller",
        last_name: "Smoke",
        language: "en",
        timezone: "America/Toronto",
        country: "CA",
      });
    if (profileUpsert.error) throw new Error(profileUpsert.error.message);

    const prefUpsert = await supabase
      .schema("profile_mcp")
      .from("preferences")
      .upsert({
        user_id: sellerId,
        notification_prefs: { email: true, sms: false },
      });
    if (prefUpsert.error) throw new Error(prefUpsert.error.message);
    return "profile and preferences persisted";
  });

  await step("listing: create and publish listing", async () => {
    const categoryRes = await supabase
      .schema("listing_mcp")
      .from("categories")
      .select("category_id")
      .eq("slug", "ferrous-metals")
      .maybeSingle();
    if (categoryRes.error) throw new Error(categoryRes.error.message);
    assert(categoryRes.data?.category_id, "Seeded category ferrous-metals not found");
    categoryId = categoryRes.data.category_id;

    const listingId = randomUUID();
    const slug = `smoke-listing-${runId}`;
    const createdAt = new Date().toISOString();
    const createListing = await supabase
      .schema("listing_mcp")
      .from("listings")
      .insert({
        listing_id: listingId,
        seller_id: sellerId,
        title: "Smoke Test Scrap Steel",
        slug,
        category_id: categoryId,
        description: "Phase 1.5 DB smoke listing",
        quantity: 1250.5,
        unit: "kg",
        price_type: "fixed",
        asking_price: 500.0,
        images: [],
        location: "SRID=4326;POINT(-79.3832 43.6532)",
        pickup_address: {
          street: "1 Queen St W",
          city: "Toronto",
          province: "ON",
          postal_code: "M5H2N2",
          country: "CA",
        },
        status: "draft",
        created_at: createdAt,
      });
    if (createListing.error) throw new Error(createListing.error.message);

    const publishListing = await supabase
      .schema("listing_mcp")
      .from("listings")
      .update({ status: "active", published_at: new Date().toISOString() })
      .eq("listing_id", listingId);
    if (publishListing.error) throw new Error(publishListing.error.message);

    created.listingId = listingId;
    return `listing=${listingId}, category=${categoryId}`;
  });

  await step("search: query active listing", async () => {
    const res = await supabase
      .schema("listing_mcp")
      .from("listings")
      .select("listing_id,title,status")
      .eq("status", "active")
      .ilike("title", "%Smoke Test Scrap Steel%")
      .limit(5);
    if (res.error) throw new Error(res.error.message);
    assert((res.data ?? []).length > 0, "Search did not return smoke listing");
    return `matches=${res.data.length}`;
  });

  await step("messaging: create thread and send message", async () => {
    const threadId = randomUUID();
    const createThread = await supabase
      .schema("messaging_mcp")
      .from("threads")
      .insert({
        thread_id: threadId,
        listing_id: created.listingId,
        participants: [sellerId, buyerId],
        thread_type: "general",
      });
    if (createThread.error) throw new Error(createThread.error.message);

    const messageId = randomUUID();
    const sendMessage = await supabase
      .schema("messaging_mcp")
      .from("messages")
      .insert({
        message_id: messageId,
        thread_id: threadId,
        sender_id: buyerId,
        content: "Smoke test message",
      });
    if (sendMessage.error) throw new Error(sendMessage.error.message);

    created.threadId = threadId;
    return `thread=${threadId}, message=${messageId}`;
  });

  await step("payments: wallet + topup transaction + purchase transaction", async () => {
    const wallet = await supabase
      .schema("payments_mcp")
      .from("wallets")
      .upsert({
        user_id: buyerId,
        balance: 1000,
        pending_balance: 0,
        currency: "CAD",
      })
      .select("wallet_id,user_id")
      .single();
    if (wallet.error) throw new Error(wallet.error.message);

    const topupTx = await supabase
      .schema("payments_mcp")
      .from("transactions")
      .insert({
        transaction_id: randomUUID(),
        payer_id: buyerId,
        amount: 200,
        currency: "CAD",
        payment_method: "wallet",
        transaction_type: "wallet_topup",
        status: "completed",
      });
    if (topupTx.error) throw new Error(topupTx.error.message);

    const purchaseTx = await supabase
      .schema("payments_mcp")
      .from("transactions")
      .insert({
        transaction_id: randomUUID(),
        payer_id: buyerId,
        payee_id: sellerId,
        amount: 500,
        original_amount: 500,
        currency: "CAD",
        payment_method: "stripe_card",
        transaction_type: "purchase",
        status: "completed",
        metadata: {
          escrow_reference: {
            order_id: null,
            escrow_state: "pending_funding",
          },
        },
      });
    if (purchaseTx.error) throw new Error(purchaseTx.error.message);

    created.walletUserId = wallet.data.user_id;
    return `wallet_user=${wallet.data.user_id}`;
  });

  // Cleanup best effort (non-fatal)
  await supabase.schema("payments_mcp").from("transactions").delete().eq("payer_id", buyerId);
  await supabase.schema("payments_mcp").from("wallets").delete().eq("user_id", buyerId);
  if (created.threadId) {
    await supabase.schema("messaging_mcp").from("messages").delete().eq("thread_id", created.threadId);
    await supabase.schema("messaging_mcp").from("threads").delete().eq("thread_id", created.threadId);
  }
  if (created.listingId) {
    await supabase.schema("listing_mcp").from("favorites").delete().eq("listing_id", created.listingId);
    await supabase.schema("listing_mcp").from("listings").delete().eq("listing_id", created.listingId);
  }
  if (sellerId) {
    await supabase.schema("profile_mcp").from("preferences").delete().eq("user_id", sellerId);
    await supabase.schema("profile_mcp").from("profiles").delete().eq("user_id", sellerId);
  }
  if (created.users.length > 0) {
    await supabase.schema("auth_mcp").from("users").delete().in("user_id", created.users);
  }

  console.log(JSON.stringify({ run_id: runId, results }, null, 2));
  const failures = results.filter((r) => r.status === "FAIL");
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Smoke test crashed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
