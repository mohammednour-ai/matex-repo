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

test.describe("Settings Page", () => {
  test("SET-01: Settings page renders with tabs (Profile/Company/KYC/Notifications)", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/settings");

    await expect(page.getByRole("main").getByRole("heading", { name: /Settings/i })).toBeVisible();

    await expect(page.locator("button", { hasText: "Profile" })).toBeVisible();
    await expect(page.locator("button", { hasText: "Company" })).toBeVisible();
    await expect(page.locator("button", { hasText: /KYC/i })).toBeVisible();
    await expect(page.locator("button", { hasText: "Notifications" })).toBeVisible();
  });

  test("SET-02: Profile tab has display name and province fields", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/settings");

    await page.locator("button", { hasText: "Profile" }).click();

    await expect(page.locator("text=/Display Name/i")).toBeVisible();
    const displayNameInput = page.locator("input[placeholder*='name']");
    await expect(displayNameInput).toBeVisible();

    await expect(page.locator("text=/Province/i").first()).toBeVisible();
    const provinceSelect = page.locator("select").filter({ has: page.locator("option[value='ON']") });
    await expect(provinceSelect.first()).toBeVisible();
  });

  test("SET-03: Company tab has CRA Business Number field with validation", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/settings");

    await page.locator("button", { hasText: "Company" }).click();

    await expect(page.locator("text=/CRA Business Number/i")).toBeVisible();
    const bnInput = page.locator("input[placeholder*='123456789']");
    await expect(bnInput).toBeVisible();

    await bnInput.fill("INVALID");
    await bnInput.press("Tab");
    await expect(page.locator("text=/9-digit CRA BN/i")).toBeVisible();

    await bnInput.fill("123456789RT0001");
    await bnInput.press("Tab");
    await expect(page.locator("text=/9-digit CRA BN/i")).not.toBeVisible();
  });

  test("SET-04: Notifications tab has toggle switches", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/settings");

    await page.locator("button", { hasText: "Notifications" }).click();

    await expect(page.locator("text=/Email Notifications/i")).toBeVisible();
    await expect(page.locator("text=/SMS Notifications/i")).toBeVisible();
    await expect(page.locator("text=/Push Notifications/i")).toBeVisible();

    const toggles = page.locator("button[role='switch']");
    const toggleCount = await toggles.count();
    expect(toggleCount).toBeGreaterThanOrEqual(3);

    const firstToggle = toggles.first();
    const initialState = await firstToggle.getAttribute("aria-checked");
    await firstToggle.click();
    const newState = await firstToggle.getAttribute("aria-checked");
    expect(newState).not.toBe(initialState);
  });
});
