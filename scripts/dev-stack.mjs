/** Site-owned local launch. No runtime adapter, platform deployment or automatic migrations. */
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
export const SITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PORTS = Object.freeze({ site: 5421, api: 8321, agent: 8787 });
const DEFAULT_BACKEND = "../alpacaconnectors-945bfddd-5f1f-4541-a87a-faea3af6271f";
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const owned = [];
let stopping = false;

export function backendRoot(environment = process.env) {
  return resolve(SITE_ROOT, environment.ALPACA_BACKEND_DIR || DEFAULT_BACKEND);
}

export function launchEnvironment(environment, apiRoot) {
  for (const name of ["APP_NAME", "FASTAPI_PUBLIC_BASE_URL", "MAINSEQUENCE_CALLER_ASSERTION_ISSUER",
    "MAINSEQUENCE_CALLER_ASSERTION_JWKS_URL", "MAINSEQUENCE_A2A_MESSAGE_LIMIT_SECONDS"]) {
    if (environment[name]) throw new Error(`Unset hosted setting ${name} before a local launch.`);
  }
  if (environment.MAINSEQUENCE_CALLER_AUTH_MODE === "assertion") {
    throw new Error("Unset hosted caller authentication before a local launch.");
  }
  return {
    ...environment,
    MAINSEQUENCE_AUTH_MODE: "jwt",
    MAINSEQUENCE_CLI: resolve(apiRoot, ".venv/bin/mainsequence"),
    VITE_API_BASE_URL: `http://127.0.0.1:${PORTS.api}`,
    VITE_AGENT_MODE: "local",
    MAINSEQUENCE_TAU_LOCAL_ORIGIN: `http://127.0.0.1:${PORTS.agent}`,
    TAU_LOCAL_MODE: "true",
    TAU_LOCAL_PROVIDER: environment.TAU_LOCAL_PROVIDER || "openai-codex",
    TAU_LOCAL_MODEL: environment.TAU_LOCAL_MODEL || "gpt-5.6-luna",
    TAU_LOCAL_THINKING: environment.TAU_LOCAL_THINKING || "medium",
    TAU_EXCLUDE_BASE_TOOLS: "true",
    TAU_EXCLUDE_MAINSEQUENCE_MCP: "true",
    TAU_LOCAL_STATE_ROOT: resolve(SITE_ROOT, ".local/agent-state"),
    PYTHONPATH: apiRoot,
  };
}

async function node24(environment) {
  const candidates = environment.ALPACA_NODE_EXECUTABLE
    ? [environment.ALPACA_NODE_EXECUTABLE]
    : [process.execPath,
      resolve(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"),
      "/opt/homebrew/opt/node@24/bin/node"];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const { stdout } = await execute(candidate, ["--version"]);
    if (stdout.trim().startsWith("v24.")) return candidate;
  }
  throw new Error("Node 24 is required. Put it on PATH or set ALPACA_NODE_EXECUTABLE to its executable.");
}

async function requireFreePort(port) {
  await new Promise((done, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(`Port ${port} is occupied; stop its owner first. No processes were replaced.`)));
    probe.listen(port, "127.0.0.1", () => probe.close(done));
  });
}

async function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of owned) {
    if (!child.pid || child.exitCode !== null) continue;
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already stopped. */ }
  }
  await Promise.race([
    Promise.all(owned.map((child) => child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve() : new Promise((done) => child.once("exit", done)))),
    delay(8000),
  ]);
  for (const child of owned) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue;
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already stopped. */ }
  }
  process.exit(exitCode);
}

function start(name, program, args, cwd, env) {
  console.log(`[local-stack] Starting ${name}`);
  const child = spawn(program, args, { cwd, env, detached: true, stdio: "inherit" });
  owned.push(child);
  child.once("error", () => { console.error(`[local-stack] Could not start ${name}.`); void stop(1); });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(`[local-stack] ${name} exited (${signal || code}); stopping owned services.`);
      void stop(1);
    }
  });
}

async function waitFor(name, check, timeout = 60000) {
  const deadline = Date.now() + timeout;
  let reason = "not ready";
  while (!stopping && Date.now() < deadline) {
    try { return await check(); } catch (error) { reason = error.message; }
    await delay(400);
  }
  throw new Error(`${name}: ${reason}`);
}

const LOCAL_RUNTIME_CHECK = `
import json
from metatables import configure_local_client, get_runtime_status
url = configure_local_client()
state = get_runtime_status()
source, bootstrap = state.get("data_source") or {}, state.get("bootstrap") or {}
if not (state.get("local_mode") is True and state.get("dialect") == "sqlite"
        and source.get("class_type") == "sqlite" and source.get("uid")
        and bootstrap.get("active") is True and bootstrap.get("status") == "ready"):
    raise RuntimeError("Initialize the local SQLite runtime explicitly; the launch never migrates it.")
print(json.dumps({"url": url, "local_mode": True, "dialect": "sqlite", "data_source_uid": source["uid"]}))
`;

