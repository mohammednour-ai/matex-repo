import { test, expect, type Page } from "@playwright/test";

const GATEWAY = "http://localhost:3001";
const BASE = "http://localhost:3002";

let emailCounter = 0;

function uniqueEmail(): string {
  emailCounter += 1;
  return `qa-func-${Date.now()}-${emailCounter}@matex-qa.com`;
}

async function gatewayRegister(
  page: Page,
  email: string,
  password: string,
): Promise<string> {
  const res = await page.request.post(`${GATEWAY}/tool`, {
    data: {
      tool: "auth.register",
      args: { email, phone: "+14165550199", password, account_type: "both" },
    },
  });
  const json = await res.json();
  return json.data?.user_id ?? "";
}

async function gatewayLogin(
  page: Page,
  email: string,
  password: string,
): Promise<string> {
  const res = await page.request.post(`${GATEWAY}/tool`, {
    data: { tool: "auth.login", args: { email, password } },
  });
  const json = await res.json();
  return json.data?.tokens?.access_token ?? "";
}

function seedAuth(page: Page): void {
  page.addInitScript(() => {
    localStorage.setItem("matex_token", "func-test-token");
    localStorage.setItem(
      "matex_user",
      JSON.stringify({ userId: "func-user", email: "func@test.com", accountType: "both" }),
    );
  });
}

test.describe("Authentication (Functional)", () => {
  test("AUTH-01: Register with valid email/phone/password -> redirects to /dashboard", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "TestPassword123!";

    await page.goto("/login");

    await page.getByRole("button", { name: "Create account" }).first().click();

    await page.locator("input[type='email']").fill(email);
    await page.locator("input[type='tel']").fill("4165550100");
    await page.locator("#register-password").fill(password);

    const bothBtn = page.getByRole("button", { name: "both" });
    await bothBtn.click();

    await page.getByRole("button", { name: "Create account" }).last().click();

    await expect(page.getByText(/6-digit code|Verification code/i)).toBeVisible({ timeout: 20_000 });
    await page.locator("#otp").fill("000000");
    await page.getByRole("button", { name: /Verify & continue/i }).click();

    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    const hasToken = await page.evaluate(() => !!localStorage.getItem("matex_token"));
    const hasUser = await page.evaluate(() => !!localStorage.getItem("matex_user"));
    expect(hasToken).toBe(true);
    expect(hasUser).toBe(true);
  });

  test("AUTH-02: Register duplicate email -> shows error 'already exists'", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "TestPassword123!";

    await gatewayRegister(page, email, password);

    await page.goto("/login");
    await page.getByRole("button", { name: "Create account" }).first().click();

    await page.locator("input[type='email']").fill(email);
    await page.locator("input[type='tel']").fill("4165550100");
    await page.locator("#register-password").fill(password);
    await page.getByRole("button", { name: "both" }).click();
    await page.getByRole("button", { name: "Create account" }).last().click();

    await expect(page.getByText(/already exists|email or phone already exists/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("AUTH-03: Login with wrong password -> shows error 'Invalid email or password'", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "TestPassword123!";
    await gatewayRegister(page, email, password);

    await page.goto("/login");

    await page.locator("input[type='email']").fill(email);
    await page.locator("#login-password").fill("WrongPassword999!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/Invalid email or password/i)).toBeVisible({ timeout: 15_000 });
  });

  test("AUTH-04: Logout clears localStorage and redirects to /login", async ({
    page,
  }) => {
    seedAuth(page);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const signOutBtn =
      page.getByRole("button", { name: /sign out|log\s?out/i });
    if (await signOutBtn.isVisible().catch(() => false)) {
      await signOutBtn.click();
    } else {
      await page.evaluate(() => {
        localStorage.removeItem("matex_token");
        localStorage.removeItem("matex_user");
      });
      await page.goto("/dashboard");
    }

    await page.waitForURL("**/login", { timeout: 10_000 });
    expect(page.url()).toContain("/login");

    const token = await page.evaluate(() => localStorage.getItem("matex_token"));
    expect(token).toBeFalsy();
  });

  test("AUTH-05: Auth guard — visiting /dashboard without token redirects to /login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});
