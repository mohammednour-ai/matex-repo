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

test.describe("Copilot / Chat Page", () => {
  test("COP-01: Chat page renders with input and suggestion chips", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/chat");

    await expect(page.getByRole("main").getByRole("heading", { name: /Matex AI/i })).toBeVisible();

    const chatInput = page.getByRole("main").locator("textarea[placeholder*='Ask Matex']");
    await expect(chatInput).toBeVisible();

    const sendBtn = page.getByRole("main").getByRole("button", { name: "Send message" });
    await expect(sendBtn).toBeVisible();

    const chips = page
      .getByRole("main")
      .locator("button")
      .filter({ hasText: /Search copper|Check my wallet|Dashboard stats/i });
    const chipCount = await chips.count();
    expect(chipCount).toBeGreaterThan(0);
  });

  test("COP-02: Send message shows in conversation", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/chat");

    const chatInput = page.getByRole("main").locator("textarea[placeholder*='Ask Matex']");
    await chatInput.fill("check wallet");
    await page.getByRole("main").getByRole("button", { name: "Send message" }).click();

    const userBubble = page.locator("text=/check wallet/i").first();
    await expect(userBubble).toBeVisible();

    await page.waitForTimeout(3000);

    const assistantBubbles = page.locator(".bg-gray-100.rounded-2xl");
    const count = await assistantBubbles.count();
    expect(count).toBeGreaterThan(0);
  });

  test("COP-03: Unknown intent returns helpful fallback", async ({ page }) => {
    await seedAuth(page);
    await page.goto("/chat");

    const chatInput = page.getByRole("main").locator("textarea[placeholder*='Ask Matex']");
    await chatInput.fill("xyzzy nonsense query 12345");
    await page.getByRole("main").getByRole("button", { name: "Send message" }).click();

    await page.waitForTimeout(3000);

    const fallback = page.locator("text=/didn't understand|things you can ask|help/i");
    await expect(fallback.first()).toBeVisible();
  });
});
