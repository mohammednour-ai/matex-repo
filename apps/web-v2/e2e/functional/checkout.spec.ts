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

test.describe("Checkout Flow", () => {
  test("CHKOUT-01: Checkout page renders with order summary", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/checkout");

    await expect(page.locator("text=/Order Details/i")).toBeVisible();
    await expect(page.locator("text=/HMS #1 Scrap Steel/i")).toBeVisible();
    await expect(page.locator("text=/Price Breakdown/i")).toBeVisible();
    await expect(page.locator("text=/Total/i").first()).toBeVisible();

    const continueBtn = page.getByRole("button", { name: /continue to payment/i });
    await expect(continueBtn).toBeVisible();
  });

  test("CHKOUT-02: Payment method selection (card/wallet/credit options)", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/checkout");

    const continueBtn = page.getByRole("button", { name: /continue to payment/i });
    await continueBtn.click();

    await expect(page.locator("text=/Select Payment Method/i")).toBeVisible();

    const cardRadio = page.locator("input[type='radio'][value='card']");
    const walletRadio = page.locator("input[type='radio'][value='wallet']");
    const creditRadio = page.locator("input[type='radio'][value='credit']");

    await expect(cardRadio).toBeAttached();
    await expect(walletRadio).toBeAttached();
    await expect(creditRadio).toBeAttached();

    await expect(page.locator("text=/Credit \\/ Debit Card/i")).toBeVisible();
    await expect(page.locator("text=/Matex Wallet/i")).toBeVisible();
    await expect(page.locator("text=/Credit Facility/i")).toBeVisible();
  });

  test("CHKOUT-03: Tax calculation section present", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/checkout");

    await expect(page.locator("text=/Material price/i")).toBeVisible();
    await expect(page.locator("text=/Platform commission/i")).toBeVisible();
    await expect(page.locator("text=/HST|GST|PST/i").first()).toBeVisible();
    await expect(page.locator("text=/Est\\. shipping/i")).toBeVisible();
  });
});
