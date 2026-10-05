#!/usr/bin/env node
// Stands in for `mainsequence auth token --json` for the browser suite's development server
// (MAINSEQUENCE_CLI in playwright.config.ts). The token is synthetic; only the fixture API sees it.
import process from "node:process";

if (process.argv.slice(2).join(" ") !== "auth token --json") {
  process.stderr.write("The e2e Main Sequence CLI only answers `auth token --json`.\n");
  process.exit(2);
}

process.stdout.write(`${JSON.stringify({
  endpoint: "http://127.0.0.1:4274",
  access_token: "synthetic-local-session-token",
  token_type: "Bearer",
  expires_at: Math.floor(Date.now() / 1000) + 300,
})}\n`);
