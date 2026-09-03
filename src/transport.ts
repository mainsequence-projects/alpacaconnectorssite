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
const LOCAL_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || "http://127.0.0.1:8001";

export type ApplicationTransportStatus = StaticSiteFastApiTransportStatus | "local" | "starting";

export interface ApplicationTransportState {
  context: StaticSiteIframeContext | null;
  error: string | null;
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

function createDirectTransport(): ApiTransport {
  const baseUrl = new URL(LOCAL_API_BASE_URL);
  return {
    async request<T>(path: string, init?: RequestInit) {
      assertRelativeApiPath(path);
      const response = await fetch(new URL(path, baseUrl), init);
      return readApiResponse<T>(response);
    },
  };
}

export function useAlpacaApiTransport(): ApplicationTransportState {
  const [context, setContext] = useState<StaticSiteIframeContext | null>(null);
  const [error, setError] = useState<string | null>(null);
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

    const client = createStaticSiteIframeClient({
      channel: CHANNEL,
      hostOrigin,
      parentWindow: window.parent,
      onContext(nextContext) {
        applyContextTheme(nextContext);
        setContext(nextContext);
        setError(null);
      },
      onFastApiStateChange(nextState) {
        if (nextState.resourceReleaseUid === FASTAPI_RELEASE_UID) {
          setStatus(nextState.status);
        }
      },
      onProtocolError(message) {
        setError(`Command Center bridge error: ${message}`);
      },
    });

    const onMessage = (event: MessageEvent) => client.handleMessage(event);
    window.addEventListener("message", onMessage);
    client.announceReady();
    setTransport({
      async request<T>(path: string, init?: RequestInit) {
        assertRelativeApiPath(path);
        const response = await client.fetchFastApi(
          { resourceReleaseUid: FASTAPI_RELEASE_UID, path },
          init,
        );
        return readApiResponse<T>(response);
      },
    });
    setStatus("idle");

    return () => {
      window.removeEventListener("message", onMessage);
      client.clearFastApiCredentials();
      client.dispose();
    };
  }, []);

  return useMemo(
    () => ({ context, error, status, transport }),
    [context, error, status, transport],
  );
}

