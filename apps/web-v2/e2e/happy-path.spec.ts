import { test, expect } from "@playwright/test";

test("all pages load", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("input[type='email']")).toBeVisible();
  await expect(
    page.getByText(/Matex|Sign in|Welcome back|recycled materials|Create account/i).first(),
  ).toBeVisible();

  // Seed a test session so auth guard passes
  await page.evaluate(() => {
    localStorage.setItem("matex_token", "test-token");
    localStorage.setItem(
      "matex_user",
      JSON.stringify({ userId: "test", email: "test@test.com", accountType: "both" }),
    );
  });

  // Match copy inside <main> — first h1 may be the user's email prefix, not the page title.
  const routes: [string, RegExp][] = [
    ["/dashboard", /Active Listings|Quick Actions|Your (marketplace|buying|seller) hub|workspace|overview|KYC Level/i],
    ["/listings", /listings|My listings|Browse|Create/i],
    ["/search", /Browse Materials|Filters|Save This Search|material/i],
    ["/auctions", /auction|lot|bid|live/i],
    ["/escrow", /escrow|funds|release|hold/i],
    ["/logistics", /logistics|ship|freight|quote|carrier/i],
    ["/checkout", /Order Review|Order Details|Payment|Confirmation|checkout/i],
    ["/contracts", /contract|supply|standing|volume/i],
    ["/messages", /messages|inbox|thread|conversation/i],
    ["/inspections", /inspection|weight|grade|report/i],
    ["/chat", /copilot|ai|chat|assistant|matex ai/i],
    ["/notifications", /notif|alert|bell|inbox/i],
    ["/settings", /settings|account|profile|security|preferences/i],
  ];

  // App shell uses a single top-level <main class="pt-16 ...">; some pages (e.g. messages) also render nested <main>.
  const appMain = page.locator("main.pt-16.min-h-screen").first();

  for (const [path, title] of routes) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(appMain).toBeVisible();
    await expect(appMain).toContainText(title);
  }
});
