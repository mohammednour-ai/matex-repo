import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3002";

function seedAuth(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    localStorage.setItem("matex_token", "test-token");
    localStorage.setItem(
      "matex_user",
      JSON.stringify({ userId: "func-test", email: "func@test.com", accountType: "both" }),
    );
  });
}

test.describe("Logistics — Functional", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
  });

  test("LOG-01: Logistics page renders with shipment section", async ({ page }) => {
    await page.goto(`${BASE}/logistics`);

    await expect(page.getByRole("main").getByRole("heading", { name: "Logistics" })).toBeVisible();
    await expect(page.locator("text=Active Shipments")).toBeVisible();

    await expect(page.locator("text=HMS #1 Scrap Steel")).toBeVisible();
    await expect(page.locator("text=Day & Ross")).toBeVisible();
  });

  test("LOG-02: Get Quotes form has origin, destination, weight fields", async ({ page }) => {
    await page.goto(`${BASE}/logistics`);

    await expect(page.locator("text=Get Carrier Quotes")).toBeVisible();

    const originInput = page.locator("input[placeholder='Hamilton, ON']");
    const destInput = page.locator("input[placeholder='Montreal, QC']");
    const weightInput = page.locator("input[placeholder='18000']");
    const hazmatSelect = page.locator("select");

    await expect(originInput).toBeVisible();
    await expect(destInput).toBeVisible();
    await expect(weightInput).toBeVisible();
    await expect(hazmatSelect).toBeVisible();

    const getQuotesBtn = page.locator("button", { hasText: "Get Quotes" });
    await expect(getQuotesBtn).toBeVisible();
    await expect(getQuotesBtn).toBeDisabled();
  });

  test("LOG-03: Quote results show carrier names and prices", async ({ page }) => {
    await page.goto(`${BASE}/logistics`);

    await page.locator("input[placeholder='Hamilton, ON']").fill("Toronto, ON");
    await page.locator("input[placeholder='Montreal, QC']").fill("Calgary, AB");
    await page.locator("input[placeholder='18000']").fill("5000");

    const getQuotesBtn = page.locator("button", { hasText: "Get Quotes" });
    await expect(getQuotesBtn).toBeEnabled();
    await getQuotesBtn.click();

    const quoteTable = page.locator("table");
    await expect(quoteTable).toBeVisible({ timeout: 10000 });

    await expect(page.locator("th", { hasText: "Carrier" })).toBeVisible();
    await expect(page.locator("th", { hasText: "Price" })).toBeVisible();

    const carriers = ["Day & Ross", "Manitoulin Transport", "Purolator Freight"];
    for (const carrier of carriers) {
      await expect(page.locator("td", { hasText: carrier })).toBeVisible();
    }

    const bookBtns = page.locator("button", { hasText: "Book" });
    expect(await bookBtns.count()).toBeGreaterThanOrEqual(1);
  });
});
