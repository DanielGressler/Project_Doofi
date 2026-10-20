import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const executable =
  process.env.CHROMIUM_PATH ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4321",
    browserName: "chromium",
    headless: true,
    launchOptions: { executablePath: executable, args: ["--no-sandbox"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run preview -- --port 4321",
    url: "http://localhost:4321/api/v1/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
