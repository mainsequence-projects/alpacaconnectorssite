export const API_ENDPOINTS = {
  configuration: "/v1/project-state/configuration",
  assets: "/v1/assets",
  assetDiscovery: "/v1/assets/discovery",
  assetRegistrationOperations: "/v1/assets/registration/operations",
  accounts: "/v1/accounts",
  accountDiscovery: "/v1/accounts/discovery",
  accountRegistrationPreflight: "/v1/accounts/registration/preflight",
  accountKeyRequests: "/v1/accounts/key-requests",
  barConfigurations: "/v1/market-data/bar-configurations",
  barConfigurationDiscovery: "/v1/market-data/bar-configurations/discovery",
  portfolioConfigurations: "/v1/portfolio-configurations",
  portfolioConfigurationDiscovery: "/v1/portfolio-configurations/discovery",
  portfolioRebalanceConfigurations: "/v1/portfolio-rebalance-configurations",
  portfolioRebalanceConfigurationDiscovery: "/v1/portfolio-rebalance-configurations/discovery",
  signalDefinitions: "/v1/signal-definitions",
  signalDefinitionDiscovery: "/v1/signal-definitions/discovery",
} as const;

function accountPath(accountUid: string): string {
  return `${API_ENDPOINTS.accounts}/${encodeURIComponent(accountUid)}`;
}

/** Clears the account's stored keys; everything else stays (connector ADR 0028). */
export function accountRemoveKeysPath(accountUid: string): string {
  return `${accountPath(accountUid)}/actions/remove-keys`;
}

/** What deleting the account would delete, and what refuses it; nothing changes. */
export function accountDeletePreflightPath(accountUid: string): string {
  return `${accountPath(accountUid)}/actions/delete/preflight`;
}

/**
 * Deletes the account and everything that belongs to it. The API takes only the exact
 * confirmation `DELETE <account uid>`; the site sends it once the person has typed DELETE.
 */
export function accountDeletePath(accountUid: string): string {
  return `${accountPath(accountUid)}?confirm=${encodeURIComponent(`DELETE ${accountUid}`)}`;
}

export function signalDefinitionPath(definitionUid: string): string {
  return `${API_ENDPOINTS.signalDefinitions}/${encodeURIComponent(definitionUid)}`;
}

/** The signal's latest observations, oldest first, at most `limit` (the API allows 500). */
export function signalDefinitionWeightsPath(definitionUid: string, limit: number): string {
  return `${signalDefinitionPath(definitionUid)}/weights?limit=${limit}`;
}

export function assetRegistrationOperationPath(operationUid: string): string {
  return `${API_ENDPOINTS.assetRegistrationOperations}/${encodeURIComponent(operationUid)}`;
}

export function accountKeyRequestCancelPath(keyRequestUid: string): string {
  return `${API_ENDPOINTS.accountKeyRequests}/${encodeURIComponent(keyRequestUid)}/actions/cancel`;
}

export interface ProjectConfigurationResponse {
  migrated_market_data_profiles: string[];
  /** When `agent_uid` is set, that Agent's own Environment (connector `docs/api.md`). */
  organization_environment_uid: string | null;
  organization_environment_name: string | null;
  /**
   * This branch's deployed Alpaca Agent, which the API finds when the request arrives; null when it
   * cannot name exactly one. Absent from APIs before connector ee18b82. Never from the site's build.
   */
  agent_uid?: string | null;
  /** The person the API answered for. */
  request_user_uid?: string | null;
  [key: string]: unknown;
}

export interface Account {
  uid: string;
  account_uid: string;
  unique_identifier: string;
  account_name: string;
  account_is_active: boolean;
  is_paper: boolean;
  /**
   * `managed`: keys a person entered through this site or the API; `imported`: keys copied once
   * from Main Sequence Secrets selected by name (connector ADR 0017).
   */
  credential_source: "managed" | "imported";
  /** False once the owner removed the keys (`credentials_removed`). */
  credentials_stored: boolean;
  /** The owner removed the keys; runs fail until keys are entered again. Absent before 0029's API. */
  credentials_removed?: boolean;
  credentials_updated_at: string | null;
  credentials_updated_by_user_uid: string | null;
  status: string | null;
  currency: string | null;
  snapshot_time: string | null;
  equity: string | number | null;
  cash: string | number | null;
  buying_power: string | number | null;
}

