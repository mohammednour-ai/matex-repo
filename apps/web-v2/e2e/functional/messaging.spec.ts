import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3002";

function seedAuth(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    localStorage.setItem("matex_token", "test-token");
    localStorage.setItem(
      "matex_user",
      JSON.stringify({ userId: "func-test", email: "func@test.com", accountType: "both" }),
    );
  });
}

test.describe("Messaging — Functional", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
  });

  test("MSG-01: Messages page loads with inbox/thread layout", async ({ page }) => {
    await page.goto(`${BASE}/messages`);

    const sidebar = page.locator("aside").first();
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator("h2")).toContainText("Messages");

    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("MSG-02: New thread button/modal is accessible", async ({ page }) => {
    await page.goto(`${BASE}/messages`);

    const newBtn = page.locator("button", { hasText: "New" });
    await expect(newBtn).toBeVisible();

    await newBtn.click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.locator("text=New Message Thread")).toBeVisible();
    await expect(modal.locator("input[type='text']")).toBeVisible();
    await expect(modal.locator("textarea")).toBeVisible();
  });

  test("MSG-03: Send message input and button present in thread view", async ({ page }) => {
    await page.goto(`${BASE}/messages`);

    await page.waitForTimeout(1500);

    const threadBtn = page.locator("aside button").first();
    const hasThreads = (await threadBtn.count()) > 0;

    if (hasThreads) {
      await threadBtn.click();
    }

    const msgInput = page.locator(
      "textarea[placeholder*='Type a message']",
    );
    const sendBtn = page.locator("main button").filter({ has: page.locator("svg") }).last();

    if (hasThreads) {
      await expect(msgInput).toBeVisible();
      await expect(sendBtn).toBeVisible();
    } else {
      await expect(
        page.locator("text=Select a conversation"),
      ).toBeVisible();
    }
  });
});
