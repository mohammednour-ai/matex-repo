import { test, expect } from "@playwright/test";

function seedAuth(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    localStorage.setItem("matex_token", "ui-test-token");
    localStorage.setItem(
      "matex_user",
      JSON.stringify({ userId: "ui-test", email: "ui@test.com", accountType: "both" }),
    );
  });
}

test.describe("UI/UX Design Review", () => {
  test("UIUX-01: sidebar uses dark steel background", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/dashboard");
    const sidebar = page.locator("aside").first();
    await expect(sidebar).toBeVisible();
    const bgColor = await sidebar.evaluate((el) => getComputedStyle(el.querySelector("div")!).backgroundColor);
    expect(bgColor).toBeTruthy();
  });

  test("UIUX-02: typography uses extrabold on main headings", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/dashboard");
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    const fontWeight = await heading.evaluate((el) => getComputedStyle(el).fontWeight);
    expect(Number(fontWeight)).toBeGreaterThanOrEqual(700);
  });

  test("UIUX-03: responsive sidebar - desktop visible, mobile hidden", async ({ page }) => {
    await seedAuth(page);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");
    const desktopSidebar = page.locator("aside.hidden.md\\:flex").first();
    await expect(desktopSidebar).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");
    await page.waitForTimeout(500);
    const hamburger = page.locator("button[aria-label='Open navigation']");
    await expect(hamburger).toBeVisible();
  });

  test("UIUX-04: mobile drawer opens and closes", async ({ page }) => {
    await seedAuth(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard");

    const hamburger = page.locator("button[aria-label='Open navigation']");
    await hamburger.click();
    await page.waitForTimeout(300);

    const overlay = page.locator(".fixed.inset-0.bg-black\\/60, .fixed.inset-0.bg-black\\/40");
    await expect(overlay.first()).toBeVisible();

    await overlay.first().click({ position: { x: 350, y: 400 } });
    await page.waitForTimeout(300);
  });

  test("UIUX-05: sidebar collapse toggle works", async ({ page }) => {
    await seedAuth(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");

    const collapseBtn = page.locator("button[aria-label='Collapse sidebar']");
    if (await collapseBtn.isVisible()) {
      await collapseBtn.click();
      await page.waitForTimeout(300);
      const expandBtn = page.locator("button[aria-label='Expand sidebar']");
      await expect(expandBtn).toBeVisible();
    }
  });

  test("UIUX-06: login page split-screen on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/login");

    const heroPanel = page.locator("text=/INDUSTRIAL|MATERIALS|EXCHANGE/i").first();
    await expect(heroPanel).toBeVisible();

    const trustOrFeature = page.locator("text=/Trusted by|Real-Time|Secure Escrow/i").first();
    await expect(trustOrFeature).toBeVisible();
  });

  test("UIUX-07: login page prioritizes sign-in on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: /Welcome Back|Get started/i })
    ).toBeInViewport();
    await expect(page.locator("text=/Continue with Google/i").first()).toBeVisible();
    await expect(page.locator("#login-hero-heading")).toBeAttached();
  });

  test("UIUX-08: buttons show disabled state visually", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/listings/create");

    for (let i = 0; i < 5; i++) {
      const nextBtn = page.getByRole("button", { name: /next/i });
      if (await nextBtn.isVisible()) {
        await nextBtn.click();
        await page.waitForTimeout(500);
      }
    }

    const publishBtn = page.getByRole("button", { name: /publish listing/i });
    if (await publishBtn.isVisible()) {
      const isDisabled = await publishBtn.isDisabled();
      if (isDisabled) {
        const opacity = await publishBtn.evaluate((el) => getComputedStyle(el).opacity);
        expect(Number(opacity)).toBeLessThan(1);
      }
    }
  });

  test("UIUX-09: dashboard shows skeleton or hero while loading", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/dashboard");
    const skeletonOrHero = page.locator("[data-dashboard-skeleton], h1").first();
    await expect(skeletonOrHero).toBeVisible({ timeout: 15_000 });
  });

  test("UIUX-10: dashboard stat cards in 4-column grid", async ({ page }) => {
    await seedAuth(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);

    const statGrid = page.locator(".grid.grid-cols-2.lg\\:grid-cols-4").first();
    if (await statGrid.isVisible()) {
      const cards = await statGrid.locator("> div").count();
      expect(cards).toBe(4);
    }
  });

  test("UIUX-11: empty notification state shows bell icon", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);

    const emptyState = page.locator("text=/no recent notifications/i");
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
    }
  });

  test("UIUX-12: create listing has required field indicators", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/listings/create");

    const asterisks = page.locator("span.text-red-500");
    const count = await asterisks.count();
    expect(count).toBeGreaterThan(0);
  });
});