export type AccountSummary = Account;

export interface AccountHoldingDetails {
  symbol?: string | null;
  kind?: string | null;
  asset_class?: string | null;
  exchange?: string | null;
  avg_entry_price?: string | number | null;
  market_value?: string | number | null;
  cost_basis?: string | number | null;
  unrealized_pl?: string | number | null;
  current_price?: string | number | null;
  alpaca_asset_id?: string | null;
}

export interface AccountHolding {
  time_index: string;
  account_uid: string;
  asset_identifier: string;
  asset_uid: string | null;
  holdings_set_uid: string;
  is_trade_snapshot: boolean | null;
  quantity: number | null;
  direction: 1 | -1;
  target_trade_time: string | null;
  extra_details: AccountHoldingDetails | null;
}

export interface Asset {
  uid: string;
  unique_identifier: string;
  alpaca_asset_id: string;
  ticker: string;
  name: string | null;
  asset_type: string;
  exchange: string | null;
  status: string;
  tradable: boolean;
  figi: string | null;
  composite_figi: string | null;
}

/**
 * Write-only Alpaca credential values. The API validates them against Alpaca and stores them
 * encrypted on the account row (connector ADR 0017); they are never returned. The site sends only
 * this `managed` shape.
 */
export interface ManagedAlpacaCredentials {
  source: "managed";
  api_key: string;
  secret_key: string;
}

export interface AccountRegistrationRequest {
  account_name: string | null;
  environment: "paper" | "live";
  credentials: ManagedAlpacaCredentials;
  /** The signed-in person's pending key request this registration completes (connector ADR 0015). */
  key_request_uid?: string;
}

/**
 * A request, started by the Alpaca Agent for the signed-in person, to enter Alpaca keys here:
 * `register` a new account or `rotate` an existing account's keys (connector ADR 0015). The API
 * lists only the person's own pending, unexpired requests and holds no credential in them.
 */
export interface AccountKeyRequest {
  uid: string;
  action: "register" | "rotate";
  account_name: string | null;
  environment: "paper" | "live";
  account_uid: string | null;
  status: "pending" | "completed" | "cancelled" | "expired";
  created_at: string;
  expires_at: string;
  completed_at: string | null;
}

export interface AccountKeyRequestCollection {
  items: AccountKeyRequest[];
}

/** Read-only registration dry run returned by the preflight endpoint; nothing is written. */
export interface AccountRegistrationPreflightResponse {
  account_unique_identifier: string;
  account_number: string | null;
  status: string | null;
  is_paper: boolean;
  credential_source: "managed" | "imported";
  equity: string | number | null;
  cash: string | number | null;
  would_write_holdings: number;
  unresolved_symbols: string[];
  alpaca_asset_ids_to_register: string[];
  cash_asset_identifiers_to_ensure: string[];
}

/**
 * Partial update: send only changed fields; the API rejects a body without fields. Name and
 * active-state changes never send `credentials`, which rotates both stored values.
 */
export interface AccountUpdateRequest {
  account_name?: string;
  account_is_active?: boolean;
  credentials?: ManagedAlpacaCredentials;
  /** The pending rotation request these new keys complete; requires `credentials`. */
  key_request_uid?: string;
}

/** `POST /v1/accounts/{uid}/actions/remove-keys`: the keys are cleared, nothing else changes. */
export interface AccountKeysRemovedResponse {
  account_uid: string;
  keys_removed: boolean;
}

/**
 * `POST /v1/accounts/{uid}/actions/delete/preflight`: what deleting the account deletes, and
 * what refuses it. A blocker never names another account (connector ADR 0019).
 */
export interface AccountDeletePreflightResponse {
  account_uid: string;
  allowed: boolean;
  blockers: string[];
  warnings: string[];
  portfolio_count: number;
  signal_definition_count: number;
  bars_feed_count: number;
  /** Portfolios that already ended, whose retired Portfolios the delete also deletes. */
  ended_portfolio_count: number;
}

