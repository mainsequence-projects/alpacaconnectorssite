import {
  ApplicationStatusScreen,
  ProgressStageList,
  type ProgressStageDefinition,
} from "@dev-mainsequence/command-center-sdk/feedback";
import { ApplicationCard, ApplicationPage, ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import {
  ApplicationNavigationPanel,
  type NavigationApplicationDefinition,
  type NavigationIntent,
} from "@dev-mainsequence/command-center-sdk/navigation";
import {
  ResourcePicker,
  type ResourcePickerOption,
} from "@dev-mainsequence/command-center-sdk/views";
import { Activity, BookOpen, BriefcaseBusiness, ChartCandlestick, Info, Landmark, Layers3, PackageSearch } from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  API_ENDPOINTS,
  assetRegistrationOperationPath,
  createApiClient,
  loadProjectConfiguration,
  normalizeSymbols,
  type Account,
  type ApiTransport,
  type AssetRegistrationExecuteResponse,
  type AssetRegistrationOperationResponse,
  type AssetRegistrationPlanResponse,
  type AssetRegistrationRequest,
  type AssetUniverse,
  type AssetUniverseCreateRequest,
  type ProjectConfigurationResponse,
  type ResourceCollection,
} from "./api";
import { useAlpacaApiTransport, type ApplicationTransportStatus } from "./transport";
import { AccountsPage } from "./accounts";
import { AssetResourceList } from "./assetResource";
import { BarsConfigurationsPage } from "./barConfigurations";
import { PortfoliosPage } from "./portfolios";
import { SignalsPage } from "./signals";
import { UniverseResourceList } from "./universeResource";

type RouteId = "assets" | "accounts" | "universes" | "bars" | "signals" | "portfolios";
const ASSET_OPERATION_POLL_TIMEOUT_MS = 10 * 60 * 1000;
type ActionState<T> =
  | { state: "idle" }
  | { state: "loading"; label: string }
  | { state: "error"; message: string }
  | { state: "success"; label: string; result: T };

const ROUTE_PATHS: Record<RouteId, string> = {
  assets: "/assets",
  accounts: "/accounts",
  universes: "/universes",
  bars: "/bars",
  signals: "/signals",
  portfolios: "/portfolios",
};

function AlpacaNavigationIcon({ className }: { className?: string }) {
  return <span className={`alpaca-navigation-logo ${className ?? ""}`.trim()} />;
}

const NAVIGATION: NavigationApplicationDefinition = {
  id: "alpaca-connectors",
  label: "Alpaca Connectors",
  description: "Asset registration and ETF holdings universes",
  icon: AlpacaNavigationIcon,
  href: "/assets",
  defaultDestinationId: "assets",
  subApplications: [
    {
      id: "operations",
      label: "Workflows",
      destinations: [
        { id: "assets", label: "Assets", href: "/assets", icon: PackageSearch, description: "Plan and run strict registration" },
        {
          id: "accounts",
          label: "Accounts",
          href: "/accounts",
          icon: Landmark,
          description: "Register accounts by Secret reference",
        },
        {
          id: "universes",
          label: "Universes",
          href: "/universes",
          icon: Layers3,
          description: "Create and run ETF holdings universes",
        },
        {
          id: "bars",
          label: "Bars",
          href: "/bars",
          icon: ChartCandlestick,
          description: "Manage reusable market-data configurations",
        },
        {
          id: "signals",
          label: "ETF Weight Signal",
          href: "/signals",
          icon: Activity,
          description: "Schedule Universe-backed ETF signals",
        },
        {
          id: "portfolios",
          label: "ETF Portfolios",
          href: "/portfolios",
          icon: BriefcaseBusiness,
          description: "Build scheduled analytical portfolios",
        },
      ],
    },
    {
      id: "reference",
      label: "Reference",
      destinations: [
        {
          id: "documentation",
          label: "Documentation",
          href: "/docs/",
          icon: BookOpen,
          description: "Project workflows and technical reference",
        },
      ],
    },
  ],
};

