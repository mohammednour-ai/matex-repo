import { test, expect } from "@playwright/test";

test("all pages render correctly", async ({ page }) => {
  await page.goto("/auth");
  await expect(page.locator("h1").first()).toContainText(/Account/i);

  await page.goto("/listings");
  await expect(page.locator("h1").first()).toContainText(/Listings/i);

  await page.goto("/search");
  await expect(page.locator("h1").first()).toContainText(/Search/i);

  await page.goto("/messaging");
  await expect(page.locator("h1").first()).toContainText(/Messages/i);

  await page.goto("/checkout");
  await expect(page.locator("h1").first()).toContainText(/Checkout/i);

  await page.goto("/dashboard");
  await expect(page.locator("h1").first()).toContainText(/Dashboard/i);

  await page.goto("/auction");
  await expect(page.locator("h1").first()).toContainText(/Auction/i);

  await page.goto("/escrow");
  await expect(page.locator("h1").first()).toContainText(/Escrow/i);

  await page.goto("/logistics");
  await expect(page.locator("h1").first()).toContainText(/Logistics/i);

  await page.goto("/booking");
  await expect(page.locator("h1").first()).toContainText(/Booking/i);

  await page.goto("/contracts");
  await expect(page.locator("h1").first()).toContainText(/Supply|Contracts/i);

  await page.goto("/copilot");
  await expect(page.locator("h1").first()).toContainText(/Copilot/i);
});
