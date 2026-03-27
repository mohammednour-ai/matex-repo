import { defineConfig } from "@playwright/test";

const skip = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3002",
    trace: "retain-on-failure",
  },
  webServer: skip
    ? undefined
    : {
        command: "node node_modules/next/dist/bin/next start -p 3002",
        url: "http://localhost:3002",
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
