import { test, expect } from "@playwright/test";

test("all pages load", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("h1,h2").first()).toContainText(/login|sign|welcome/i);

  // Seed a test session so auth guard passes
  await page.evaluate(() => {
    localStorage.setItem("matex_token", "test-token");
    localStorage.setItem(
      "matex_user",
      JSON.stringify({ userId: "test", email: "test@test.com", accountType: "both" }),
    );
  });

  const routes: [string, RegExp][] = [
    ["/dashboard", /dashboard/i],
    ["/listings", /listings/i],
    ["/search", /search|browse/i],
    ["/auction", /auction/i],
    ["/escrow", /escrow/i],
    ["/logistics", /logistics/i],
    ["/checkout", /checkout/i],
    ["/contracts", /contracts/i],
    ["/messages", /messages|inbox/i],
    ["/inspection", /inspection/i],
    ["/chat", /copilot|ai|chat/i],
    ["/notifications", /notifications/i],
    ["/settings", /settings/i],
  ];

  for (const [path, title] of routes) {
    await page.goto(path);
    await expect(page.locator("h1,h2").first()).toContainText(title);
  }
});
