import {
  ChatEngineProvider,
  ChatLauncher,
  ChatRail,
  ChatThread,
  createChatBackendConnection,
  type ChatAuth,
  type ChatDefaultSession,
  type ChatNotice,
  type ChatThreadCopy,
} from "@dev-mainsequence/command-center-ai";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { loadProjectConfiguration, type ApiTransport, type ProjectConfigurationResponse } from "./api";
import type { PlatformRequestChannel } from "./transport";

/*
 * The Alpaca Agent's conversation, drawn by Command Center AI (ChatLauncher, ChatRail, ChatThread).
 * The Agent and its Environment come from the API's project configuration when the page loads
 * (connector docs/api.md, "Project State And The Site's Agent"), never from the build or from the
 * person's Command Center Environment, so a re-created Agent reaches the site in the API's next
 * answer without a rebuild. Without an Agent the assistant is hidden and every page keeps working.
 */

/** One handle for this site: the platform returns the same session for the same person, Agent and handle. */
const SESSION_HANDLE = "alpaca_connectors_site";
/** The rail docks beside the page from this width and floats over it below. */
const DOCKED_RAIL_QUERY = "(min-width: 1400px)";
const NOTICE_DURATION_MS = 7000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VIEW_CONTEXT = { application: "alpaca-connectors" } as const;

const COPY: Partial<ChatThreadCopy> = {
  emptyTitle: "Ask the Alpaca Agent",
  emptyDescription:
    "Ask about your Alpaca accounts, assets, universes, signals and portfolios. The Agent never takes your Alpaca keys: it sends you to the Accounts page to enter them.",
  composerPlaceholder: "Ask the Alpaca Agent…",
  sessionUnavailableTitle: "The Alpaca Agent is unavailable",
  disclaimer: "The Alpaca Agent can make mistakes. Verify important outputs before acting.",
};

/** Who talks to which Agent, in which Environment. */
export interface SiteAgent {
  agentUid: string;
  environmentUid: string;
  userUid: string;
}

function uuidOrNull(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value.trim()) ? value.trim() : null;
}

/**
 * The conversation's inputs from one configuration answer, so the Agent and its Environment cannot
 * drift apart. Null keeps the assistant hidden: the API names no Agent, or it answered for another
 * person than the one the platform requests go out as.
 */
export function siteAgentFrom(configuration: ProjectConfigurationResponse, viewerUid: string | null): SiteAgent | null {
  const agentUid = uuidOrNull(configuration.agent_uid);
  const environmentUid = uuidOrNull(configuration.organization_environment_uid);
  if (!agentUid || !environmentUid || !viewerUid) return null;
  const answeredFor = typeof configuration.request_user_uid === "string" ? configuration.request_user_uid.trim() : "";
  if (answeredFor && answeredFor !== viewerUid) return null;
  return { agentUid, environmentUid, userUid: viewerUid };
}

/**
 * Reads the project configuration once the transport is ready, and who the platform requests go
 * out as: the host's person when embedded, the developer's saved session in Vite development.
 * Undefined while either is pending; null when the assistant stays hidden, including every mode
 * without a platform session (direct production visits and end-to-end builds).
 */
export function useSiteAgent(
  transport: ApiTransport | null,
  platformRequests: PlatformRequestChannel | null,
  hostUserUid: string | null | undefined,
): SiteAgent | null | undefined {
  const [configuration, setConfiguration] = useState<ProjectConfigurationResponse | null | undefined>(undefined);
  const [localUserUid, setLocalUserUid] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!transport || !platformRequests) return;
    const controller = new AbortController();
    loadProjectConfiguration(transport, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setConfiguration(value);
      },
      () => {
        if (!controller.signal.aborted) setConfiguration(null);
      },
    );
    return () => controller.abort();
  }, [transport, platformRequests]);

  useEffect(() => {
    if (platformRequests?.kind !== "local") return;
    const controller = new AbortController();
    platformRequests
      .send(new Request(new URL("/api/v1/users/me/", window.location.origin), {
        headers: { accept: "application/json" },
        signal: controller.signal,
      }))
      .then(async (response) => {
        const payload: unknown = response.ok ? await response.json() : null;
        const uid = typeof payload === "object" && payload !== null ? (payload as { uid?: unknown }).uid : null;
        if (!controller.signal.aborted) setLocalUserUid(typeof uid === "string" && uid ? uid : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLocalUserUid(null);
      });
    return () => controller.abort();
  }, [platformRequests]);

  const viewerUid = platformRequests?.kind === "host"
    ? hostUserUid
    : platformRequests?.kind === "local"
      ? localUserUid
      : null;

  return useMemo(() => {
    if (!platformRequests) return null;
    if (configuration === undefined || viewerUid === undefined) return undefined;
    return configuration === null ? null : siteAgentFrom(configuration, viewerUid);
  }, [configuration, platformRequests, viewerUid]);
}