async function localRuntime(apiRoot, env) {
  const { stdout } = await execute(resolve(apiRoot, ".venv/bin/python"), ["-c", LOCAL_RUNTIME_CHECK],
    { cwd: apiRoot, env, timeout: 10000, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout.trim().split("\n").at(-1));
}

async function apiToken(apiRoot, env) {
  try {
    const { stdout } = await execute(env.MAINSEQUENCE_CLI, ["auth", "token", "--json"],
      { cwd: apiRoot, env, timeout: 30000, maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    if (typeof parsed.access_token === "string" && parsed.access_token) return parsed.access_token;
  } catch { /* Never return stdout or a credential-bearing subprocess error. */ }
  throw new Error("The saved Main Sequence login is unavailable; run mainsequence login in the API checkout.");
}

async function readJson(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${new URL(url).pathname} returned HTTP ${response.status}`);
  return response.json();
}

async function verify(apiRoot, env) {
  const runtime = await waitFor("Local MetaTables", () => localRuntime(apiRoot, env));
  const token = await apiToken(apiRoot, env);
  await waitFor("Alpaca API", () => readJson(`http://127.0.0.1:${PORTS.api}/health`,
    { Authorization: `Bearer ${token}` }));
  const agent = await waitFor("Local Agent", async () => {
    const health = await readJson(`http://127.0.0.1:${PORTS.agent}/health`);
    await readJson(`http://127.0.0.1:${PORTS.agent}/ready`);
    if (health.mode !== "local") throw new Error("The Agent did not report local mode.");
    return health;
  });
  await waitFor("Vite site", async () => {
    const response = await fetch(`http://127.0.0.1:${PORTS.site}/`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Site returned HTTP ${response.status}`);
    const identity = await readJson(`http://127.0.0.1:${PORTS.site}/__agent__/api/local/v1/agent`);
    if (identity.name !== "Alpaca Agent") throw new Error("The site proxy did not reach the local Alpaca Agent.");
  });
  console.log(`[local-stack] MetaTables: ${runtime.url}, SQLite (${runtime.data_source_uid})`);
  console.log(`[local-stack] API: http://127.0.0.1:${PORTS.api}; Agent: http://127.0.0.1:${PORTS.agent}, TAU ${agent.version}`);
  console.log("[local-stack] Local Alpaca tools are pending TAU issue #102; no adapter or deployed fallback is installed.");
  console.log(`[local-stack] Ready: http://127.0.0.1:${PORTS.site}`);
}

async function main() {
  const apiRoot = backendRoot();
  if (existsSync(resolve(apiRoot, ".env"))) process.loadEnvFile(resolve(apiRoot, ".env"));
  const env = launchEnvironment(process.env, apiRoot);
  if (process.argv.includes("--check")) return verify(apiRoot, env);
  const node = await node24(env);
  for (const file of [resolve(apiRoot, ".venv/bin/python"), env.MAINSEQUENCE_CLI,
    resolve(apiRoot, "scripts/dev_stack.sh"), resolve(SITE_ROOT, "node_modules/vite/bin/vite.js")]) {
    if (!existsSync(file)) throw new Error(`Missing ${file}; prepare the existing checkout first.`);
  }
  for (const port of Object.values(PORTS)) await requireFreePort(port);
  mkdirSync(resolve(SITE_ROOT, ".local/agent-state"), { recursive: true });
  process.once("SIGINT", () => { void stop(0); });
  process.once("SIGTERM", () => { void stop(0); });
  await apiToken(apiRoot, env);
  // Reuse the backend's existing lifecycle for its API and laptop-wide MetaTables service.
  start("local MetaTables + Alpaca API", "bash", ["scripts/dev_stack.sh", "api"], apiRoot, env);
  await waitFor("Local MetaTables", () => localRuntime(apiRoot, env));
  start("local Alpaca Agent", resolve(apiRoot, ".venv/bin/python"),
    ["-m", "uvicorn", "api.agent.main:app", "--host", "127.0.0.1", "--port", String(PORTS.agent)],
    apiRoot, env);
  start("Vite site (Node 24)", node,
    [resolve(SITE_ROOT, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port",
      String(PORTS.site), "--strictPort"], SITE_ROOT, env);
  await verify(apiRoot, env);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[local-stack] ${error.message}`); void stop(1); });
}
