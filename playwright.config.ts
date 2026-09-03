import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4273",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run preview -- --host 127.0.0.1 --port 4273",
      url: "http://127.0.0.1:4273",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "node scripts/e2e-host-server.mjs",
      url: "http://127.0.0.1:4274/__health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