/** `DELETE /v1/accounts/{uid}?confirm=DELETE <uid>`: the account and all it owns are gone. */
export interface AccountDeleteResponse {
  account_uid: string;
  deleted: boolean;
  ended_portfolio_count: number;
  deleted_portfolio_uids: string[];
  /** Retired Portfolios another account's history names; they stay retired. */
  kept_portfolio_uids: string[];
  deleted_signal_uids: string[];
  kept_signal_uids: string[];
}

export interface AssetRegistrationRequest {
  account_uid: string;
  symbols: string[];
  timeout: number;
}

export interface AssetRegistrationPlanResponse {
  request: AssetRegistrationRequest;
  plan_summary: Record<string, unknown>;
  resolution_summary: Record<string, unknown>;
  can_register: boolean;
  missing_symbols_from_alpaca: string[];
  missing_symbols_to_register: string[];
  openfigi_unmatched_symbols: string[];
  warnings_by_symbol: Record<string, string>;
}

export interface AssetRegistrationExecuteResponse {
  request: AssetRegistrationRequest;
  plan_summary: Record<string, unknown>;
  resolution_summary: Record<string, unknown>;
  assets_by_symbol: Record<string, string>;
  existing_asset_uids_by_symbol: Record<string, string>;
  created_asset_uids_by_symbol: Record<string, string>;
  not_registered_missing_alpaca_symbols: string[];
  openfigi_unmatched_symbols: string[];
  warnings_by_symbol: Record<string, string>;
}

