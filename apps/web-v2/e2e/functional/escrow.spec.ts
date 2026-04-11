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

test.describe("Escrow — Functional", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
  });

  test("ESC-01: Escrow page renders with tabs (Active/Pending Release/Released/Frozen)", async ({ page }) => {
    await page.goto("/escrow");

    await expect(page.getByRole("main").getByRole("heading", { name: "Escrow Management" })).toBeVisible();

    const tabs = ["Active", "Pending Release", "Released", "Frozen"];
    for (const label of tabs) {
      await expect(page.getByRole("main").getByRole("button", { name: label })).toBeVisible();
    }
  });

  test("ESC-02: Escrow items display with status badges", async ({ page }) => {
    await page.goto("/escrow");

    await expect(page.locator("text=HMS #1 Scrap Steel")).toBeVisible();
    await expect(page.locator("text=Copper Birch")).toBeVisible();

    const badges = page.locator("span", { hasText: /Funds Held|Released|Frozen/i });
    expect(await badges.count()).toBeGreaterThanOrEqual(1);
  });

  test("ESC-03: Freeze button triggers prompt (UI element exists)", async ({ page }) => {
    await page.goto("/escrow");

    const firstRow = page.locator("div.cursor-pointer").first();
    await firstRow.click();

    const freezeBtn = page.locator("button", { hasText: "Freeze" }).first();
    await expect(freezeBtn).toBeVisible();

    let promptCalled = false;
    page.on("dialog", async (dialog) => {
      promptCalled = true;
      expect(dialog.type()).toBe("prompt");
      await dialog.dismiss();
    });

    await freezeBtn.click();
    await page.waitForTimeout(500);
    expect(promptCalled).toBe(true);
  });
});
