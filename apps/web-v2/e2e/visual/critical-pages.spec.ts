/**
 * Visual regression baselines (Playwright toHaveScreenshot).
 *
 * First-time setup: run `pnpm test:visual:update` on Linux CI (or WSL) once,
 * then commit the generated PNGs under e2e/visual/**/__snapshots__/.
 * Updating on Windows may cause font diffs vs CI.
 *
 * Prerequisites for authenticated shots: MCP gateway on :3001 (and adapters
 * + DB if using real auth.register). Public /login needs only web on :3002.
 */
import { test, expect } from "@playwright/test";
import { authenticatedTest } from "../fixtures/auth";

test.describe("visual: public", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("login desktop", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Welcome Back|Get started/ })).toBeVisible();
    await expect(page).toHaveScreenshot("login-desktop.png", { fullPage: true });
  });
});

authenticatedTest.describe("visual: authenticated", () => {
  authenticatedTest.beforeAll(async ({ request }) => {
    const res = await request.get("http://localhost:3001/health").catch(() => null);
    test.skip(!res?.ok(), "MCP gateway on http://localhost:3001 required (pnpm dev:gateway + adapters for DB auth)");
  });

  authenticatedTest.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  authenticatedTest("dashboard main desktop", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("Active Listings")).toBeVisible({ timeout: 45_000 });
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
    await expect(main).toHaveScreenshot("dashboard-main-desktop.png");
  });

  authenticatedTest("search desktop", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByRole("heading", { name: "Browse Materials" })).toBeVisible({ timeout: 45_000 });
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
    await expect(main).toHaveScreenshot("search-main-desktop.png");
  });

  authenticatedTest("listings index desktop", async ({ page }) => {
    await page.goto("/listings");
    await expect(page.getByRole("heading", { name: "My Listings" })).toBeVisible({ timeout: 45_000 });
    const main = page.locator("main").first();
    await expect(main).toBeVisible();
    await expect(main).toHaveScreenshot("listings-main-desktop.png");
  });
});
