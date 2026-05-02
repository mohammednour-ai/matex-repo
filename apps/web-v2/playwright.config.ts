import { defineConfig } from "@playwright/test";

const skip = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";
const useProdServer =
  process.env.PLAYWRIGHT_WEBSERVER === "start" || process.env.CI === "true";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  workers: process.env.CI ? 2 : 1,
  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
    ["list"],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: skip
    ? undefined
    : {
        command: useProdServer
          ? "node node_modules/next/dist/bin/next start -p 3002"
          : "node node_modules/next/dist/bin/next dev -p 3002",
        url: "http://localhost:3002",
        reuseExistingServer: true,
        timeout: useProdServer ? 60_000 : 180_000,
      },
  projects: [
    {
      name: "smoke",
      testDir: "./e2e/smoke",
      timeout: 45_000,
    },
    {
      name: "api",
      testDir: "./e2e/api",
      timeout: 60_000,
    },
    {
      name: "functional",
      testDir: "./e2e/functional",
      timeout: 60_000,
    },
    {
      name: "regression",
      testDir: "./e2e/regression",
      timeout: 90_000,
    },
    {
      name: "uiux",
      testDir: "./e2e/uiux",
      timeout: 60_000,
    },
    {
      name: "compliance",
      testDir: "./e2e/compliance",
      timeout: 60_000,
    },
    {
      name: "legacy",
      testDir: "./e2e",
      testMatch: /happy-path\.spec\.ts$/,
      timeout: 90_000,
    },
    {
      name: "visual",
      testDir: "./e2e/visual",
      timeout: 90_000,
      fullyParallel: false,
      expect: {
        toHaveScreenshot: {
          maxDiffPixels: 1200,
          animations: "disabled",
        },
      },
      use: {
        reducedMotion: "reduce",
      },
    },
  ],
});
