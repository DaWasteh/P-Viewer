import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: process.platform === "win32" ? "msedge" : undefined } },
    ...(process.platform === "linux" ? [{ name: "webkit", use: { browserName: "webkit" as const } }] : []),
  ],
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: { command: "npm run build && npm run preview -- --host 127.0.0.1 --port 1420 --strictPort", url: "http://127.0.0.1:1420", reuseExistingServer: false, timeout: 120_000 },
});
