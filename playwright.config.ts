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
    {
      // Vite development: its proxy adds the developer's session token to API requests. Here the
      // proxy targets the fixture API and the token comes from a synthetic CLI.
      command: "npm run dev -- --host 127.0.0.1 --port 4275 --strictPort",
      url: "http://127.0.0.1:4275",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_API_BASE_URL: "http://127.0.0.1:4274",
        MAINSEQUENCE_CLI: "scripts/e2e-mainsequence-cli.mjs",
      },
    },
  ],
});