function routeFromPath(pathname: string): RouteId {
  if (pathname.startsWith("/accounts")) return "accounts";
  if (pathname.startsWith("/universes")) return "universes";
  if (pathname.startsWith("/bars")) return "bars";
  if (pathname.startsWith("/signals")) return "signals";
  if (pathname.startsWith("/portfolios")) return "portfolios";
  return "assets";
}

function formatError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "Request cancelled.";
  return error instanceof Error ? error.message : "The request failed unexpectedly.";
}

function transportMessage(status: ApplicationTransportStatus): string {
  const messages: Partial<Record<ApplicationTransportStatus, string>> = {
    starting: "Starting the application transport…",
    authorizing: "Requesting delegated API access…",
    "runtime-starting": "The API runtime is starting…",
    expired: "Delegated API access expired; requesting a fresh credential…",
    "authentication-failed": "Command Center could not authorize this API release.",
    forbidden: "This user cannot access the configured API release.",
    "missing-route": "The configured API release does not expose this route.",
    transient: "The API is temporarily unavailable.",
    cancelled: "The API request was cancelled.",
    unavailable: "The API release is unavailable.",
    unsupported: "This application requires the Command Center iframe bridge.",
    invalid: "The application transport configuration is invalid.",
  };
  return messages[status] ?? "API transport ready.";
}

function StatusPill({ tone, children }: { tone: "success" | "warning" | "neutral"; children: ReactNode }) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}

function SummaryList({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value);
  if (entries.length === 0) return <p className="muted">No summary fields were returned.</p>;
  return (
    <dl className="summary-list">
      {entries.map(([key, item]) => (
        <div key={key}>
          <dt>{key.replaceAll("_", " ")}</dt>
          <dd>{typeof item === "string" ? item : JSON.stringify(item)}</dd>
        </div>
      ))}
    </dl>
  );
}

function SymbolList({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="result-group">
      <h4>{label}</h4>
      <div className="tag-list">
        {values.map((value) => (
          <span className="tag" key={value}>{value}</span>
        ))}
      </div>
    </div>
  );
}

