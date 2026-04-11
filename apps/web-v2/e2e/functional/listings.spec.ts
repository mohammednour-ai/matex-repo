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

test.describe("Listing Creation (Functional)", () => {
  test.beforeEach(async ({ page }) => {
    seedAuth(page);
  });

  test("LIST-01: Step 1 — fill title + category, Next button enabled", async ({
    page,
  }) => {
    await page.goto("/listings/create");
    await expect(page.getByRole("main").getByRole("heading", { name: /create listing/i })).toBeVisible();
    await expect(page.getByTestId("listing-create-overview")).toBeVisible();

    const titleInput = page.getByRole("main").getByPlaceholder(/HMS|scrap|MT/i).first();
    await titleInput.fill("Copper Wire Scrap — 10 MT");

    const categorySelect = page.getByRole("main").locator("select").first();
    await categorySelect.selectOption("Non-Ferrous Metals");

    const nextBtn = page.getByRole("main").getByRole("button", { name: /next/i });
    await expect(nextBtn).toBeEnabled();
  });

  test("LIST-02: Step 1 — missing title, Next shows error", async ({
    page,
  }) => {
    await page.goto("/listings/create");
    await expect(page.getByRole("main").getByRole("heading", { name: /create listing/i })).toBeVisible();

    const categorySelect = page.getByRole("main").locator("select").first();
    await categorySelect.selectOption("Ferrous Metals");

    const nextBtn = page.getByRole("button", { name: /next/i });
    await nextBtn.click();

    const errorBanner = page.locator("text=required fields");
    await expect(errorBanner).toBeVisible({ timeout: 5_000 });
  });

  test("LIST-03: Save Draft creates listing_id shown in UI", async ({
    page,
  }) => {
    await page.goto("/listings/create");
    await expect(page.getByRole("main").getByRole("heading", { name: /create listing/i })).toBeVisible();

    await page.getByRole("main").getByPlaceholder(/HMS|scrap|MT/i).first().fill("Draft Listing Test");
    await page.getByRole("main").locator("select").first().selectOption("Plastics");

    const saveDraftBtn = page.getByRole("button", { name: /save as draft/i });
    await saveDraftBtn.click();

    const draftId = page.locator("text=/Draft saved.*ID:/");
    await expect(draftId).toBeVisible({ timeout: 10_000 });
  });

  test("LIST-04: Step 3 — select Fixed Price mode, price panel appears", async ({
    page,
  }) => {
    await page.goto("/listings/create");
    await page.waitForSelector("h1");

    await page.locator("input[placeholder*='HMS']").fill("Fixed Price Test");
    await page.locator("select").first().selectOption("Ferrous Metals");

    const nextBtn = page.getByRole("button", { name: /next/i });
    await nextBtn.click();
    await page.waitForTimeout(500);
    await nextBtn.click();
    await page.waitForTimeout(500);

    const fixedCard = page.getByRole("main").locator("button", { hasText: "Fixed Price" });
    await fixedCard.click();

    const pricePanel = page.getByRole("main").locator("text=Fixed price settings");
    await expect(pricePanel).toBeVisible({ timeout: 5_000 });

    const askingPriceInput = page.getByRole("main").locator("input[placeholder='0.00']").first();
    await expect(askingPriceInput).toBeVisible();
  });

  test("LIST-05: Step 6 — Publish button disabled without required fields", async ({
    page,
  }) => {
    await page.goto("/listings/create");
    await page.waitForSelector("h1");

    for (let i = 0; i < 5; i++) {
      const nextBtn = page.getByRole("button", { name: /next|review/i });
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
        await page.waitForTimeout(500);
      }
    }

    const stepText = page.getByRole("main").locator("text=/Step 6/");
    if (await stepText.isVisible().catch(() => false)) {
      const publishBtn = page.getByRole("main").getByRole("button", { name: /publish listing/i });
      await expect(publishBtn).toBeDisabled();
    } else {
      const errorMsg = page.getByRole("main").locator("text=/required fields/i");
      await expect(errorMsg).toBeVisible({ timeout: 5_000 });
    }
  });

  test("LIST-06: Commission calculation — $10,000 fixed shows $350.00 (3.5%)", async ({
    page,
  }) => {
    await page.goto("/listings/create");
    await expect(page.getByRole("main").getByRole("heading", { name: /create listing/i })).toBeVisible();

    await page.getByRole("main").getByPlaceholder(/HMS|scrap|MT/i).first().fill("Commission Test");
    await page.getByRole("main").locator("select").first().selectOption("Ferrous Metals");

    const nextBtn = page.getByRole("main").getByRole("button", { name: /next/i });
    await nextBtn.click();
    await page.waitForTimeout(500);
    await nextBtn.click();
    await page.waitForTimeout(500);

    await page.getByRole("main").locator("button", { hasText: "Fixed Price" }).click();

    const priceInput = page.getByRole("main").locator("input[placeholder='0.00']").first();
    await priceInput.fill("10000");

    const commissionText = page.getByRole("main").locator("text=$350.00");
    await expect(commissionText).toBeVisible({ timeout: 5_000 });
  });
});
