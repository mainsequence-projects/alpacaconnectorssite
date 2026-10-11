import {
  createStaticSiteIframeClient,
  type StaticSiteFastApiTransportStatus,
  type StaticSiteIframeContext,
} from "@dev-mainsequence/command-center-sdk/embed";
import {
  applyThemePresetToRoot,
  mainSequenceTheme,
  quartzLightTheme,
  resolveCommandCenterThemeById,
} from "@dev-mainsequence/command-center-sdk/theme";
import { useEffect, useMemo, useState } from "react";

import { readApiResponse, type ApiTransport } from "./api";

const CHANNEL = "mainsequence.alpaca-connectors" as const;
const FASTAPI_RELEASE_UID = import.meta.env.VITE_FASTAPI_RESOURCE_RELEASE_UID?.trim();
const COMMAND_CENTER_ORIGIN = import.meta.env.VITE_COMMAND_CENTER_ORIGIN?.trim();
/** The end-to-end fixture API; in Vite development the dev server proxies to this URL instead. */
const LOCAL_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || "http://127.0.0.1:8321";

/** Where the SDK's `platformRequestProxy()` serves platform requests on the Vite dev server. */
const LOCAL_PLATFORM_PROXY_PATH = "/__mainsequence__";
/** How long the application waits for the host's first context before it reports the host silent. */
const HANDSHAKE_TIMEOUT_MS = 15_000;

export type ApplicationTransportStatus = StaticSiteFastApiTransportStatus | "local" | "starting";

/**
 * How the Alpaca Agent's conversation sends its platform requests as the person. The site never
 * holds a platform credential.
 * - `host`: embedded; Command Center sends each request as its signed-in person.
 * - `local`: Vite development; the dev server's `platformRequestProxy()` sends it as the developer.
 */
export interface PlatformRequestChannel {
  kind: "host" | "local";
  send: (request: Request) => Promise<Response>;
}

export interface ApplicationTransportState {
  context: StaticSiteIframeContext | null;
  error: string | null;
  /** Null where no platform session exists: direct production visits and end-to-end builds. */
  platformRequests: PlatformRequestChannel | null;
  status: ApplicationTransportStatus;
  transport: ApiTransport | null;
}

function applyContextTheme(context?: StaticSiteIframeContext) {
  const preset = context
    ? resolveCommandCenterThemeById(context.themeId) ??
      (context.themeMode === "dark" ? mainSequenceTheme : quartzLightTheme)
    : quartzLightTheme;
  applyThemePresetToRoot(document.documentElement, { theme: preset });
  document.documentElement.dataset.themeId = preset.id;
  document.documentElement.dataset.themeMode = preset.mode;
}

function assertRelativeApiPath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//") || /^https?:/i.test(path)) {
    throw new Error("API requests must use an application-relative path.");
  }
}

/**
 * Vite development calls its own server, whose proxy forwards to the local API and adds the
 * developer's Main Sequence session token (vite.config.ts), so the browser never holds a token.
 * End-to-end builds call their fixture API directly.
 */
function createDirectTransport(): ApiTransport {
  const baseUrl = new URL(import.meta.env.DEV ? window.location.origin : LOCAL_API_BASE_URL);
  return {
    async request<T>(path: string, init?: RequestInit) {
      assertRelativeApiPath(path);
      const response = await fetch(new URL(path, baseUrl), init);
      return readApiResponse<T>(response);
    },
  };
}

/**
 * Vite development has no Command Center host. The SDK's `platformRequestProxy()` (vite.config.ts)
 * sends the request as the developer, with the session `npx command-center-sdk login` saved on this
 * machine. Only the method, the path and query, `accept`, `content-type` and the body cross, as
 * through the host bridge.
 */
async function sendThroughLocalPlatformProxy(request: Request): Promise<Response> {
  const { pathname, search } = new URL(request.url);
  const headers = new Headers();
  for (const name of ["accept", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return fetch(`${LOCAL_PLATFORM_PROXY_PATH}${pathname}${search}`, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
    signal: request.signal,
  });
}

export function useAlpacaApiTransport(): ApplicationTransportState {
  const [context, setContext] = useState<StaticSiteIframeContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [platformRequests, setPlatformRequests] = useState<PlatformRequestChannel | null>(null);
  const [status, setStatus] = useState<ApplicationTransportStatus>("starting");
  const [transport, setTransport] = useState<ApiTransport | null>(null);

  useEffect(() => {
    applyContextTheme();

    const embedded = window.parent !== window;
    const directAllowed = import.meta.env.DEV || import.meta.env.MODE === "e2e";
    if (!embedded) {
      if (!directAllowed) {
        setError("Open this application from Command Center. Direct production access is disabled.");
        setStatus("unsupported");
        return;
      }
      setTransport(createDirectTransport());
      if (import.meta.env.DEV) setPlatformRequests({ kind: "local", send: sendThroughLocalPlatformProxy });
      setStatus("local");
      return;
    }

    if (!COMMAND_CENTER_ORIGIN || !FASTAPI_RELEASE_UID) {
      setError("Command Center origin and FastAPI ResourceRelease UID must be configured.");
      setStatus("invalid");
      return;
    }

    let hostOrigin: string;
    try {
      hostOrigin = new URL(COMMAND_CENTER_ORIGIN).origin;
    } catch {
      setError("VITE_COMMAND_CENTER_ORIGIN must be an absolute trusted origin.");
      setStatus("invalid");
      return;
    }

    const releaseUid = FASTAPI_RELEASE_UID;
    let connected = false;
    const client = createStaticSiteIframeClient({
      channel: CHANNEL,
      hostOrigin,
      parentWindow: window.parent,
      onContext(nextContext) {
        applyContextTheme(nextContext);
        setContext(nextContext);
        setError(null);
        // The SDK refuses delegated FastAPI and platform requests until the host's first context
        // (integrate-static-site-iframe), so the application gets its transport only then.
        if (!connected) {
          connected = true;
          window.clearTimeout(handshakeTimer);
          setTransport(apiTransport);
          setPlatformRequests(platformChannel);
          setStatus("idle");
        }
      },
      onFastApiStateChange(nextState) {
        if (nextState.resourceReleaseUid === releaseUid) {
          setStatus(nextState.status);
        }
      },
      onProtocolError(message) {
        setError(`Command Center bridge error: ${message}`);
      },
    });
    const apiTransport: ApiTransport = {
      async request<T>(path: string, init?: RequestInit) {
        assertRelativeApiPath(path);
        const response = await client.fetchFastApi({ resourceReleaseUid: releaseUid, path }, init);
        return readApiResponse<T>(response);
      },
    };
    const platformChannel: PlatformRequestChannel = {
      kind: "host",
      send: (request) => client.sendPlatformRequest(request),
    };
    const handshakeTimer = window.setTimeout(() => {
      if (connected) return;
      setError("Command Center did not share its session with this application. Reload the page in Command Center.");
      setStatus("unavailable");
    }, HANDSHAKE_TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => client.handleMessage(event);
    window.addEventListener("message", onMessage);
    client.announceReady();

    return () => {
      window.clearTimeout(handshakeTimer);
      window.removeEventListener("message", onMessage);
      client.clearFastApiCredentials();
      client.dispose();
    };
  }, []);

  return useMemo(
    () => ({ context, error, platformRequests, status, transport }),
    [context, error, platformRequests, status, transport],
  );
}
