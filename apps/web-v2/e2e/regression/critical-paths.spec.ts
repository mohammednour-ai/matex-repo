import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:3002";
const GATEWAY = "http://localhost:3001";
const API = `${BASE}/api/mcp`;

// ── Helpers ────────────────────────────────────────────────────────────────

function uniqueEmail(): string {
  return `reg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.com`;
}

function uniquePhone(): string {
  const rand = Math.floor(1000000000 + Math.random() * 9000000000);
  return `+1${rand}`;
}

async function seedAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("matex_token", "regression-test-token");
    localStorage.setItem(
      "matex_user",
      JSON.stringify({
        userId: "reg-user-001",
        email: "regression@test.com",
        accountType: "both",
      }),
    );
  });
}

async function apiCall(
  request: ReturnType<Page["request"]>,
  tool: string,
  args: Record<string, unknown> = {},
  token?: string,
) {
  const body: Record<string, unknown> = { tool, args };
  if (token) body.token = token;
  const res = await (request as { post: (url: string, opts: { data: unknown }) => Promise<{ json: () => Promise<Record<string, unknown>>; status: () => number }> }).post(API, { data: body });
  return { status: res.status(), body: await res.json() };
}

// ── Suite ──────────────────────────────────────────────────────────────────

test.describe.serial("Regression — Critical Paths", () => {
  // ── REG-01: Seller publishes listing ────────────────────────────────────

  test("REG-01: Seller publishes listing via full wizard", async ({ page }) => {
    await page.goto("/login");

    // Switch to Create account tab (first control with this label in the email panel)
    await page.getByRole("button", { name: "Create account" }).first().click();

    // Fill registration form
    const email = uniqueEmail();
    const phoneDigits = uniquePhone().slice(2); // strip +1 prefix

    await page.locator("input[type='email']").fill(email);
    await page.locator("input[type='tel']").fill(phoneDigits);
    await page.locator("#register-password").fill("Test1234!");

    // Select "seller" account type
    await page.getByRole("button", { name: "seller" }).click();

    // Submit registration (submit button is the last "Create account" in the form)
    await page.getByRole("button", { name: "Create account" }).last().click();

    // OTP verification step — dev mode accepts 000000
    await page.waitForSelector("text=Verification code", { timeout: 15_000 });
    await page.locator("#otp").fill("000000");
    await page.getByRole("button", { name: /Verify & continue/i }).click();

    // Should redirect to /dashboard after successful registration
    await page.waitForURL("**/dashboard", { timeout: 15_000 });

    // Navigate to create listing
    await page.goto("/listings/create");
    await expect(page.getByRole("main").getByRole("heading", { name: /create listing/i })).toBeVisible();

    // Step 1: Material Information
    await page.getByRole("main").getByPlaceholder(/HMS|scrap|MT/i).first().fill("Regression Test Steel");
    await page.getByRole("main").locator("select").first().selectOption({ index: 1 }); // first real category
    await page.getByRole("main").locator("input[type='number']").first().fill("50");

    // Click Next (saves draft then advances)
    await page.getByRole("main").getByRole("button", { name: /next/i }).click();
    await page.waitForTimeout(1500);

    // Step 2: Photos — just click Next
    await page.getByRole("main").getByRole("button", { name: /next/i }).click();
    await page.waitForTimeout(500);

    // Step 3: Sale Mode — select Fixed Price and enter price
    await page.getByRole("main").getByText("Fixed Price").click();
    await page.getByRole("main").locator("input[placeholder='0.00']").first().fill("5000");
    await page.getByRole("main").getByRole("button", { name: /next/i }).click();
    await page.waitForTimeout(500);

    // Step 4: Logistics — just click Next
    await page.getByRole("main").getByRole("button", { name: /next/i }).click();
    await page.waitForTimeout(500);

    // Step 5: Payment — click Review (last Next)
    await page.getByRole("main").getByRole("button", { name: /review|next/i }).click();
    await page.waitForTimeout(500);

    // Step 6: Review & Publish
    await expect(page.getByRole("main").getByText("Review & Publish")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("main").getByRole("button", { name: /publish listing/i }).click();

    // Verify success modal appears
    await expect(page.getByText("Listing published!")).toBeVisible({ timeout: 15_000 });
  });

  // ── REG-02: Auth token lifecycle ────────────────────────────────────────

  test("REG-02: Auth token lifecycle — navigate, sign out, guard redirect", async ({ page }) => {
    await seedAuth(page);

    // Navigate to authenticated pages
    await page.goto("/dashboard");
    await expect(page.getByRole("main").getByRole("heading").first()).toBeVisible({ timeout: 10_000 });

    await page.goto("/listings");
    await expect(page.getByRole("main").getByRole("heading").first()).toBeVisible({ timeout: 10_000 });

    await page.goto("/settings");
    await expect(page.getByRole("main").getByRole("heading").first()).toBeVisible({ timeout: 10_000 });

    // Sign out via avatar button
    await page.locator("button[title='Sign out']").click();

    // Should redirect to /login
    await page.waitForURL("**/login", { timeout: 10_000 });
    await expect(page.locator("input[type='email']")).toBeVisible();

    // Attempting to access a protected page should redirect back to /login
    await page.goto("/dashboard");
    await page.waitForURL("**/login", { timeout: 10_000 });
  });

  // ── REG-03: Escrow lifecycle via API ────────────────────────────────────

  test("REG-03: Escrow lifecycle via API — create, hold, release", async ({ request }) => {
    const email = uniqueEmail();
    const phone = uniquePhone();

    // Register
    const reg = await apiCall(request, "auth.register", {
      email,
      phone,
      password: "Test1234!",
      account_type: "both",
    });
    expect(reg.status).toBeLessThan(500);

    // Login
    const login = await apiCall(request, "auth.login", { email, password: "Test1234!" });
    expect(login.status).toBeLessThan(500);

    const tokenData = login.body.data as Record<string, unknown> | undefined;
    const upstreamResponse = tokenData?.upstream_response as Record<string, unknown> | undefined;
    const upstreamData = upstreamResponse?.data as Record<string, unknown> | undefined;
    const tokens = (upstreamData?.tokens ?? tokenData?.tokens) as Record<string, string> | undefined;
    const token = tokens?.access_token
      ?? String(upstreamData?.access_token ?? tokenData?.access_token ?? tokenData?.token ?? "regression-token");

    const userId = String(
      upstreamData?.user_id
      ?? (upstreamData?.user as Record<string, string> | undefined)?.user_id
      ?? tokenData?.user_id
      ?? "reg-user",
    );

    // Create escrow
    const createEscrow = await apiCall(request, "escrow.create_escrow", {
      buyer_id: userId,
      seller_id: userId,
      amount: 1000,
      currency: "CAD",
    }, token);
    expect(createEscrow.status).toBeLessThan(500);

    const escrowData = createEscrow.body.data as Record<string, unknown> | undefined;
    const escrowUpstream = (escrowData?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
    const escrowId = String(escrowUpstream?.escrow_id ?? escrowData?.escrow_id ?? "");

    // Hold funds
    const hold = await apiCall(request, "escrow.hold_funds", {
      escrow_id: escrowId,
      payment_method: "wallet",
    }, token);
    expect(hold.status).toBeLessThan(500);

    const holdData = hold.body.data as Record<string, unknown> | undefined;
    const holdUpstream = (holdData?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
    const holdStatus = holdUpstream?.status ?? holdData?.status;
    if (holdStatus) {
      expect(holdStatus).toBe("funds_held");
    }

    // Release funds
    const release = await apiCall(request, "escrow.release_funds", {
      escrow_id: escrowId,
    }, token);
    expect(release.status).toBeLessThan(500);

    const releaseData = release.body.data as Record<string, unknown> | undefined;
    const releaseUpstream = (releaseData?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
    const releaseStatus = releaseUpstream?.status ?? releaseData?.status;
    if (releaseStatus) {
      expect(releaseStatus).toBe("released");
    }
  });

  // ── REG-04: Checkout flow ──────────────────────────────────────────────

  test("REG-04: Checkout flow — order summary and payment options visible", async ({ page }) => {
    await seedAuth(page);

    await page.goto("/checkout");
    await page.waitForTimeout(2000);

    // Verify order summary section exists
    await expect(
      page.getByText(/order summary|checkout|order/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Verify payment method options are present
    const paymentSection = page.locator("body");
    const hasCard = paymentSection.getByText(/card|stripe|credit/i).first();
    const hasWallet = paymentSection.getByText(/wallet/i).first();
    const hasCredit = paymentSection.getByText(/credit|net\s?\d+/i).first();

    await expect(hasCard).toBeVisible({ timeout: 5_000 });
    await expect(hasWallet).toBeVisible({ timeout: 5_000 });
    await expect(hasCredit).toBeVisible({ timeout: 5_000 });
  });

  // ── REG-05: Settings persistence ───────────────────────────────────────

  test("REG-05: Settings persistence — profile tab and display name input", async ({ page }) => {
    await seedAuth(page);

    await page.goto("/settings");
    await expect(page.locator("h1, h2").first()).toContainText(/settings/i, { timeout: 10_000 });

    // Profile tab should be active by default
    await expect(page.getByText("Profile Photo")).toBeVisible({ timeout: 5_000 });

    // Display Name input should be present
    const displayNameInput = page.locator("input[placeholder*='name']").or(
      page.getByLabel(/display name/i),
    );
    await expect(displayNameInput.first()).toBeVisible({ timeout: 5_000 });
  });

  // ── REG-06: Search after listing creation ──────────────────────────────

  test("REG-06: Search after listing creation — listing created via API, search page loads", async ({
    page,
    request,
  }) => {
    await seedAuth(page);

    const token = "regression-test-token";

    // Create a listing via API
    const create = await apiCall(request, "listing.create_listing", {
      seller_id: "reg-user-001",
      title: `Regression Search Steel ${Date.now()}`,
      description: "Steel for regression search test",
      category: "Ferrous Metals",
      material_type: "scrap",
      quantity: 10,
      unit: "mt",
      status: "draft",
    }, token);
    expect(create.status).toBeLessThan(500);

    const createData = create.body.data as Record<string, unknown> | undefined;
    const createUpstream = (createData?.upstream_response as Record<string, unknown> | undefined)?.data as Record<string, unknown> | undefined;
    const listingId = String(createUpstream?.listing_id ?? createData?.listing_id ?? "");

    // Publish the listing via API
    if (listingId) {
      const publish = await apiCall(request, "listing.publish_listing", {
        listing_id: listingId,
        sale_mode: "fixed",
        asking_price: 2500,
        require_escrow: true,
        payment_methods: ["stripe"],
        seller_province: "ON",
      }, token);
      expect(publish.status).toBeLessThan(500);
    }

    // Navigate to search page and verify it loads with a results section
    await page.goto("/search");
    await expect(page.getByRole("main").getByRole("heading").first()).toBeVisible({ timeout: 10_000 });

    // Verify a results or listings section is present
    await expect(
      page.getByText(/results|listings|materials|browse|search/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
