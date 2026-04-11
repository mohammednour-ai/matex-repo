import { test, expect, type Page } from "@playwright/test";

function seedAuth(page: Page): void {
  page.addInitScript(() => {
    localStorage.setItem("matex_token", "func-test-token");
    localStorage.setItem(
      "matex_user",
      JSON.stringify({ userId: "func-user", email: "func@test.com", accountType: "both" }),
    );
  });
}

test.describe("Search & Discovery (Functional)", () => {
  test.beforeEach(async ({ page }) => {
    seedAuth(page);
  });

  test("SRCH-01: Search by keyword returns results area", async ({
    page,
  }) => {
    await page.goto("/search");
    await page.waitForSelector("h2");

    const searchInput = page.locator(
      "input[placeholder*='Materials']",
    );
    await searchInput.fill("copper");
    await searchInput.press("Enter");

    const resultsSection = page.locator("text=/result/i");
    await expect(resultsSection).toBeVisible({ timeout: 10_000 });
  });

  test("SRCH-02: Empty search shows results section", async ({ page }) => {
    await page.goto("/search");
    await page.waitForSelector("h2");

    const resultsArea = page.locator("text=/result|Browse Materials/i");
    await expect(resultsArea).toBeVisible({ timeout: 10_000 });
  });

  test("SRCH-03: Filter sidebar has category checkboxes", async ({
    page,
  }) => {
    await page.goto("/search");
    await page.waitForSelector("h2");

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible({ timeout: 5_000 });

    const categoryLabel = sidebar.locator("text=Category");
    await expect(categoryLabel).toBeVisible();

    const ferrousBtn = sidebar.locator("button", { hasText: "Ferrous Metals" });
    await expect(ferrousBtn).toBeVisible();

    const plasticsBtn = sidebar.locator("button", { hasText: "Plastics" });
    await expect(plasticsBtn).toBeVisible();
  });

  test("SRCH-04: Save search button is present", async ({ page }) => {
    await page.goto("/search");
    await page.waitForSelector("h2");

    const saveBtn = page.getByRole("button", { name: /save this search/i });
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
  });
});
