import { test, expect } from "@playwright/test";

test("phase1 ui happy-path pages render", async ({ page }) => {
  await page.goto("/auth");
  await expect(page.locator("h1").first()).toContainText(/Auth/i);

  await page.goto("/listings");
  await expect(page.locator("h1").first()).toContainText(/Listings/i);

  await page.goto("/search");
  await expect(page.locator("h1").first()).toContainText(/Search/i);

  await page.goto("/messaging");
  await expect(page.locator("h1").first()).toContainText(/Messages|Messaging/i);

  await page.goto("/checkout");
  await expect(page.locator("h1").first()).toContainText(/Checkout/i);

  await page.goto("/dashboard");
  await expect(page.locator("h1").first()).toContainText(/Dashboard/i);

  await page.goto("/phase2");
  await expect(page.locator("h1").first()).toContainText(/KYC|Phase 2|trust/i);

  await page.goto("/phase3");
  await expect(page.locator("h1").first()).toContainText(/Logistics|Phase 3|operations/i);

  await page.goto("/phase4");
  await expect(page.locator("h1").first()).toContainText(/Analytics|Phase 4|intelligence/i);

  await page.goto("/copilot");
  await expect(page.locator("h1").first()).toContainText(/Copilot/i);
});
