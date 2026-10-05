import { execFile } from "node:child_process";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Logger, type Plugin, type ProxyOptions } from "vite";

/** Paths the development server forwards to the local Alpaca Connectors API. */
const LOCAL_API_PATHS = ["/v1/", "/health"] as const;
const DEFAULT_LOCAL_API_BASE_URL = "http://127.0.0.1:8321";
/** `mainsequence auth token` renews a token that expires within a minute; ask again at that point. */
const TOKEN_RENEWAL_MARGIN_MS = 60_000;
const TOKEN_WITHOUT_EXPIRY_REUSE_MS = 5 * 60_000;
const CLI_TIMEOUT_MS = 30_000;

interface SessionToken {
  value: string;
  renewAt: number;
}

function isLocalApiPath(url: string | undefined): boolean {
  return LOCAL_API_PATHS.some((path) => url?.startsWith(path));
}

/** The first line of the CLI's error output, such as "Not logged in."; it never prints a token there. */
function firstLine(text: string): string {
  return (text.replace(/\u001b\[[0-9;]*m/g, "").trim().split("\n", 1)[0] ?? "").trim().slice(0, 300);
}

/**
 * The developer's Main Sequence session, read with `mainsequence auth token --json` from the CLI
 * named by MAINSEQUENCE_CLI, else `mainsequence` on PATH. The token stays in this Node process; it
 * is never sent to the browser, written to a file or URL, or logged.
 */
function createSessionTokenSource(cli: string) {
  let cached: SessionToken | null = null;
  let pending: Promise<SessionToken> | null = null;

  function read(): Promise<SessionToken> {
    return new Promise((resolve, reject) => {
      execFile(
        cli,
        ["auth", "token", "--json"],
        { timeout: CLI_TIMEOUT_MS, maxBuffer: 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
            const detail = firstLine(stderr);
            reject(new Error(missing
              ? `the Main Sequence CLI "${cli}" was not found. Put mainsequence on PATH or set MAINSEQUENCE_CLI to it, for example the API checkout's .venv/bin/mainsequence.`
              : `"${cli} auth token" failed: ${detail || 'run "mainsequence login".'}`));
            return;
          }
          try {
            const payload = JSON.parse(stdout) as { access_token?: unknown; expires_at?: unknown };
            if (typeof payload.access_token !== "string" || !payload.access_token.trim()) throw new Error();
            const expiresAt = typeof payload.expires_at === "number" ? payload.expires_at * 1000 : null;
            resolve({
              value: payload.access_token.trim(),
              renewAt: expiresAt === null ? Date.now() + TOKEN_WITHOUT_EXPIRY_REUSE_MS : expiresAt - TOKEN_RENEWAL_MARGIN_MS,
            });
          } catch {
            reject(new Error(`"${cli} auth token --json" did not return an access token.`));
          }
        },
      );
    });
  }

  return {
    async token(): Promise<string> {
      if (cached && Date.now() < cached.renewAt) return cached.value;
      pending ??= read().finally(() => {
        pending = null;
      });
      cached = await pending;
      return cached.value;
    },
    /** Drop a token the API rejected so the next request asks the CLI again. */
    forget() {
      cached = null;
    },
  };
}

/**
 * Local development only. The API authenticates every caller (connector ADR 0014): locally, with
 * `Authorization: Bearer <Main Sequence token>`. Browser code never holds that token, so the
 * development server proxies the API paths to the local API and adds the developer's session token
 * there. End-to-end builds call their fixture API directly; production uses the Command Center
 * transport, whose SDK attaches the delegated credential.
 */
function localApiSessionProxy(target: string): { plugin: Plugin; proxy: Record<string, ProxyOptions> } {
  const cli = process.env.MAINSEQUENCE_CLI?.trim() || "mainsequence";
  const session = createSessionTokenSource(cli);
  let lastFailure: string | null = null;

  function reportFailure(logger: Logger, reason: string) {
    if (reason === lastFailure) return;
    lastFailure = reason;
    logger.warn(`[local API] No Main Sequence session for API requests: ${reason}`, { timestamp: true });
  }

  const proxyOptions: ProxyOptions = {
    target,
    changeOrigin: true,
    configure(proxy) {
      proxy.on("proxyRes", (proxyResponse) => {
        if (proxyResponse.statusCode === 401) session.forget();
      });
    },
  };

  return {
    proxy: Object.fromEntries(LOCAL_API_PATHS.map((path) => [path, proxyOptions])),
    plugin: {
      name: "alpaca-local-api-session",
      apply: "serve",
      configureServer(server) {
        // Runs before Vite's proxy, which forwards the request with this header.
        server.middlewares.use(async (request, response, next) => {
          if (!isLocalApiPath(request.url) || request.method === "OPTIONS") {
            next();
            return;
          }
          try {
            request.headers.authorization = `Bearer ${await session.token()}`;
            lastFailure = null;
            next();
          } catch (error) {
            const reason = error instanceof Error ? error.message : "the session token is unavailable.";
            reportFailure(server.config.logger, reason);
            response.statusCode = 401;
            response.setHeader("Content-Type", "application/json");
            response.setHeader("Cache-Control", "no-store");
            response.end(JSON.stringify({ detail: `Local API requests need your Main Sequence session: ${reason}` }));
          }
        });
      },
    },
  };
}

export default defineConfig(({ command, mode, isPreview }) => {
  if (command !== "serve" || isPreview) return { plugins: [react()] };
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const localApi = localApiSessionProxy(env.VITE_API_BASE_URL?.trim() || DEFAULT_LOCAL_API_BASE_URL);
  return {
    plugins: [react(), localApi.plugin],
    server: { proxy: localApi.proxy },
  };
});
