import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { backendRoot, launchEnvironment, PORTS, SITE_ROOT } from "../scripts/dev-stack.mjs";

test("local launch forces local targets and restricted tools despite inherited settings", () => {
  const env = launchEnvironment({
    VITE_API_BASE_URL: "https://deployed.invalid",
    MAINSEQUENCE_TAU_LOCAL_ORIGIN: "https://deployed.invalid",
    TAU_LOCAL_MODE: "false", TAU_EXCLUDE_BASE_TOOLS: "false",
    TAU_EXCLUDE_MAINSEQUENCE_MCP: "false",
  }, "/prepared/backend");
  assert.equal(env.VITE_API_BASE_URL, `http://127.0.0.1:${PORTS.api}`);
  assert.equal(env.MAINSEQUENCE_TAU_LOCAL_ORIGIN, `http://127.0.0.1:${PORTS.agent}`);
  assert.equal(env.VITE_AGENT_MODE, "local");
  for (const key of ["TAU_LOCAL_MODE", "TAU_EXCLUDE_BASE_TOOLS", "TAU_EXCLUDE_MAINSEQUENCE_MCP"])
    assert.equal(env[key], "true");
  assert.equal(env.MAINSEQUENCE_CLI, "/prepared/backend/.venv/bin/mainsequence");
  assert.equal(env.TAU_LOCAL_PROVIDER, "openai-codex");
  assert.equal(env.TAU_LOCAL_MODEL, "gpt-5.6-luna");
  assert.equal(env.TAU_LOCAL_STATE_ROOT, resolve(SITE_ROOT, ".local/agent-state"));
});

test("hosted process settings are refused rather than silently reused", () => {
  for (const key of ["APP_NAME", "FASTAPI_PUBLIC_BASE_URL", "MAINSEQUENCE_CALLER_ASSERTION_ISSUER",
    "MAINSEQUENCE_CALLER_ASSERTION_JWKS_URL", "MAINSEQUENCE_A2A_MESSAGE_LIMIT_SECONDS"])
    assert.throws(() => launchEnvironment({ [key]: "hosted" }, "/prepared/backend"), /Unset hosted/);
  assert.throws(() => launchEnvironment({ MAINSEQUENCE_CALLER_AUTH_MODE: "assertion" }, "/backend"), /Unset hosted/);
});

test("backend and model overrides remain local operator choices", () => {
  assert.equal(backendRoot({ ALPACA_BACKEND_DIR: "/another/backend" }), "/another/backend");
  const env = launchEnvironment({ TAU_LOCAL_PROVIDER: "chosen", TAU_LOCAL_MODEL: "chosen-model" }, "/backend");
  assert.equal(env.TAU_LOCAL_PROVIDER, "chosen");
  assert.equal(env.TAU_LOCAL_MODEL, "chosen-model");
});

test("all launch surfaces use the same supervisor", () => {
  const read = (path) => JSON.parse(readFileSync(resolve(SITE_ROOT, path), "utf8"));
  assert.equal(read("package.json").scripts["dev:stack"], "node scripts/dev-stack.mjs");
  assert.equal(read(".vscode/launch.json").configurations[0].program, "${workspaceFolder}/scripts/dev-stack.mjs");
  assert.deepEqual(read(".claude/launch.json").configurations[0].runtimeArgs, ["scripts/dev-stack.mjs"]);
});
