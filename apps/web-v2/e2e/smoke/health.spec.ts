import { test, expect } from "@playwright/test";

const GATEWAY = "http://localhost:3001";

test.describe("Smoke Suite", () => {
  test("SMOKE-01: gateway health endpoint returns 200", async ({ request }) => {
    const res = await request.get(`${GATEWAY}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("mcp-gateway");
    expect(body.routes).toBe(24);
  });

  test("SMOKE-02: login page renders", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("#login-email, input[type='email']").first()).toBeVisible();
    await expect(
      page.getByText(/Matex|Sign in|Welcome back|INDUSTRIAL|materials exchange|Create account/i).first(),
    ).toBeVisible();
  });

  test("SMOKE-03: /api/mcp accepts POST and returns JSON", async ({ request }) => {
    const res = await request.post("/api/mcp", {
      data: { tool: "analytics.get_dashboard_stats", args: {} },
    });
    const body = await res.json();
    expect(body).toHaveProperty("success");
  });

  test("SMOKE-04: dashboard loads after auth seeding", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("matex_token", "smoke-test-token");
      localStorage.setItem(
        "matex_user",
        JSON.stringify({ userId: "smoke", email: "smoke@test.com", accountType: "both" }),
      );
    });
    await page.goto("/dashboard");
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(2000);
    await expect(page.getByRole("main").getByRole("heading").first()).toBeVisible();
  });

  test("SMOKE-05: all sidebar routes render without 500", async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => {
      localStorage.setItem("matex_token", "smoke-test-token");
      localStorage.setItem(
        "matex_user",
        JSON.stringify({ userId: "smoke", email: "smoke@test.com", accountType: "both" }),
      );
    });

    const routes = [
      "/dashboard", "/listings", "/search", "/auction", "/messages",
      "/checkout", "/escrow", "/logistics", "/inspection", "/contracts",
      "/settings", "/notifications",
    ];

    for (const route of routes) {
      const res = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${route} should not 500`).not.toBe(500);
    }
  });

  test("SMOKE-06: copilot chat endpoint responds", async ({ request }) => {
    const res = await request.post("/chat/api", {
      data: { message: "hello", token: "smoke-token" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("content");
  });
});