function WarningList({ warnings }: { warnings: Record<string, string> }) {
  const entries = Object.entries(warnings);
  if (entries.length === 0) return null;
  return (
    <div className="result-group">
      <h4>OpenFIGI enrichment warnings</h4>
      <dl className="summary-list">
        {entries.map(([symbol, reason]) => (
          <div key={symbol}>
            <dt>{symbol}</dt>
            <dd>{reason}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function operationStageStatus(
  status: AssetRegistrationOperationResponse["steps"][number]["status"],
): ProgressStageDefinition["status"] {
  if (status === "running") return "active";
  if (status === "succeeded") return "complete";
  if (status === "failed") return "error";
  return "pending";
}

function operationStepStatusLabel(
  status: AssetRegistrationOperationResponse["steps"][number]["status"],
): string {
  const labels = {
    pending: "Waiting",
    running: "Running",
    succeeded: "Complete",
    failed: "Failed",
    skipped: "Skipped",
  } as const;
  return labels[status];
}

function RegistrationProgress({ operation }: { operation: AssetRegistrationOperationResponse }) {
  const stages: ProgressStageDefinition[] = operation.steps.map((step) => ({
    id: step.key,
    label: step.label,
    description: step.message ?? undefined,
    status: operationStageStatus(step.status),
    statusLabel: operationStepStatusLabel(step.status),
  }));
  const complete = operation.steps.filter((step) => step.status === "succeeded").length;
  const summary = operation.status === "succeeded"
    ? `Registration ${operation.action} completed. All ${operation.steps.length} steps finished.`
    : operation.status === "failed"
      ? `Registration ${operation.action} failed at ${operation.current_step ?? "an unknown step"}.`
      : `Registration ${operation.action} is ${operation.status}. ${complete} of ${operation.steps.length} steps complete.`;

  return (
    <ApplicationCard
      header={(
        <div className="card-title-row">
          <div>
            <p className="eyebrow">Operation {operation.operation_uid}</p>
            <h2>Registration progress</h2>
          </div>
          <StatusPill tone={operation.status === "succeeded" ? "success" : operation.status === "failed" ? "warning" : "neutral"}>
            {operation.status}
          </StatusPill>
        </div>
      )}
    >
      <p className="operation-summary" role="status" aria-live="polite">{summary}</p>
      <ProgressStageList
        ariaLabel="Asset registration progress"
        detailVisibility="always"
        stages={stages}
      />
    </ApplicationCard>
  );
}

function waitForPoll(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Request cancelled.", "AbortError"));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Request cancelled.", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function ActionResult({ action }: { action: ActionState<unknown> }) {
  if (action.state === "idle") return null;
  if (action.state === "loading") {
    return (
      <ApplicationStatusScreen
        as="section"
        state="loading"
        title={action.label}
        message="Waiting for the Alpaca Connectors API."
        variant="contained"
      />
    );
  }
  if (action.state === "error") {
    return (
      <ApplicationStatusScreen
        as="section"
        state="error"
        title="Request failed"
        message={action.message}
        variant="contained"
      />
    );
  }
  return (
    <section className="action-result" aria-live="polite">
      <div className="section-heading">
        <h3>{action.label}</h3>
        <StatusPill tone="success">Complete</StatusPill>
      </div>
      <pre>{JSON.stringify(action.result, null, 2)}</pre>
    </section>
  );
}

function AssetsPage({ transport }: { transport: ApiTransport }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountUid, setAccountUid] = useState("");
  const [symbols, setSymbols] = useState("AAPL, MSFT");
  const [timeout, setTimeoutValue] = useState(30);
  const [action, setAction] = useState<ActionState<AssetRegistrationPlanResponse | AssetRegistrationExecuteResponse>>({ state: "idle" });
  const [operation, setOperation] = useState<AssetRegistrationOperationResponse | null>(null);
  const [approvedRequestKey, setApprovedRequestKey] = useState<string | null>(null);
  const [assetRefreshKey, setAssetRefreshKey] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  const api = useMemo(() => createApiClient(transport), [transport]);

  useEffect(() => {
    const controller = new AbortController();
    setAccountsLoading(true);
    setAccountsError(null);
    api.get<ResourceCollection<Account>>(
      `${API_ENDPOINTS.accounts}?limit=100&offset=0&active=true&ordering=account_name`,
      controller.signal,
    )
      .then((response) => setAccounts(response.items))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setAccountsError(formatError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setAccountsLoading(false);
      });
    return () => controller.abort();
  }, [api]);

  const accountOptions = useMemo<ResourcePickerOption[]>(() => accounts.map((account) => ({
    value: account.uid,
    label: account.account_name,
    subtitle: `${account.is_paper ? "Paper" : "Live"} · ${account.unique_identifier}`,
    keywords: [account.unique_identifier, account.is_paper ? "paper" : "live"],
  })), [accounts]);

  const request = useMemo<AssetRegistrationRequest>(() => ({
    account_uid: accountUid,
    symbols: normalizeSymbols(symbols),
    timeout,
  }), [accountUid, symbols, timeout]);
  const requestKey = JSON.stringify(request);
  const busy = action.state === "loading";

  useEffect(() => () => activeRequest.current?.abort(), []);

  function inputsChanged() {
    setApprovedRequestKey(null);
    setOperation(null);
    if (action.state !== "loading") setAction({ state: "idle" });
  }

  async function submit(event: FormEvent, execution: "plan" | "execute") {
    event.preventDefault();
    if (!accountUid) {
      setAction({ state: "error", message: "Select a registered Alpaca account." });
      return;
    }
    if (!request.symbols.length) {
      setAction({ state: "error", message: "Enter at least one symbol." });
      return;
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setOperation(null);
    setAction({ state: "loading", label: execution === "plan" ? "Planning registration" : "Registering assets" });
    try {
      let current = await api.post<AssetRegistrationOperationResponse>(
        API_ENDPOINTS.assetRegistrationOperations,
        { action: execution, request },
        controller.signal,
      );
      setOperation(current);
      const pollingDeadline = Date.now() + ASSET_OPERATION_POLL_TIMEOUT_MS;

      while (current.status === "queued" || current.status === "running") {
        if (Date.now() >= pollingDeadline) {
          throw new Error(
            `Registration status did not reach a terminal state within ${ASSET_OPERATION_POLL_TIMEOUT_MS / 60_000} minutes.`,
          );
        }
        const pollAfterMs = Math.max(250, Math.min(current.poll_after_ms || 500, 5000));
        await waitForPoll(pollAfterMs, controller.signal);
        current = await api.get<AssetRegistrationOperationResponse>(
          assetRegistrationOperationPath(current.operation_uid),
          controller.signal,
        );
        setOperation(current);
      }

      if (current.status === "failed") {
        throw new Error(current.error?.message ?? "Asset registration failed.");
      }
      if (!current.result) {
        throw new Error("The completed registration operation did not return a result.");
      }

      if (execution === "plan") {
        const result = current.result as AssetRegistrationPlanResponse;
        setApprovedRequestKey(result.can_register ? requestKey : null);
        setAction({ state: "success", label: "Registration plan", result });
      } else {
        const result = current.result as AssetRegistrationExecuteResponse;
        setApprovedRequestKey(null);
        setAssetRefreshKey((currentKey) => currentKey + 1);
        setAction({ state: "success", label: "Registration execution", result });
      }
    } catch (error) {
      if (!controller.signal.aborted) setAction({ state: "error", message: formatError(error) });
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }

  const lastPlan = action.state === "success" && "can_register" in action.result
    ? action.result as AssetRegistrationPlanResponse
    : null;

  return (
    <ApplicationPage as="main" maxWidth="content">
      <ApplicationPageStack>
        <ApplicationPageHeader
          eyebrow="Assets"
          title="Register Alpaca-backed assets"
          description="Use a registered Alpaca account to resolve every symbol to Alpaca's immutable asset ID before writing Main Sequence assets. OpenFIGI metadata is optional enrichment."
        />
        <ApplicationCard header={<h2>Registration scope</h2>}>
          <form className="workflow-form" onSubmit={(event) => submit(event, "plan")}>
            <div className="field resource-picker-field">
              <label id="asset-registration-account-label">Registered Alpaca account</label>
              <ResourcePicker
                ariaLabelledBy="asset-registration-account-label"
                disabled={busy || accountsError !== null}
                emptyMessage="No active registered Alpaca accounts."
                fullWidth
                loading={accountsLoading}
                mode="single"
                onValueChange={(value) => {
                  setAccountUid(value);
                  inputsChanged();
                }}
                options={accountOptions}
                placeholder="Select the account used for Alpaca access"
                searchable
                searchPlaceholder="Search registered accounts"
                value={accountUid || null}
              />
              {accountsError ? <span className="field-error">{accountsError}</span> : null}
              {!accountsLoading && !accountsError && accountOptions.length === 0 ? (
                <span>No active account is registered. <a href="/accounts">Register an account first.</a></span>
              ) : (
                <span>Credential values are resolved from the selected account's Main Sequence Secret references.</span>
              )}
            </div>
            <label className="field">Exact Alpaca symbols <span>Comma or space separated</span>
              <textarea value={symbols} disabled={busy} onChange={(event) => { setSymbols(event.target.value); inputsChanged(); }} rows={3} placeholder="AAPL, MSFT, NVDA" />
            </label>

            <label className="field">Timeout (seconds)
              <input type="number" min={1} max={300} value={timeout} disabled={busy} onChange={(event) => { setTimeoutValue(Number(event.target.value)); inputsChanged(); }} />
            </label>

            <div className="form-actions">
              <button className="button button--secondary" type="submit" disabled={busy || accountsLoading || Boolean(accountsError) || !accountUid}>Build plan</button>
              <button
                className="button button--primary"
                type="button"
                disabled={busy || approvedRequestKey !== requestKey}
                onClick={(event) => void submit(event as unknown as FormEvent, "execute")}
              >
                Execute approved plan
              </button>
            </div>
            <p className="form-note">Execution becomes available only when the current inputs have a plan with no registration blockers.</p>
          </form>
        </ApplicationCard>

        {lastPlan ? (
          <ApplicationCard header={<div className="card-title-row"><h2>Plan readiness</h2><StatusPill tone={lastPlan.can_register ? "success" : "warning"}>{lastPlan.can_register ? "Ready" : "Blocked"}</StatusPill></div>}>
            <SummaryList value={lastPlan.plan_summary} />
            <SymbolList label="Missing from Alpaca" values={lastPlan.missing_symbols_from_alpaca} />
            <SymbolList label="Will be registered" values={lastPlan.missing_symbols_to_register} />
            <WarningList warnings={lastPlan.warnings_by_symbol} />
          </ApplicationCard>
        ) : null}
        {operation ? <RegistrationProgress operation={operation} /> : null}
        {action.state !== "loading" || !operation ? <ActionResult action={action} /> : null}
        <AssetResourceList transport={transport} refreshKey={assetRefreshKey} />
      </ApplicationPageStack>
    </ApplicationPage>
  );
}

function UniversesPage({ transport }: { transport: ApiTransport }) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [action, setAction] = useState<ActionState<AssetUniverse>>({ state: "idle" });
  const [universeRefreshKey, setUniverseRefreshKey] = useState(0);
  const api = useMemo(() => createApiClient(transport), [transport]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !symbol.trim() || !sourceUrl.trim()) {
      setAction({ state: "error", message: "Name, ETF ticker, and holdings source URL are required." });
      return;
    }
    const request: AssetUniverseCreateRequest = {
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      source_url: sourceUrl.trim(),
    };
    setAction({ state: "loading", label: "Creating universe" });
    try {
      const result = await api.post<AssetUniverse>(API_ENDPOINTS.universes, request);
      setAction({ state: "success", label: "Universe created", result });
      setName("");
      setSymbol("");
      setSourceUrl("");
      setUniverseRefreshKey((current) => current + 1);
    } catch (error) {
      setAction({ state: "error", message: formatError(error) });
    }
  }

  return (
    <ApplicationPage as="main" maxWidth="content">
      <ApplicationPageStack>
        <ApplicationPageHeader
          eyebrow="Universes"
          title="Create and manage ETF holdings universes"
          description="Each universe stores an ETF holdings source and materializes its components as linked Asset Category membership."
        />
        <ApplicationCard header={<h2>Create universe</h2>}>
          <form className="workflow-form" onSubmit={submit}>
            <div className="form-grid">
              <label className="field">Name
                <input
                  type="text"
                  value={name}
                  placeholder="iShares Core S&amp;P 500 ETF"
                  disabled={action.state === "loading"}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="field">ETF ticker
                <input
                  type="text"
                  value={symbol}
                  placeholder="IVV"
                  disabled={action.state === "loading"}
                  onChange={(event) => setSymbol(event.target.value)}
                />
              </label>
              <label className="field field--wide">Holdings source URL
                <input
                  type="url"
                  value={sourceUrl}
                  placeholder="https://www.ishares.com/us/products/239726/ishares-core-sp-500-etf"
                  disabled={action.state === "loading"}
                  onChange={(event) => setSourceUrl(event.target.value)}
                />
              </label>
            </div>
            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={action.state === "loading"}>Create universe</button>
            </div>
            <div className="workflow-guidance">
              <Info aria-hidden="true" size={18} />
              <p>Creation saves the ETF holdings source and creates the linked empty category. <strong>Extract components</strong> reads current holdings and materializes membership; extracted weights are not stored on the Universe. If missing Alpaca-backed assets must be registered, the account is selected only for that execution and is not stored on the Universe.</p>
            </div>
          </form>
        </ApplicationCard>
        {action.state === "success" ? (
          <section className="action-result" aria-live="polite">
            <div className="section-heading">
              <h3>{action.label}</h3>
              <StatusPill tone="success">Complete</StatusPill>
            </div>
            <p>Created {action.result.display_name} with Universe UID {action.result.uid}, Source UID {action.result.source_uid}, and Asset Category UID {action.result.asset_category_uid}. It has zero assets until component extraction succeeds.</p>
          </section>
        ) : (
          <ActionResult action={action} />
        )}
        <UniverseResourceList transport={transport} refreshKey={universeRefreshKey} />
      </ApplicationPageStack>
    </ApplicationPage>
  );
}

export default function App() {
  const transportState = useAlpacaApiTransport();
  const [route, setRoute] = useState<RouteId>(() => routeFromPath(window.location.pathname));
  const [configuration, setConfiguration] = useState<ProjectConfigurationResponse | null>(null);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [configurationLoading, setConfigurationLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((nextRoute: RouteId) => {
    const path = ROUTE_PATHS[nextRoute];
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setRoute(nextRoute);
  }, []);

  useEffect(() => {
    if (!transportState.transport) return;
    if (route !== "assets" && route !== "bars" && route !== "signals") {
      setConfigurationLoading(false);
      setConfigurationError(null);
      return;
    }
    const controller = new AbortController();
    setConfigurationLoading(true);
    setConfigurationError(null);
    loadProjectConfiguration(transportState.transport, controller.signal)
      .then(setConfiguration)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setConfigurationError(formatError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setConfigurationLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey, route, transportState.transport]);

  const terminalTransportError = transportState.error && !transportState.transport;

  const handleNavigation = useCallback((intent: NavigationIntent) => {
    if (intent.destinationId === "documentation") {
      window.location.assign("/docs/");
      return;
    }
    navigate(intent.destinationId as RouteId);
  }, [navigate]);

  return (
    <div className="cc-application-navigation-shell application-shell">
      <ApplicationNavigationPanel
        activeDestinationId={route}
        application={NAVIGATION}
        className="application-navigation"
        onNavigate={handleNavigation}
        panelWidth="248px"
        showDestinationDescriptions
      />
      <div className="cc-application-navigation-shell__content application-content">
        {terminalTransportError || (!transportState.transport && transportState.status !== "starting") ? (
          <ApplicationPage as="main" maxWidth="content">
            <ApplicationStatusScreen
              state="error"
              title="Application unavailable"
              message={transportState.error ?? transportMessage(transportState.status)}
            />
          </ApplicationPage>
        ) : !transportState.transport ? (
          <ApplicationPage as="main" maxWidth="content">
            <ApplicationStatusScreen
              state="loading"
              title="Starting Alpaca Connectors"
              message={transportMessage(transportState.status)}
            />
          </ApplicationPage>
        ) : (route === "assets" || route === "bars") && !configurationError && (configurationLoading || !configuration) ? (
          <ApplicationPage as="main" maxWidth="content">
            <ApplicationStatusScreen
              state="loading"
              title="Loading application configuration"
              message={transportMessage(transportState.status)}
            />
          </ApplicationPage>
        ) : (route === "assets" || route === "bars") && configurationError ? (
          <ApplicationPage as="main" maxWidth="content">
            <ApplicationStatusScreen
              state="error"
              title="Application configuration unavailable"
              message={configurationError}
              action={{ label: "Try again", onSelect: () => setReloadKey((value) => value + 1) }}
            />
          </ApplicationPage>
        ) : route === "assets" ? (
          <AssetsPage transport={transportState.transport} />
        ) : route === "accounts" ? (
          <AccountsPage transport={transportState.transport} />
        ) : route === "bars" && configuration ? (
          <BarsConfigurationsPage
            transport={transportState.transport}
            configuration={configuration}
          />
        ) : route === "signals" ? (
          <SignalsPage transport={transportState.transport} />
        ) : route === "portfolios" ? (
          <PortfoliosPage transport={transportState.transport} />
        ) : (
          <UniversesPage transport={transportState.transport} />
        )}
      </div>
    </div>
  );
}
