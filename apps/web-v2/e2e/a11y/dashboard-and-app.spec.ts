import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * axe-core sweep across the redesigned (app) routes. Runs against a seeded
 * localStorage session so the auth-guard loader doesn't gate the actual
 * shell. Each route is its own test so failures are isolated and reported
 * per page.
 *
 * Run:
 *   pnpm --filter @matex/web-v2 exec playwright test --project=a11y
 *
 * Requirements:
 *   - web-v2 dev server up on :3002 (playwright.config will start one if
 *     PLAYWRIGHT_SKIP_WEBSERVER is not set).
 *   - Stub localStorage token is fine; pages render their shell + loading
 *     skeletons even without a live MCP gateway — axe still scans the DOM.
 *
 * Scope of the sweep:
 *   - WCAG 2.0/2.1 levels A and AA.
 *   - "best-practice" tag included to catch landmark and heading-order
 *     issues that aren't strict WCAG fails but the redesign should hold to.
 *   - Skips: `color-contrast` is excluded because it depends on the live
 *     theme (light vs dark) and is checked manually per docs/redesign/05.
 */

const ROUTES_TO_SCAN: Array<{ path: string; label: string }> = [
  { path: "/login", label: "Login (unauth)" },
  { path: "/dashboard", label: "Dashboard" },
  { path: "/listings", label: "Listings" },
  { path: "/search", label: "Search" },
  { path: "/auctions", label: "Auctions" },
  { path: "/messages", label: "Messages" },
  { path: "/escrow", label: "Escrow" },
  { path: "/inspections", label: "Inspections" },
  { path: "/contracts", label: "Contracts" },
  { path: "/logistics", label: "Logistics" },
  { path: "/notifications", label: "Notifications" },
  { path: "/settings", label: "Settings" },
  { path: "/escrow/create", label: "Escrow Create (demo mode)" },
];

async function seedStubSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("matex_token", "a11y-stub-token");
    localStorage.setItem(
      "matex_user",
      JSON.stringify({
        userId: "a11y-stub-user",
        email: "a11y@matex-qa.test",
        accountType: "both",
        isPlatformAdmin: false,
      }),
    );
  });
}

for (const route of ROUTES_TO_SCAN) {
  test(`A11Y: ${route.label} has no detectable axe violations`, async ({ page }) => {
    if (route.path !== "/login") {
      await seedStubSession(page);
    }

    await page.goto(route.path, { waitUntil: "domcontentloaded" });
    // Allow the post-auth shell + initial data effects to settle. The auth-
    // guard loader takes ~1.5s in dev mode; data fetches that 404 against a
    // stub gateway resolve to error/empty states (still a11y-scannable).
    await page.waitForTimeout(2500);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
      .disableRules([
        "color-contrast", // theme-dependent; manual check per docs/redesign/05
      ])
      .analyze();

    if (results.violations.length > 0) {
      // Print a tight summary so CI logs are scannable.
      const summary = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        help: v.help,
        helpUrl: v.helpUrl,
      }));
      // eslint-disable-next-line no-console
      console.error(
        `\n[axe] ${route.label} — ${results.violations.length} violation(s):\n` +
          JSON.stringify(summary, null, 2),
      );
    }

    expect(results.violations, `axe violations on ${route.label}`).toEqual([]);
  });
}
