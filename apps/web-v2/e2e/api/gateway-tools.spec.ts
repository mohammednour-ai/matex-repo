import { test, expect } from "@playwright/test";

const GATEWAY = "http://localhost:3001";

let userId = "";
let token = "";
const testEmail = `api-${Date.now()}@matex-qa.com`;
const testPassword = "TestPassword123!";

test.describe.serial("DB/API Gateway Tools", () => {
  test("API-01: auth.register returns user_id and active status", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      data: {
        tool: "auth.register",
        args: { email: testEmail, phone: "+14165550100", password: testPassword, account_type: "both" },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.user_id).toBeTruthy();
    expect(body.data.status).toBe("active");
    userId = body.data.user_id;
  });

  test("API-02: auth.login returns JWT with correct claims", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      data: { tool: "auth.login", args: { email: testEmail, password: testPassword } },
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tokens.access_token).toBeTruthy();
    expect(body.data.tokens.refresh_token).toBeTruthy();
    expect(body.data.tokens.expires_in).toBe(900);
    expect(body.data.mfa_required).toBe(false);
    token = body.data.tokens.access_token;

    const payload = JSON.parse(atob(token.split(".")[1]));
    expect(payload.sub).toBe(userId);
    expect(payload.scope).toBe("access");
  });

  test("API-03: auth.login with wrong password returns AUTH_ERROR", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      data: { tool: "auth.login", args: { email: testEmail, password: "wrongpassword" } },
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTH_ERROR");
  });

  test("API-04: listing.create_listing returns listing_id in draft", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: {
        tool: "listing.create_listing",
        args: { title: "API Test Copper Scrap", category: "Non-Ferrous Metals", quantity: 25, unit: "mt" },
      },
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.listing_id).toBeTruthy();
    expect(body.data.status).toBe("draft");
  });

  test("API-05: listing.publish_listing returns active status", async ({ request }) => {
    const createRes = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: { tool: "listing.create_listing", args: { title: "Publish Test", category: "Ferrous Metals", quantity: 10, unit: "mt" } },
    });
    const listingId = (await createRes.json()).data.listing_id;

    const res = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: { tool: "listing.publish_listing", args: { listing_id: listingId } },
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("active");
    expect(body.data.published_at).toBeTruthy();
  });

  test("API-06: search.search_materials returns published listings", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: { tool: "search.search_materials", args: { query: "Publish Test" } },
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.results).toBeInstanceOf(Array);
  });

  test("API-07: tax.calculate_tax ON->ON correct HST 13%", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: { tool: "tax.calculate_tax", args: { subtotal: 10000, seller_province: "ON", buyer_province: "ON" } },
    });
    const body = await res.json();
    expect(body.data.hst_amount).toBe(1300);
    expect(body.data.gst_amount).toBe(0);
    expect(body.data.total_tax).toBe(1300);
    expect(body.data.total_amount).toBe(11300);
  });

  test("API-08: tax.calculate_tax BC correct GST 5% + PST 7%", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: { tool: "tax.calculate_tax", args: { subtotal: 10000, seller_province: "BC", buyer_province: "BC" } },
    });
    const body = await res.json();
    expect(body.data.gst_amount).toBe(500);
    expect(body.data.pst_amount).toBe(700);
    expect(body.data.hst_amount).toBe(0);
    expect(body.data.total_tax).toBe(1200);
  });

  test("API-09: tax.calculate_tax QC correct GST 5% + QST 9.975%", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: { tool: "tax.calculate_tax", args: { subtotal: 10000, seller_province: "QC", buyer_province: "QC" } },
    });
    const body = await res.json();
    expect(body.data.gst_amount).toBe(500);
    expect(body.data.qst_amount).toBe(997.5);
    expect(body.data.total_tax).toBe(1497.5);
  });

  test("API-10: escrow.create_escrow returns created status", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: { tool: "escrow.create_escrow", args: { order_id: "test-order-1", amount: 5000 } },
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.escrow_id).toBeTruthy();
    expect(body.data.status).toBe("created");
  });

  test("API-11: escrow.hold_funds returns funds_held status", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: { tool: "escrow.hold_funds", args: { escrow_id: "test-escrow-1", amount: 5000 } },
    });
    const body = await res.json();
    expect(body.data.status).toBe("funds_held");
  });

  test("API-12: payments.get_wallet_balance returns zero balance", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: { tool: "payments.get_wallet_balance", args: { user_id: userId } },
    });
    const body = await res.json();
    expect(body.data.wallet.balance).toBe(0);
    expect(body.data.wallet.pending_balance).toBe(0);
  });

  test("API-13: logistics.get_quotes returns 3 carrier quotes", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: { tool: "logistics.get_quotes", args: {} },
    });
    const body = await res.json();
    expect(body.data.quotes).toHaveLength(3);
    const names = body.data.quotes.map((q: { carrier: string }) => q.carrier);
    expect(names).toContain("Day & Ross");
    expect(names).toContain("Manitoulin Transport");
    expect(names).toContain("Purolator Freight");
  });

  test("API-14: unknown domain returns UNKNOWN_DOMAIN error", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: { tool: "fakeDomain.fakeAction", args: {} },
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNKNOWN_DOMAIN");
  });

  test("API-15: missing JWT on protected tool returns 401", async ({ request }) => {
    const res = await request.post(`${GATEWAY}/tool`, {
      data: { tool: "listing.create_listing", args: { title: "No Auth" } },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("API-16: rate limit returns 429 after threshold", async ({ request }) => {
    const promises = [];
    for (let i = 0; i < 130; i++) {
      promises.push(
        request.post(`${GATEWAY}/tool`, {
          headers: { authorization: `Bearer ${token}` },
          data: { tool: "analytics.get_dashboard_stats", args: {} },
        }),
      );
    }
    const results = await Promise.all(promises);
    const statuses = results.map((r) => r.status());
    expect(statuses).toContain(429);
  });
});