export type AssetRegistrationOperationStatus = "queued" | "running" | "succeeded" | "failed";
export type AssetRegistrationStepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export interface AssetRegistrationStepResponse {
  key: string;
  label: string;
  status: AssetRegistrationStepStatus;
  message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface AssetRegistrationOperationError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface AssetRegistrationOperationResponse {
  operation_uid: string;
  action: "plan" | "execute";
  status: AssetRegistrationOperationStatus;
  current_step: string | null;
  steps: AssetRegistrationStepResponse[];
  request: AssetRegistrationRequest;
  result: AssetRegistrationPlanResponse | AssetRegistrationExecuteResponse | null;
  error: AssetRegistrationOperationError | null;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  poll_after_ms: number;
}

export interface AssetRegistrationOperationStartRequest {
  action: "plan" | "execute";
  request: AssetRegistrationRequest;
}

export interface ResourcePageInfo {
  pageIndex: number;
  pageSize: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ResourceCollection<T> {
  items: T[];
  pageInfo: ResourcePageInfo;
}

/**
 * Where a bars configuration takes its assets. A feed of an account prices explicit registered
 * Asset UIDs or the account's latest holdings; a portfolio's own configuration (`portfolios`)
 * prices every asset its portfolio's signal has published (connector ADR 0028).
 */
export type BarConfigurationAssetSource = "assets" | "account_holdings" | "portfolios";
/** The sources a bars feed can be created with; a portfolio's own comes with its portfolio. */
export type BarFeedAssetSource = Exclude<BarConfigurationAssetSource, "portfolios">;

/**
 * A bars configuration has exactly one parent: an account (a feed, `account_uid`) or a portfolio
 * (its own, `portfolio_configuration_uid`), and is deleted with it.
 */
export interface BarConfiguration {
  uid: string;
  name: string;
  description: string | null;
  enabled: boolean;
  /** Whether the daily bars update includes it; an unscheduled one still runs on demand. */
  scheduled: boolean;
  /** The account a feed belongs to; null for a portfolio's own. */
  account_uid: string | null;
  /** The portfolio a portfolio's own configuration belongs to; null for a feed. */
  portfolio_configuration_uid: string | null;
  asset_source: BarConfigurationAssetSource;
  asset_uids: string[];
  frequency_id: string;
  feed: string;
  adjustment: string;
  created_at: string;
  updated_at: string;
}

/** Create body of a bars feed, also sent whole as a feed's edit PATCH; the API rejects any other field. */
export interface BarFeedWriteRequest {
  name: string;
  description: string | null;
  enabled: boolean;
  scheduled: boolean;
  account_uid: string;
  asset_source: BarFeedAssetSource;
  asset_uids: string[];
  frequency_id: string;
  feed: string;
  adjustment: string;
}

/** Edit PATCH of a `portfolios` feed: it keeps its source, so the body carries none. */
export type PortfoliosFeedUpdateRequest = Omit<BarFeedWriteRequest, "asset_source" | "asset_uids">;

/** Edit PATCH of a portfolio's own configuration: its account and asset source are its portfolio's. */
export interface PortfolioBarsUpdateRequest {
  name: string;
  description: string | null;
  enabled: boolean;
  scheduled: boolean;
  frequency_id: string;
  feed: string;
  adjustment: string;
}

export type JobScheduleType = "interval" | "crontab";
export type JobSchedulePeriod = "seconds" | "minutes" | "hours" | "days";

/**
 * The Job that runs every configuration of one kind. alpaca-connectors declares it in its API
 * workflow file (connector ADR 0013), so its schedule and compute are read-only here. The API
 * reports it as `null` until a push has created it on the branch.
 */
export interface ConfigurationJob {
  uid: string;
  schedule_type: JobScheduleType | null;
  schedule_every: number | null;
  schedule_period: JobSchedulePeriod | null;
  schedule_expression: string | null;
  schedule_timezone: string | null;
  schedule_timezone_explicit: boolean | null;
  schedule_start_time: string | null;
  cpu_request: string | null;
  memory_request: string | null;
  max_runtime_seconds: number | null;
  spot: boolean;
  image_status: string | null;
  automatic_deployment: boolean;
}

/** The shared Job's schedule as one read-only line. */
export function formatSharedJobSchedule(job: ConfigurationJob | null): string {
  if (!job) return "Job not deployed on this branch yet";
  if (job.schedule_type === "crontab") {
    const expression = job.schedule_expression ?? "Invalid crontab";
    const timezone = job.schedule_timezone ?? "UTC";
    const source = job.schedule_timezone_explicit === false ? " (backend default)" : "";
    return `${expression} · ${timezone}${source}`;
  }
  if (job.schedule_type === "interval") return `Every ${job.schedule_every} ${job.schedule_period}`;
  return "No schedule";
}

/** The shared portfolio Job's answer to `POST .../actions/run`: the JobRun it started. */
export interface PortfolioJobRunAccepted {
  configuration_uid: string;
  job_uid: string;
  job_run_uid: string;
  status: string;
  status_url: string;
  poll_after_ms: number;
}

/**
 * The connector's only rebalance strategy (connector ADR 0009): at each selected persisted
 * calendar event it executes the portfolio's latest weights given at or before that event.
 */
export type PortfolioRebalanceStrategy = "calendar_event_signal";
export type PortfolioRebalanceEvent = "market_open" | "market_close";
export type PortfolioRebalanceCadence = "every_session" | "weekly";

/**
 * Alpaca trades US equities, so new rebalance configurations use the calendar and session the
 * connector documents and defaults to: the persisted NYSE calendar's regular session.
 */
export const US_EQUITY_REBALANCE_CALENDAR = {
  calendar_identifier: "NYSE",
  session_label: "regular",
} as const;

/** The calendar-event fields every rebalance configuration stores and the API round-trips. */
export interface PortfolioRebalanceCalendarEvent {
  calendar_identifier: string;
  session_label: string;
  rebalance_event: PortfolioRebalanceEvent;
  /** Signed offset from the persisted session event; negative runs before it. */
  event_offset_seconds: number;
  rebalance_cadence: PortfolioRebalanceCadence;
  /** Calendar-local weekday for weekly cadence; Monday is 0. */
  rebalance_weekday: number;
}

export interface PortfolioRebalanceConfiguration extends PortfolioRebalanceCalendarEvent {
  uid: string;
  name: string;
  description: string | null;
  strategy: PortfolioRebalanceStrategy;
  created_at: string;
  updated_at: string;
}

/** Create body, also sent whole as the edit PATCH; the API rejects any other field. */
export interface PortfolioRebalanceConfigurationWriteRequest extends PortfolioRebalanceCalendarEvent {
  name: string;
  description: string | null;
  strategy: PortfolioRebalanceStrategy;
}

/**
 * A portfolio built from weights an application provides (connector ADR 0024). It belongs to one
 * account and follows one of that account's signal definitions (connector ADR 0028). Only its
 * owner, the account's owner, may change, pause, or delete it; the API answers anyone else 403.
 */
export interface PortfolioConfiguration {
  uid: string;
  name: string;
  description: string | null;
  /** The account the portfolio belongs to; null for a portfolio not yet adopted. */
  account_uid: string | null;
  /** The account's signal definition the portfolio follows; null only before adoption. */
  signal_definition_uid: string | null;
  /**
   * False for a portfolio created before accounts owned portfolios whose owner does not own its
   * bars' account; it works as before, on its own signal and the bars feed it names.
   */
  adopted: boolean;
  /** The Main Sequence signal whose weights it follows. */
  signal_uid: string;
  /** Its own bars configuration, or the feed a portfolio not yet adopted named. */
  bars_configuration_uid: string | null;
  rebalance_configuration_uid: string;
  rebalance_strategy: PortfolioRebalanceStrategy;
  portfolio_uid: string | null;
  /** Whether the shared portfolio Job's daily scheduled run includes this configuration. */
  scheduled: boolean;
  job_uid: string | null;
  upsample_frequency_id: "1d";
  intraday_bar_interpolation_rule: "ffill";
  valuation_column: string;
  /** Maximum age of a price selected at a real valuation timestamp; never extends timestamps. */
  valuation_maximum_staleness_seconds: number;
  fail_on_missing_prices: boolean;
  commission_fee: number;
  job: ConfigurationJob | null;
  latest_run_status: string | null;
  latest_run_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * `DELETE /v1/portfolio-configurations/{uid}`: the Portfolio is retired, the configuration and its
 * own bars configuration deleted, and the signal definition it followed deleted once no other
 * portfolio follows it (connector issue #38). `failed`: the portfolio is deleted but the
 * definition's own delete did not complete. Both are null for a portfolio not yet adopted.
 */
export interface PortfolioDeleteResponse {
  configuration_uid: string;
  deleted: boolean;
  portfolio: { uid: string | null; unique_identifier: string; state: "retired" | "absent"; retired_at: string | null };
  signal_definition?: { uid: string; state: "deleted" | "followed" | "failed" } | null;
  signal?: { uid: string; state: "deleted" | "kept" } | null;
}

export interface PortfolioLinkedBars {
  name: string;
  description: string | null;
  enabled: boolean;
  /** Whether the daily bars update includes the portfolio's own bars configuration. */
  scheduled: boolean;
  account_name: string;
  account_environment: "paper" | "live";
  asset_source: BarConfigurationAssetSource;
  asset_source_name: string;
  asset_count: number | null;
  frequency_id: string;
  feed: string;
  adjustment: string;
}

export interface PortfolioLinkedRebalance extends PortfolioRebalanceCalendarEvent {
  name: string;
  description: string | null;
  strategy: PortfolioRebalanceStrategy;
}

export interface PortfolioValueObservation {
  time_index: string;
  close: number | null;
  period_return: number | null;
  calculated_close: number | null;
  close_time: string | null;
  cumulative_return: number | null;
  drawdown: number | null;
}

export interface PortfolioPerformance {
  methodology: "empyrical-reloaded";
  frequency: "daily";
  annualization_factor: number;
  risk_free_rate: number;
  observation_count: number;
  return_observation_count: number;
  period_start: string | null;
  period_end: string | null;
  total_return: number | null;
  annualized_return: number | null;
  annualized_volatility: number | null;
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  max_drawdown: number | null;
  calmar_ratio: number | null;
  best_period_return: number | null;
  worst_period_return: number | null;
  positive_period_ratio: number | null;
}

export interface CanonicalPortfolioDetail {
  materialized: boolean;
  description: string | null;
  calendar_name: string | null;
  calendar_type: string | null;
  calendar_timezone: string | null;
  calendar_valid_from: string | null;
  calendar_valid_to: string | null;
  backtest_price_column: string | null;
  observation_count: number;
  total_observation_count: number;
  history_window_truncated: boolean;
  latest_observation_at: string | null;
  latest_close: number | null;
  latest_period_return: number | null;
  performance: PortfolioPerformance;
  observations: PortfolioValueObservation[];
}

/** The weights the application has given the portfolio's signal so far. */
export interface PortfolioProvidedWeights {
  signal_uid: string;
  first_observation_at: string | null;
  last_observation_at: string | null;
  asset_count: number;
}

export interface PortfolioConfigurationDetail extends PortfolioConfiguration {
  provided_weights: PortfolioProvidedWeights | null;
  linked_bars: PortfolioLinkedBars;
  linked_rebalance: PortfolioLinkedRebalance;
  canonical_portfolio: CanonicalPortfolioDetail;
}

/**
 * The one kind of signal this connector makes (connector ADR 0028): it belongs to one account, its
 * key is the application's own, and only that account's portfolios follow it. The application
 * creates it and publishes its weights; the site renames, inspects, and deletes it.
 */
export interface SignalDefinition {
  uid: string;
  account_uid: string;
  key: string;
  name: string;
  description: string | null;
  /** UID of the Main Sequence signal the weights publish to. */
  signal_uid: string;
  /** The account's portfolios that follow it; the API refuses to delete it while any does. */
  portfolio_count: number;
  created_at: string;
  updated_at: string;
}

/** Partial update: send only changed fields; the API rejects a body without fields. */
export interface SignalDefinitionUpdateRequest {
  name?: string;
  description?: string | null;
}

/**
 * `DELETE /v1/signal-definitions/{uid}`: refused with `409 signal_followed` while a portfolio
 * follows it. The signal's weights are `deleted`, or `kept` while a retired portfolio follows it.
 */
export interface SignalDefinitionDeleteResponse {
  uid: string;
  deleted: boolean;
  signal: { uid: string; state: "deleted" | "kept" };
}

export interface SignalObservationAsset {
  asset_identifier: string;
  symbol: string | null;
  name: string | null;
  /** One weight per entry of `time_indexes`; null where the asset was not in that observation. */
  weights: (number | null)[];
}

/** A signal's latest observations, transposed: one row per asset, oldest observation first. */
export interface SignalObservations {
  configuration_uid: string | null;
  signal_definition_uid: string | null;
  signal_uid: string;
  observation_count: number;
  asset_count: number;
  time_indexes: string[];
  assets: SignalObservationAsset[];
}

export interface ApiTransport {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export class ApiResponseError extends Error {
  readonly status: number;
  /** Stable error code from a `{"detail": {"code", "message"}}` body, when present. */
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "ApiResponseError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readErrorDetail(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.detail === "string") return payload.detail;
  if (isRecord(payload.detail) && typeof payload.detail.message === "string") {
    return payload.detail.message;
  }
  if (!Array.isArray(payload.detail)) return null;

  const messages = payload.detail
    .map((entry) => {
      if (!isRecord(entry) || typeof entry.msg !== "string") return null;
      return entry.msg;
    })
    .filter((message): message is string => message !== null);
  return messages.length > 0 ? messages.join("; ") : null;
}

function readErrorCode(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.detail)) return null;
  return typeof payload.detail.code === "string" ? payload.detail.code : null;
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      throw new ApiResponseError(response.status, "The API returned malformed JSON.");
    }
  }

  if (!response.ok) {
    throw new ApiResponseError(
      response.status,
      readErrorDetail(payload) ?? `The API request failed with status ${response.status}.`,
      readErrorCode(payload),
    );
  }
  return payload as T;
}

export function createApiClient(transport: ApiTransport) {
  return {
    get<T>(path: string, signal?: AbortSignal) {
      return transport.request<T>(path, { method: "GET", signal });
    },
    post<T>(path: string, body: unknown, signal?: AbortSignal) {
      return transport.request<T>(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    },
    patch<T>(path: string, body: unknown, signal?: AbortSignal) {
      return transport.request<T>(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    },
    delete<T>(path: string, signal?: AbortSignal) {
      return transport.request<T>(path, { method: "DELETE", signal });
    },
  };
}

export async function loadProjectConfiguration(
  transport: ApiTransport,
  signal?: AbortSignal,
): Promise<ProjectConfigurationResponse> {
  const api = createApiClient(transport);
  const configuration = await api.get<ProjectConfigurationResponse>(API_ENDPOINTS.configuration, signal);

  // The Bars form's profiles are the one field the site needs; the API's other fields come and go.
  if (!Array.isArray(configuration.migrated_market_data_profiles)) {
    throw new Error("The API returned an invalid project configuration.");
  }

  return configuration;
}

export function normalizeSymbols(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}
