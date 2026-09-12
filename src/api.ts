export const API_ENDPOINTS = {
  configuration: "/v1/project-state/configuration",
  assets: "/v1/assets",
  assetDiscovery: "/v1/assets/discovery",
  assetRegistrationOperations: "/v1/assets/registration/operations",
  universeSources: "/v1/universe-sources",
  universes: "/v1/universes",
  universeDiscovery: "/v1/universes/discovery",
  accounts: "/v1/accounts",
  accountDiscovery: "/v1/accounts/discovery",
  accountSecretReferences: "/v1/accounts/secret-references",
  barConfigurations: "/v1/market-data/bar-configurations",
  barConfigurationDiscovery: "/v1/market-data/bar-configurations/discovery",
  signalJobs: "/v1/signal-jobs",
  signalJobDiscovery: "/v1/signal-jobs/discovery",
  portfolioConfigurations: "/v1/portfolio-configurations",
  portfolioConfigurationDiscovery: "/v1/portfolio-configurations/discovery",
  portfolioRebalanceConfigurations: "/v1/portfolio-rebalance-configurations",
  portfolioRebalanceConfigurationDiscovery: "/v1/portfolio-rebalance-configurations/discovery",
} as const;

export function assetRegistrationOperationPath(operationUid: string): string {
  return `${API_ENDPOINTS.assetRegistrationOperations}/${encodeURIComponent(operationUid)}`;
}

export function universeSourcePreviewPath(sourceUid: string): string {
  return `${API_ENDPOINTS.universeSources}/${encodeURIComponent(sourceUid)}/actions/preview`;
}

export function signalObservationsPath(configurationUid: string, limit = 100): string {
  return `${API_ENDPOINTS.signalJobs}/${encodeURIComponent(configurationUid)}/observations?limit=${limit}`;
}

export interface ProjectConfigurationResponse {
  supported_component_providers: string[];
  migrated_market_data_profiles: string[];
  universe_sources_are_user_managed: boolean;
  organization_environment_uid: string | null;
  organization_environment_name: string | null;
  [key: string]: unknown;
}