interface AssistantState {
  agent: SiteAgent | null;
  close: () => void;
  docked: boolean;
  open: boolean;
}

const AssistantContext = createContext<AssistantState | null>(null);

function useDockedRail(): boolean {
  const [docked, setDocked] = useState(() => window.matchMedia(DOCKED_RAIL_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(DOCKED_RAIL_QUERY);
    const update = () => setDocked(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return docked;
}

function useNotice(): [ChatNotice | null, (notice: ChatNotice) => void] {
  const [notice, setNotice] = useState<ChatNotice | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return [notice, setNotice];
}

function AssistantNotice({ notice }: { notice: ChatNotice | null }) {
  if (!notice) return null;
  return (
    <div
      className={`alpaca-assistant-notice alpaca-assistant-notice--${notice.variant ?? "info"}`}
      role={notice.variant === "error" ? "alert" : "status"}
    >
      <strong>{notice.title}</strong>
      {notice.description ? <span>{notice.description}</span> : null}
    </div>
  );
}

function AlpacaAgentRail({ mode }: { mode: "docked" | "overlay" }) {
  const state = useContext(AssistantContext);
  if (!state?.agent) return null;
  return (
    <ChatRail title="Alpaca Agent" subtitle="Alpaca Connectors assistant" mode={mode} onClose={state.close}>
      <ChatThread copy={COPY} surface="overlay" viewer={{ uid: state.agent.userUid }} />
    </ChatRail>
  );
}

/**
 * The docked rail as the application shell's last column, so the page narrows beside it. Renders
 * nothing while the rail is closed or floats.
 */
export function DockedAlpacaAgentRail() {
  const state = useContext(AssistantContext);
  if (!state?.open || !state.docked) return null;
  return (
    <div className="alpaca-assistant-column">
      <AlpacaAgentRail mode="docked" />
    </div>
  );
}

/**
 * Mounts the conversation's one engine above the application shell, from the first render, so the
 * shell and its pages never remount when the Agent becomes known. Without an Agent the launcher is
 * hidden and the engine stays idle. While the rail is closed the engine reads only the Agent's icon
 * for the launcher; it opens (gets or creates) the person's session when the rail opens, and the
 * rail sends no message by itself.
 */
export function AlpacaAgentAssistant({
  agent,
  children,
  platformRequests,
}: {
  agent: SiteAgent | null | undefined;
  children: ReactNode;
  platformRequests: PlatformRequestChannel | null;
}) {
  const [requestedOpen, setRequestedOpen] = useState(false);
  const docked = useDockedRail();
  const [notice, notify] = useNotice();
  const open = Boolean(agent) && requestedOpen;
  const send = platformRequests?.send ?? null;
  const connection = useMemo(
    () => createChatBackendConnection({
      // Only builds request paths: the host bridge, or the dev server's proxy, sends each request.
      apiBaseUrl: window.location.origin,
      sendPlatformRequest: send,
    }),
    [send],
  );
  const userUid = agent?.userUid ?? null;
  const auth = useMemo<ChatAuth>(() => ({ userUid }), [userUid]);
  const loading = agent === undefined;
  const agentUid = agent?.agentUid ?? null;
  const defaultSession = useMemo<ChatDefaultSession>(
    () => ({
      agentUid,
      handleUniqueId: SESSION_HANDLE,
      name: "Alpaca Connectors",
      status: loading ? "loading" : agentUid ? "ready" : "error",
      unavailableMessage: "The Alpaca Agent is not available in this Environment.",
    }),
    [agentUid, loading],
  );
  const state = useMemo<AssistantState>(
    () => ({ agent: agent ?? null, close: () => setRequestedOpen(false), docked, open }),
    [agent, docked, open],
  );

  return (
    <ChatEngineProvider
      auth={auth}
      connection={connection}
      defaultSession={defaultSession}
      environmentUid={agent?.environmentUid ?? null}
      isVisible={open}
      notify={notify}
      onRequestVisible={() => {
        if (agent) setRequestedOpen(true);
      }}
      // Only the open rail shows the default session, so a visit that never opens it creates none.
      showsDefaultSession={open}
      viewContext={VIEW_CONTEXT}
    >
      <AssistantContext.Provider value={state}>
        {children}
        {open && !docked ? <AlpacaAgentRail mode="overlay" /> : null}
        {agent && !open ? (
          <ChatLauncher agentUid={agent.agentUid} label="Ask Alpaca Agent" onClick={() => setRequestedOpen(true)} />
        ) : null}
        <AssistantNotice notice={notice} />
      </AssistantContext.Provider>
    </ChatEngineProvider>
  );
}
