import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests against the dev server with the imported SQLyst project
 * (npm run import:sqlyst). Run: npx playwright test
 */
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 240_000,
  use: { baseURL: "http://localhost:3000", viewport: { width: 1440, height: 900 } },
  webServer: { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true },
});
