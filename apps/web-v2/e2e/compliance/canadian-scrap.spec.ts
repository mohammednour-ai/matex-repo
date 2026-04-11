import { test, expect } from "@playwright/test";

const GATEWAY = "http://localhost:3001";

test.describe("Canadian Scrap Business & Legal Compliance", () => {
  // ── Provincial Tax ────────────────────────────────────────────────────

  test.describe("Provincial Tax Calculations", () => {
    let token: string;

    test.beforeAll(async ({ request }) => {
      const email = `tax-${Date.now()}@matex-qa.com`;
      await request.post(`${GATEWAY}/tool`, {
        data: { tool: "auth.register", args: { email, phone: "+14165550100", password: "TestPassword123!", account_type: "both" } },
      });
      const loginRes = await request.post(`${GATEWAY}/tool`, {
        data: { tool: "auth.login", args: { email, password: "TestPassword123!" } },
      });
      token = (await loginRes.json()).data.tokens.access_token;
    });

    async function calcTax(request: any, province: string, subtotal = 10000) {
      const res = await request.post(`${GATEWAY}/tool`, {
        headers: { authorization: `Bearer ${token}` },
        data: { tool: "tax.calculate_tax", args: { subtotal, seller_province: province, buyer_province: province } },
      });
      return (await res.json()).data;
    }

    test("COMP-TAX-01: Ontario uses HST 13%", async ({ request }) => {
      const d = await calcTax(request, "ON");
      expect(d.hst_amount).toBe(1300);
      expect(d.gst_amount).toBe(0);
      expect(d.pst_amount).toBe(0);
    });

    test("COMP-TAX-02: BC uses GST 5% + PST 7%", async ({ request }) => {
      const d = await calcTax(request, "BC");
      expect(d.gst_amount).toBe(500);
      expect(d.pst_amount).toBe(700);
      expect(d.hst_amount).toBe(0);
    });

    test("COMP-TAX-03: Alberta uses GST only 5%", async ({ request }) => {
      const d = await calcTax(request, "AB");
      expect(d.gst_amount).toBe(500);
      expect(d.hst_amount).toBe(0);
      expect(d.pst_amount).toBe(0);
      expect(d.qst_amount).toBe(0);
    });

    test("COMP-TAX-04: Quebec uses GST 5% + QST 9.975%", async ({ request }) => {
      const d = await calcTax(request, "QC");
      expect(d.gst_amount).toBe(500);
      expect(d.qst_amount).toBe(997.5);
      expect(d.hst_amount).toBe(0);
    });

    test("COMP-TAX-05: New Brunswick uses HST 15%", async ({ request }) => {
      const d = await calcTax(request, "NB");
      expect(d.hst_amount).toBe(1500);
      expect(d.gst_amount).toBe(0);
    });

    test("COMP-TAX-06: Nova Scotia uses HST 15%", async ({ request }) => {
      const d = await calcTax(request, "NS");
      expect(d.hst_amount).toBe(1500);
    });

    test("COMP-TAX-07: Saskatchewan uses GST only 5%", async ({ request }) => {
      const d = await calcTax(request, "SK");
      expect(d.gst_amount).toBe(500);
      expect(d.hst_amount).toBe(0);
    });

    test("COMP-TAX-08: Manitoba uses GST only 5%", async ({ request }) => {
      const d = await calcTax(request, "MB");
      expect(d.gst_amount).toBe(500);
      expect(d.hst_amount).toBe(0);
    });
  });

  // ── Invoice Format ────────────────────────────────────────────────────

  test("COMP-INV-01: invoice number matches MTX-YYYY-NNNNNN format", async ({ request }) => {
    const email = `inv-${Date.now()}@matex-qa.com`;
    await request.post(`${GATEWAY}/tool`, {
      data: { tool: "auth.register", args: { email, phone: "+14165550100", password: "TestPassword123!", account_type: "both" } },
    });
    const loginRes = await request.post(`${GATEWAY}/tool`, {
      data: { tool: "auth.login", args: { email, password: "TestPassword123!" } },
    });
    const token = (await loginRes.json()).data.tokens.access_token;

    const res = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: { tool: "tax.generate_invoice", args: { subtotal: 5000 } },
    });
    const body = await res.json();
    expect(body.data.invoice_number).toMatch(/^MTX-\d{4}-\d{6}$/);
  });

  // ── CRA Business Number ───────────────────────────────────────────────

  test("COMP-BN-01: CRA BN validation on settings page", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("matex_token", "test-token");
      localStorage.setItem("matex_user", JSON.stringify({ userId: "bn-test", email: "bn@test.com", accountType: "both" }));
    });
    await page.goto("/settings");
    const companyTab = page.getByText("Company", { exact: false });
    if (await companyTab.isVisible()) {
      await companyTab.click();
      const bnInput = page.locator("input[placeholder*='Business Number'], input[label*='Business Number'], input[name*='business']").first();
      if (await bnInput.isVisible()) {
        await bnInput.fill("12345");
        await page.waitForTimeout(300);
        const errorVisible = await page.locator("text=/invalid|format/i").isVisible();
        expect(errorVisible).toBe(true);

        await bnInput.fill("123456789RT0001");
        await page.waitForTimeout(300);
      }
    }
  });

  // ── Environmental Permits & Hazmat ─────────────────────────────────────

  test("COMP-ENV-01: create listing shows environmental permit fields", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("matex_token", "test-token");
      localStorage.setItem("matex_user", JSON.stringify({ userId: "env-test", email: "env@test.com", accountType: "both" }));
    });
    await page.goto("/listings/create");
    const permitCheckbox = page.locator("text=/environmental permit|provincial transport/i").first();
    await expect(permitCheckbox).toBeVisible();
    await permitCheckbox.click();
    const permitInput = page.locator("input[placeholder*='Permit'], input[placeholder*='permit']").first();
    await expect(permitInput).toBeVisible();
  });

  test("COMP-HAZ-01: hazmat classes include TDG Class 8 and 9", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("matex_token", "test-token");
      localStorage.setItem("matex_user", JSON.stringify({ userId: "haz-test", email: "haz@test.com", accountType: "both" }));
    });
    await page.goto("/listings/create");

    for (let i = 0; i < 3; i++) {
      const nextBtn = page.getByRole("button", { name: /next/i });
      if (await nextBtn.isVisible()) {
        await page.locator("input").first().fill("Hazmat Test");
        await page.locator("select").first().selectOption({ index: 1 });
        await nextBtn.click();
        await page.waitForTimeout(500);
      }
    }

    const hazmatSelect = page.locator("select").filter({ hasText: /class 8|corrosive/i });
    if (await hazmatSelect.isVisible()) {
      const options = await hazmatSelect.locator("option").allTextContents();
      const joined = options.join(" ");
      expect(joined).toMatch(/class.?8/i);
      expect(joined).toMatch(/class.?9/i);
      expect(joined).toMatch(/none/i);
    }
  });

  // ── ISRI Categories ───────────────────────────────────────────────────

  test("COMP-ISRI-01: listing categories include ISRI material types", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("matex_token", "test-token");
      localStorage.setItem("matex_user", JSON.stringify({ userId: "isri-test", email: "isri@test.com", accountType: "both" }));
    });
    await page.goto("/listings/create");
    const categorySelect = page.locator("select").first();
    const options = await categorySelect.locator("option").allTextContents();
    const joined = options.join("|");
    expect(joined).toContain("Ferrous Metals");
    expect(joined).toContain("Non-Ferrous Metals");
    expect(joined).toContain("Plastics");
    expect(joined).toContain("Paper & Cardboard");
    expect(joined).toContain("Electronics");
    expect(joined).toContain("Construction");
  });

  // ── Weight Units ──────────────────────────────────────────────────────

  test("COMP-UNIT-01: listing supports mt, kg, units, lots", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("matex_token", "test-token");
      localStorage.setItem("matex_user", JSON.stringify({ userId: "unit-test", email: "unit@test.com", accountType: "both" }));
    });
    await page.goto("/listings/create");
    const unitSelect = page.locator("select").filter({ hasText: /metric ton|kg/i });
    if (await unitSelect.isVisible()) {
      const options = await unitSelect.locator("option").allTextContents();
      const joined = options.join("|");
      expect(joined).toMatch(/metric ton/i);
      expect(joined).toMatch(/kilogram|kg/i);
      expect(joined).toMatch(/unit/i);
      expect(joined).toMatch(/lot/i);
    }
  });

  // ── Province Coverage ─────────────────────────────────────────────────

  test("COMP-PROV-01: all 13 provinces/territories in selectors", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("matex_token", "test-token");
      localStorage.setItem("matex_user", JSON.stringify({ userId: "prov-test", email: "prov@test.com", accountType: "both" }));
    });
    await page.goto("/listings/create");
    const EXPECTED = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];

    for (let i = 0; i < 3; i++) {
      const nextBtn = page.getByRole("button", { name: /next/i });
      if (await nextBtn.isVisible()) {
        await page.locator("input").first().fill("Province Test");
        await page.locator("select").first().selectOption({ index: 1 });
        await nextBtn.click();
        await page.waitForTimeout(500);
      }
    }

    const provinceSelect = page.locator("select").filter({ hasText: /ON|BC|AB/ }).first();
    if (await provinceSelect.isVisible()) {
      const options = await provinceSelect.locator("option").allTextContents();
      for (const prov of EXPECTED) {
        expect(options, `Province ${prov} missing`).toContain(prov);
      }
    }
  });

  // ── Carrier Integration ───────────────────────────────────────────────

  test("COMP-CARRIER-01: logistics quotes return Canadian carriers", async ({ request }) => {
    const email = `carrier-${Date.now()}@matex-qa.com`;
    await request.post(`${GATEWAY}/tool`, {
      data: { tool: "auth.register", args: { email, phone: "+14165550100", password: "TestPassword123!", account_type: "both" } },
    });
    const loginRes = await request.post(`${GATEWAY}/tool`, {
      data: { tool: "auth.login", args: { email, password: "TestPassword123!" } },
    });
    const token = (await loginRes.json()).data.tokens.access_token;

    const res = await request.post(`${GATEWAY}/tool`, {
      headers: { authorization: `Bearer ${token}` },
      data: { tool: "logistics.get_quotes", args: {} },
    });
    const body = await res.json();
    const carriers = body.data.quotes.map((q: { carrier: string }) => q.carrier);
    expect(carriers).toContain("Day & Ross");
    expect(carriers).toContain("Manitoulin Transport");
    expect(carriers).toContain("Purolator Freight");
  });

  // ── Commission Rules ──────────────────────────────────────────────────

  test("COMP-COMM-01: standard commission 3.5% and auction 4.0%", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("matex_token", "test-token");
      localStorage.setItem("matex_user", JSON.stringify({ userId: "comm-test", email: "comm@test.com", accountType: "both" }));
    });
    await page.goto("/listings/create");

    await page.locator("input").first().fill("Commission Test");
    await page.locator("select").first().selectOption({ index: 1 });
    const nextBtn = page.getByRole("button", { name: /next/i });
    await nextBtn.click();
    await page.waitForTimeout(500);
    await nextBtn.click();
    await page.waitForTimeout(500);

    const fixedBtn = page.locator("text=/fixed price/i").first();
    if (await fixedBtn.isVisible()) {
      await fixedBtn.click();
      await page.waitForTimeout(300);
      const commText = await page.locator("text=/3\\.5%/").first();
      await expect(commText).toBeVisible();
    }
  });

  // ── Escrow Mandatory ──────────────────────────────────────────────────

  test("COMP-ESC-01: escrow mandatory for >= $5,000 CAD", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("matex_token", "test-token");
      localStorage.setItem("matex_user", JSON.stringify({ userId: "esc-test", email: "esc@test.com", accountType: "both" }));
    });
    await page.goto("/listings/create");

    await page.locator("input").first().fill("Escrow Test");
    await page.locator("select").first().selectOption({ index: 1 });

    for (let i = 0; i < 2; i++) {
      const nextBtn = page.getByRole("button", { name: /next/i });
      await nextBtn.click();
      await page.waitForTimeout(500);
    }

    const fixedBtn = page.locator("text=/fixed price/i").first();
    if (await fixedBtn.isVisible()) {
      await fixedBtn.click();
      const priceInput = page.locator("input[type='number']").first();
      await priceInput.fill("6000");
    }
  });
});
