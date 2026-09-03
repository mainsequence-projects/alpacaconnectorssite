export const API_ENDPOINTS = {
  configuration: "/v1/project-state/configuration",
  assetRegistrationOperations: "/v1/assets/registration/operations",
  universeSources: "/v1/universe-sources",
  universeSync: "/v1/universe-sources/actions/sync",
  universes: "/v1/universes",
  universeDiscovery: "/v1/universes/discovery",
  accounts: "/v1/accounts",
  accountDiscovery: "/v1/accounts/discovery",
  accountSecretReferences: "/v1/accounts/secret-references",
  barConfigurations: "/v1/market-data/bar-configurations",
  barConfigurationDiscovery: "/v1/market-data/bar-configurations/discovery",
} as const;

export function assetRegistrationOperationPath(operationUid: string): string {
  return `${API_ENDPOINTS.assetRegistrationOperations}/${encodeURIComponent(operationUid)}`;
}

export function universeSourcePreviewPath(sourceUid: string): string {
  return `${API_ENDPOINTS.universeSources}/${encodeURIComponent(sourceUid)}/actions/preview`;
}

export interface ProjectConfigurationResponse {
  supported_component_providers: string[];
  migrated_market_data_profiles: string[];
  universe_sources_are_user_managed: boolean;
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

export interface AccountRegistrationRequest {
  account_name: string;
  environment: "paper" | "live";
  api_key_secret_name: string;
  secret_key_secret_name: string;
  capture_initial_holdings: boolean;
  register_missing_assets: boolean;
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
  symbols?: string[];
  seed_tickers?: string[];
  component_provider?: string;
  include_non_tradable: boolean;
  timeout: number;
}

export interface AssetRegistrationPlanResponse {
  request: AssetRegistrationRequest;
  plan_summary: Record<string, unknown>;
  resolution_summary: Record<string, unknown>;
  can_register: boolean;
  unresolved_symbols: string[];
  missing_symbols_from_alpaca: string[];
  missing_symbols_to_register: string[];
  warnings_by_symbol: Record<string, string>;
}

export interface AssetRegistrationExecuteResponse {
  request: AssetRegistrationRequest;
  plan_summary: Record<string, unknown>;
  resolution_summary: Record<string, unknown>;
  assets_by_symbol: Record<string, string>;
  existing_asset_uids_by_symbol: Record<string, string>;
  created_asset_uids_by_symbol: Record<string, string>;
  unresolved_symbols: string[];
  not_registered_missing_figi_symbols: string[];
  not_registered_missing_alpaca_symbols: string[];
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

export interface UniverseSyncResult {
  source_uid: string;
  unique_identifier: string;
  display_name: string;
  asset_uids: string[];
  asset_count: number;
}

export interface UniverseSourceSyncResponse {
  results: UniverseSyncResult[];
}

export interface MaterializedUniverse {
  uid: string;
  unique_identifier: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
  source_uid: string | null;
  asset_uids: string[];
  asset_identifiers: string[];
  asset_count: number;
}

export interface MaterializedUniverseCreateRequest {
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