export interface Account {
  uid: string;
  account_uid: string;
  unique_identifier: string;
  account_name: string;
  account_is_active: boolean;
  is_paper: boolean;
  api_key_secret_name: string;
  secret_key_secret_name: string;
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

export interface AccountRegistrationRequest {
  account_name: string;
  environment: "paper" | "live";
  api_key_secret_name: string;
  secret_key_secret_name: string;
}

export interface AccountUpdateRequest {
  account_name: string;
  api_key_secret_name: string;
  secret_key_secret_name: string;
  account_is_active: boolean;
}

export interface SecretReference {
  name: string;
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

export interface UniverseSourceActionRequest {
  timeout: number;
}

export interface UniverseSource {
  uid: string;
  name: string;
  symbol: string;
  source_url: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
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

export interface UniverseSourcePreviewResponse {
  source: UniverseSource;
  plan_summary: Record<string, unknown>;
  has_blockers: boolean;
}

export interface AssetUniverse {
  uid: string;
  source_uid: string;
  asset_category_uid: string;
  display_name: string;
  symbol: string;
  source_url: string;
  description: string | null;
  is_active: boolean;
  asset_count: number;
  created_at: string;
  updated_at: string;
}

export interface AssetCategorySummary {
  uid: string;
  unique_identifier: string;
  display_name: string;
  description: string | null;
}

export interface AssetUniverseDetail extends AssetUniverse {
  asset_category: AssetCategorySummary;
}

export interface AssetUniverseCreateRequest {
  name: string;
  symbol: string;
  source_url: string;
}

export type BarConfigurationAssetSource = "assets" | "universe" | "account_holdings";

export interface BarConfiguration {
  uid: string;
  name: string;
  description: string | null;
  enabled: boolean;
  account_uid: string;
  asset_source: BarConfigurationAssetSource;
  asset_uids: string[];
  universe_uid: string | null;
  frequency_id: string;
  feed: string;
  adjustment: string;
  created_at: string;
  updated_at: string;
}

export interface BarConfigurationWriteRequest {
  name: string;
  description: string | null;
  enabled: boolean;
  account_uid: string;
  asset_source: BarConfigurationAssetSource;
  asset_uids: string[];
  universe_uid: string | null;
  frequency_id: string;
  feed: string;
  adjustment: string;
}

export type SignalScheduleType = "interval" | "crontab";
export type SignalSchedulePeriod = "seconds" | "minutes" | "hours" | "days";

export interface SignalJobConfiguration {
  uid: string;
  name: string;
  description: string | null;
  signal_uid: string;
  universe_uid: string;
  account_uid: string;
  job_uid: string | null;
  enabled: boolean;
  schedule_type: SignalScheduleType;
  schedule_every: number | null;
  schedule_period: SignalSchedulePeriod | null;
  schedule_expression: string | null;
  schedule_timezone: string | null;
  schedule_start_time: string | null;
  cpu_request: string;
  memory_request: string;
  max_runtime_seconds: number;
  spot: boolean;
  lifecycle_state: "provisioning" | "ready" | "paused" | "error" | "deleting";
  last_error: string | null;
  job_image_status: string | null;
  job_automatic_deployment: boolean | null;
  latest_run_status: string | null;
  latest_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignalJobConfigurationWriteRequest {
  name: string;
  description: string | null;
  universe_uid: string;
  account_uid: string;
  enabled: boolean;
  schedule_type: SignalScheduleType;
  schedule_every: number | null;
  schedule_period: SignalSchedulePeriod | null;
  schedule_expression: string | null;
  schedule_timezone: string | null;
  schedule_start_time: string | null;
  cpu_request: string;
  memory_request: string;
  max_runtime_seconds: number;
  spot: boolean;
}

export interface SignalJobRunAccepted {
  configuration_uid: string;
  job_uid: string;
  job_run_uid: string;
  status: string;
  status_url: string;
  poll_after_ms: number;
}

export interface SignalJobRun {
  uid: string;
  job_uid: string;
  job_name: string;
  status: string;
  execution_start: string | null;
  execution_end: string | null;
  commit_hash: string | null;
  runtime_image_uid: string | null;
  runtime_image_digest: string | null;
  logs_url: string | null;
  failure_message: string | null;
}

export interface SignalObservationAsset {
  asset_identifier: string;
  symbol: string | null;
  name: string | null;
  weights: Array<number | null>;
}

export interface SignalObservations {
  configuration_uid: string;
  signal_uid: string;
  observation_count: number;
  asset_count: number;
  time_indexes: string[];
  assets: SignalObservationAsset[];
}

export type PortfolioRebalanceStrategy = "immediate_signal";

export interface PortfolioRebalanceConfiguration {
  uid: string;
  name: string;
  description: string | null;
  strategy: PortfolioRebalanceStrategy;
  created_at: string;
  updated_at: string;
}

export interface PortfolioJobSettings {
  schedule_type: SignalScheduleType;
  schedule_every: number | null;
  schedule_period: SignalSchedulePeriod | null;
  schedule_expression: string | null;
  schedule_timezone: string | null;
  schedule_start_time: string | null;
  cpu_request: string;
  memory_request: string;
  max_runtime_seconds: number;
  spot: boolean;
}

export interface PortfolioJob {
  uid: string;
  schedule_type: SignalScheduleType | null;
  schedule_every: number | null;
  schedule_period: SignalSchedulePeriod | null;
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

export interface PortfolioConfiguration {
  uid: string;
  name: string;
  description: string | null;
  signal_configuration_uid: string;
  signal_uid: string;
  bars_configuration_uid: string;
  rebalance_configuration_uid: string;
  rebalance_strategy: PortfolioRebalanceStrategy;
  portfolio_uid: string | null;
  job_uid: string | null;
  upsample_frequency_id: "1d";
  intraday_bar_interpolation_rule: "ffill";
  valuation_column: string;
  portfolio_prices_frequency: "1d" | null;
  forward_fill_to_now: boolean;
  fail_on_missing_prices: boolean;
  commission_fee: number;
  job: PortfolioJob | null;
  latest_run_status: string | null;
  latest_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortfolioLinkedSignal {
  name: string;
  description: string | null;
  enabled: boolean;
  universe_name: string;
  universe_symbol: string;
  account_name: string;
  account_environment: "paper" | "live";
}

export interface PortfolioLinkedBars {
  name: string;
  description: string | null;
  enabled: boolean;
  account_name: string;
  account_environment: "paper" | "live";
  asset_source: "assets" | "universe" | "account_holdings";
  asset_source_name: string;
  asset_count: number | null;
  frequency_id: string;
  feed: string;
  adjustment: string;
}

export interface PortfolioLinkedRebalance {
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

export interface PortfolioConfigurationDetail extends PortfolioConfiguration {
  linked_signal: PortfolioLinkedSignal;
  linked_bars: PortfolioLinkedBars;
  linked_rebalance: PortfolioLinkedRebalance;
  canonical_portfolio: CanonicalPortfolioDetail;
}

export interface PortfolioConfigurationWriteRequest {
  name: string;
  description: string | null;
  signal_configuration_uid: string;
  bars_configuration_uid: string;
  rebalance_configuration_uid: string;
  upsample_frequency_id: "1d";
  intraday_bar_interpolation_rule: "ffill";
  valuation_column: string;
  portfolio_prices_frequency: "1d" | null;
  forward_fill_to_now: boolean;
  fail_on_missing_prices: boolean;
  commission_fee: number;
  job: PortfolioJobSettings;
}

export type PortfolioJobRunAccepted = SignalJobRunAccepted;
export type PortfolioJobRun = SignalJobRun;

export interface ApiTransport {
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export class ApiResponseError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiResponseError";
    this.status = status;
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

  if (!Array.isArray(configuration.supported_component_providers)) {
    throw new Error("The API returned an invalid provider-configuration response.");
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
