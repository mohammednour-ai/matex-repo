import { test, expect } from "@playwright/test";

function seedAuth(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    localStorage.setItem("matex_token", "test-token");
    localStorage.setItem(
      "matex_user",
      JSON.stringify({ userId: "func-test", email: "func@test.com", accountType: "both" }),
    );
  });
}

test.describe("Auction Pages", () => {
  test("AUC-01: Auction listing page renders with auction cards", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/auction");

    await expect(page.getByRole("main").getByRole("heading", { name: /Auctions/i })).toBeVisible();

    const tabs = page.getByRole("main").locator("text=/Live Now|Upcoming|Completed/i");
    await expect(tabs.first()).toBeVisible();

    await page.waitForTimeout(2000);
    const cards = page.getByRole("main").locator(".grid > div").filter({ has: page.locator("h3") });
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);
  });

  test("AUC-02: Search/filter input present on auction page", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/auction");

    const searchInput = page.getByRole("main").getByPlaceholder(/Search auctions/i);
    await expect(searchInput).toBeVisible();

    await searchInput.fill("copper");
    await expect(searchInput).toHaveValue("copper");
  });

  test("AUC-03: Auction detail page has bid input and quick bid buttons", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/auction/auc-001");

    await expect(page.locator("text=/Current Bid/i")).toBeVisible();

    const bidInput = page.locator("input[type='number']");
    await expect(bidInput).toBeVisible();

    const placeBidBtn = page.getByRole("button", { name: /Place Bid/i });
    await expect(placeBidBtn).toBeVisible();

    const quickBidButtons = page.locator("button").filter({ hasText: /^\+\$/ });
    const quickCount = await quickBidButtons.count();
    expect(quickCount).toBe(3);
  });
});
