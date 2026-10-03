import {
  ApplicationCard,
  ApplicationPage,
  ApplicationPageHeader,
  ApplicationPageStack,
} from "@dev-mainsequence/command-center-sdk/layout";
import {
  createHttpResourceAdapter,
  defineResourceApplication,
  type ResourceHttpClient,
  type ResourceHttpRequest,
} from "@dev-mainsequence/command-center-sdk/resource";
import {
  EntitySummary,
  ResourceActionConfirmationDialog,
  ResourceDetailShell,
  ResourceIconLabelCell,
  ResourceListPage,
  ResourceStatusCell,
  type ResourceRowAction,
} from "@dev-mainsequence/command-center-sdk/views";
import { Landmark, ShieldCheck, WalletCards } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import {
  API_ENDPOINTS,
  ApiResponseError,
  createApiClient,
  type Account,
  type AccountDeleteResponse,
  type AccountHolding,
  type AccountRegistrationPreflightResponse,
  type AccountRegistrationRequest,
  type AccountUpdateRequest,
  type ApiTransport,
  type ManagedAlpacaCredentials,
  type ResourceCollection,
} from "./api";
import { RequestErrorDialog, RequestProgressDialog } from "./requestFeedback";

type MutationState =
  | { state: "idle" }
  | { state: "loading"; label: string }
  | { state: "error"; message: string }
  | { state: "success"; message: string; details?: string[]; warnings?: string[] };

function formatError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "Request cancelled.";
  return error instanceof Error ? error.message : "The request failed unexpectedly.";
}

function withQuery(path: string, query?: Readonly<Record<string, unknown>>): string {
  const parameters = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      parameters.set(key, String(value));
    }
  });
  const suffix = parameters.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function createResourceHttpClient(transport: ApiTransport): ResourceHttpClient {
  return {
    request<Response>({ method, path, query, body, signal }: ResourceHttpRequest) {
      return transport.request<Response>(withQuery(path, query), {
        method,
        signal,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
  };
}

function formatSnapshotTime(value: string | null): string {
  if (!value) return "Never";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.valueOf()) ? value : timestamp.toLocaleString();
}

function formatHoldingQuantity(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(value);
}

function formatAccountValue(value: string | number | null, currency: string | null): string {
  if (value === null || value === "") return "—";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  if (!currency) return new Intl.NumberFormat().format(numericValue);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(numericValue);
  } catch {
    return `${new Intl.NumberFormat().format(numericValue)} ${currency}`;
  }
}

function buildAccountResource(transport: ApiTransport) {
  const adapter = createHttpResourceAdapter<Account, string, ResourceCollection<Account>>({
    client: createResourceHttpClient(transport),
    endpoints: {
      list: API_ENDPOINTS.accounts,
      detail: (uid) => `${API_ENDPOINTS.accounts}/${encodeURIComponent(uid)}`,
      discovery: API_ENDPOINTS.accountDiscovery,
    },
    serializeListQuery: ({ pageIndex, pageSize, search, sort, filters }) => ({
      limit: pageSize,
      offset: pageIndex * pageSize,
      search,
      active: filters?.account_is_active,
      is_paper: filters?.is_paper,
      ordering: sort?.[0]
        ? `${sort[0].direction === "descending" ? "-" : ""}${sort[0].key}`
        : "account_name",
    }),
    normalizeList: (response) => ({
      items: response.items,
      pageInfo: response.pageInfo,
    }),
  });

  return defineResourceApplication({
    id: "alpaca-accounts",
    label: "Alpaca Accounts",
    itemLabel: "account",
    description: "Registered brokerage accounts whose credentials are resolved from Main Sequence Secrets.",
    getId: (account: Account) => account.uid,
    adapter,
    columns: [
      {
        id: "account-name",
        header: "Account",
        getValue: (account) => account.account_name,
        sortableKey: "account_name",
        renderCell: (account) => (
          <ResourceIconLabelCell
            icon={<Landmark size={17} />}
            label={account.account_name}
            meta={account.unique_identifier}
          />
        ),
      },
      {
        id: "unique-identifier",
        header: "Identifier",
        getValue: (account) => account.unique_identifier,
        sortableKey: "unique_identifier",
      },
      {
        id: "is-paper",
        header: "Environment",
        getValue: (account) => account.is_paper,
        renderCell: (account) => (
          <ResourceStatusCell
            label={account.is_paper ? "Paper" : "Live"}
            tone={account.is_paper ? "neutral" : "warning"}
          />
        ),
      },
      {
        id: "account-is-active",
        header: "Status",
        getValue: (account) => account.account_is_active,
        renderCell: (account) => (
          <ResourceStatusCell
            label={account.account_is_active ? "Active" : "Inactive"}
            tone={account.account_is_active ? "success" : "neutral"}
          />
        ),
      },
      {
        id: "snapshot-time",
        header: "Last Refresh",
        getValue: (account) => account.snapshot_time,
        renderCell: (account) => formatSnapshotTime(account.snapshot_time),
      },
    ],
  });
}

function buildAccountHoldingsResource(transport: ApiTransport, accountUid: string) {
  const holdingsPath = `${API_ENDPOINTS.accounts}/${encodeURIComponent(accountUid)}/holdings`;
  const latestHoldingsPath = `${holdingsPath}/latest`;
  const adapter = createHttpResourceAdapter<AccountHolding, string, ResourceCollection<AccountHolding>>({
    client: createResourceHttpClient(transport),
    endpoints: {
      list: latestHoldingsPath,
      discovery: `${latestHoldingsPath}/discovery`,
    },
    serializeListQuery: ({ pageIndex, pageSize, sort }) => ({
      limit: pageSize,
      offset: pageIndex * pageSize,
      ordering: sort?.[0]
        ? `${sort[0].direction === "descending" ? "-" : ""}${sort[0].key}`
        : "asset_identifier",
    }),
    normalizeList: (response) => ({
      items: response.items,
      pageInfo: response.pageInfo,
    }),
  });

  return defineResourceApplication({
    id: "alpaca-account-latest-holdings",
    label: "Latest holdings",
    itemLabel: "holding",
    description: "Positions from this account's newest immutable holdings snapshot.",
    getId: (holding: AccountHolding) => JSON.stringify([
      holding.time_index,
      holding.account_uid,
      holding.asset_identifier,
    ]),
    adapter,
    columns: [
      {
        id: "time-index",
        header: "Snapshot time",
        getValue: (holding) => holding.time_index,
        sortableKey: "time_index",
        renderCell: (holding) => formatSnapshotTime(holding.time_index),
      },
      {
        id: "asset-identifier",
        header: "Asset",
        getValue: (holding) => holding.asset_identifier,
        sortableKey: "asset_identifier",
        renderCell: (holding) => (
          <ResourceIconLabelCell
            icon={<WalletCards size={17} />}
            label={holding.extra_details?.symbol || holding.asset_identifier}
            meta={holding.extra_details?.symbol ? holding.asset_identifier : undefined}
          />
        ),
      },
      {
        id: "quantity",
        header: "Quantity",
        getValue: (holding) => holding.quantity,
        renderCell: (holding) => formatHoldingQuantity(holding.quantity),
      },
      {
        id: "direction",
        header: "Side",
        getValue: (holding) => holding.direction,
        renderCell: (holding) => (
          <ResourceStatusCell
            label={holding.direction === -1 ? "Short" : "Long"}
            tone={holding.direction === -1 ? "warning" : "success"}
          />
        ),
      },
      {
        id: "holdings-set-uid",
        header: "Snapshot UID",
        getValue: (holding) => holding.holdings_set_uid,
      },
    ],
  });
}

function AccountList({
  transport,
  refreshKey,
  formOpen,
  onRegister,
  onEdit,
  onDelete,
  onActivate,
}: {
  transport: ApiTransport;
  refreshKey: number;
  formOpen: boolean;
  onRegister: () => void;
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
  onActivate: (account: Account) => void;
}) {
  const definition = useMemo(() => buildAccountResource(transport), [transport]);
  const primaryActions = useMemo(() => [{
    id: "register-account",
    label: "Register account",
    tone: "primary" as const,
    disabled: formOpen,
    onSelect: onRegister,
  }], [formOpen, onRegister]);
  const rowActions = useMemo<readonly ResourceRowAction<Account>[]>(() => [
    { id: "edit-account", label: "Edit", onSelect: onEdit },
    { id: "delete-account", label: "Delete", tone: "danger", onSelect: onDelete },
  ], [onDelete, onEdit]);

  return (
    <ResourceListPage
      definition={definition}
      embedded
      pageSize={25}
      primaryActions={primaryActions}
      onRowActivate={onActivate}
      refreshable
      refreshKey={refreshKey}
      rowActions={rowActions}
      searchPlaceholder="Search Alpaca accounts"
    />
  );
}

function AccountHoldingsDetail({
  account,
  transport,
  onBack,
}: {
  account: Account;
  transport: ApiTransport;
  onBack: () => void;
}) {
  const holdingsDefinition = useMemo(
    () => buildAccountHoldingsResource(transport, account.uid),
    [account.uid, transport],
  );

  return (
    <ResourceDetailShell<Account>
      embedded
      breadcrumbs={[
        { id: "accounts", label: "Accounts", onSelect: onBack },
        { id: account.uid, label: account.account_name },
      ]}
      headerActions={(
        <button className="button button--secondary" type="button" onClick={onBack}>
          Back to accounts
        </button>
      )}
      summary={(
        <EntitySummary
          summary={{
            entity: {
              id: account.uid,
              type: "Alpaca account",
              title: account.account_name,
            },
            badges: [
              {
                key: "environment",
                label: account.is_paper ? "Paper" : "Live",
                tone: account.is_paper ? "default" : "warning",
              },
              {
                key: "status",
                label: account.account_is_active ? "Active" : "Inactive",
                tone: account.account_is_active ? "success" : "default",
              },
            ],
            inline_fields: [
              { key: "identifier", label: "Identifier", value: account.unique_identifier },
              { key: "last-refresh", label: "Last refresh", value: formatSnapshotTime(account.snapshot_time) },
            ],
            // Secret names and timestamps only; credential values are never returned by the API.
            highlight_fields: [
              {
                key: "credential-source",
                label: "Credentials",
                value: credentialSourceLabel(account.credential_source),
              },
              { key: "api-key-secret", label: "API key Secret", value: account.api_key_secret_name },
              { key: "secret-key-secret", label: "Secret key Secret", value: account.secret_key_secret_name },
              {
                key: "credentials-updated",
                label: "Credentials updated",
                value: account.credentials_updated_at
                  ? formatSnapshotTime(account.credentials_updated_at)
                  : "Not recorded",
              },
            ],
            stats: [
              {
                key: "equity",
                label: "Equity",
                value: account.equity,
                display: formatAccountValue(account.equity, account.currency),
              },
              {
                key: "cash",
                label: "Cash",
                value: account.cash,
                display: formatAccountValue(account.cash, account.currency),
              },
            ],
          }}
        />
      )}
    >
      <ResourceListPage
        definition={holdingsDefinition}
        embedded
        emptyContent="This account has no stored holdings snapshot."
        pageSize={25}
        refreshable
        searchable={false}
      />
    </ResourceDetailShell>
  );
}

function credentialSourceLabel(source: Account["credential_source"]): string {
  return source === "managed" ? "Stored by this application" : "External Main Sequence Secrets";
}

// Client-side checks only; the API validates the values against Alpaca before storing them.
function credentialInputError(apiKey: string, secretKey: string, rotating: boolean): string | null {
  const apiKeyValue = apiKey.trim();
  const secretKeyValue = secretKey.trim();
  if (!apiKeyValue || !secretKeyValue) {
    return rotating
      ? "Enter both the new API key and the new secret key, or leave both empty to keep the current credentials."
      : "Enter both the Alpaca API key and the secret key.";
  }
  if (apiKeyValue === secretKeyValue) return "The API key and the secret key must be different values.";
  return null;
}

function managedCredentials(apiKey: string, secretKey: string): ManagedAlpacaCredentials {
  return { source: "managed", api_key: apiKey.trim(), secret_key: secretKey.trim() };
}

// PATCH only what changed. Name and active-state changes never carry `credentials`, so they work
// even when the stored keys no longer authenticate.
function accountUpdateRequest(
  account: Account,
  values: { account_name: string; account_is_active: boolean },
): AccountUpdateRequest {
  const request: AccountUpdateRequest = {};
  if (values.account_name !== account.account_name) request.account_name = values.account_name;
  if (values.account_is_active !== account.account_is_active) {
    request.account_is_active = values.account_is_active;
  }
  return request;
}

function AlpacaCredentialFields({
  apiKey,
  apiKeyLabel,
  disabled,
  secretKey,
  secretKeyLabel,
  onApiKeyChange,
  onSecretKeyChange,
}: {
  apiKey: string;
  apiKeyLabel: string;
  disabled: boolean;
  secretKey: string;
  secretKeyLabel: string;
  onApiKeyChange: (value: string) => void;
  onSecretKeyChange: (value: string) => void;
}) {
  return (
    <>
      <label className="field">{apiKeyLabel}
        <input
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          disabled={disabled}
        />
      </label>
      <label className="field">{secretKeyLabel}
        <input
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={secretKey}
          onChange={(event) => onSecretKeyChange(event.target.value)}
          disabled={disabled}
        />
      </label>
    </>
  );
}

function ReviewValueList({ label, values }: { label: string; values: readonly string[] }) {
  return (
    <div className="result-group">
      <h4>{label}</h4>
      {values.length ? (
        <div className="tag-list">
          {values.map((value) => <span className="tag" key={value}>{value}</span>)}
        </div>
      ) : (
        <p className="form-note">None.</p>
      )}
    </div>
  );
}

function AccountRegistrationReview({ plan }: { plan: AccountRegistrationPreflightResponse }) {
  const blocked = plan.unresolved_symbols.length > 0;
  return (
    <ApplicationCard
      surface="nested"
      aria-label="Registration review"
      header={(
        <div className="card-title-row">
          <h3>Registration review</h3>
          <span className={`status-pill status-pill--${blocked ? "warning" : "success"}`}>
            {blocked ? "Blocked" : "Ready"}
          </span>
        </div>
      )}
    >
      <dl className="summary-list">
        <div>
          <dt>Account identifier</dt>
          <dd>{plan.account_unique_identifier}</dd>
        </div>
        <div>
          <dt>Account number</dt>
          <dd>{plan.account_number || "—"}</dd>
        </div>
        <div>
          <dt>Alpaca status</dt>
          <dd>{plan.status || "—"}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{plan.is_paper ? "Paper" : "Live"}</dd>
        </div>
        <div>
          <dt>Equity</dt>
          <dd>{formatAccountValue(plan.equity, null)}</dd>
        </div>
        <div>
          <dt>Cash</dt>
          <dd>{formatAccountValue(plan.cash, null)}</dd>
        </div>
        <div>
          <dt>Holdings rows to write</dt>
          <dd>{plan.would_write_holdings}</dd>
        </div>
      </dl>
      <ReviewValueList label="Unresolved symbols" values={plan.unresolved_symbols} />
      <ReviewValueList label="Alpaca assets to register" values={plan.alpaca_asset_ids_to_register} />
      <ReviewValueList label="Cash assets to ensure" values={plan.cash_asset_identifiers_to_ensure} />
      <div className="result-group">
        <h4>Credential Secrets to store</h4>
        {plan.secret_writes.length ? (
          <dl className="summary-list summary-list--single-column">
            {plan.secret_writes.map((write) => (
              <div key={write.name}>
                <dt>{write.action === "create" ? "Create" : "Update"}</dt>
                <dd>{write.name}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="form-note">None.</p>
        )}
        <p className="form-note">
          The review writes nothing. The keys are stored in these Main Sequence Secrets only when
          the account is registered.
        </p>
      </div>
      {blocked ? (
        <p className="form-error" role="alert">
          Registration is blocked because these holdings do not resolve to an Alpaca asset identity.
        </p>
      ) : null}
    </ApplicationCard>
  );
}

export function AccountsPage({ transport }: { transport: ApiTransport }) {
  const api = useMemo(() => createApiClient(transport), [transport]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [accountName, setAccountName] = useState("");
  const [environment, setEnvironment] = useState<"paper" | "live">("paper");
  const [accountIsActive, setAccountIsActive] = useState(true);
  // Credential values live only in this component's state: they are cleared on success and
  // cancel, discarded with the component on unmount, and never written to a URL or storage.
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  // Bumped on every input change; a review is valid only for the revision it ran with, so no
  // copy of the credential values is kept to detect changes.
  const [inputRevision, setInputRevision] = useState(0);
  const [preflight, setPreflight] = useState<{
    revision: number;
    plan: AccountRegistrationPreflightResponse;
  } | null>(null);
  const [mutation, setMutation] = useState<MutationState>({ state: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const reviewedPlan = !editing && preflight?.revision === inputRevision ? preflight.plan : null;
  const rotatingCredentials = editing !== null && Boolean(apiKey.trim() || secretKey.trim());
  const credentialError = editing
    ? rotatingCredentials ? credentialInputError(apiKey, secretKey, true) : null
    : credentialInputError(apiKey, secretKey, false);
  const inputError = accountName.trim() ? credentialError : "Enter an account name.";
  const accountChanges = editing
    ? accountUpdateRequest(editing, {
      account_name: accountName.trim(),
      account_is_active: accountIsActive,
    })
    : null;
  const hasAccountChanges = accountChanges !== null
    && (Object.keys(accountChanges).length > 0 || rotatingCredentials);
  const busy = mutation.state === "loading";
  const canSubmit = !busy && inputError === null && (editing === null || hasAccountChanges);
  const canRegister = editing === null
    && canSubmit
    && reviewedPlan !== null
    && reviewedPlan.unresolved_symbols.length === 0;
  const showCredentialError = credentialError !== null
    && (rotatingCredentials || Boolean(apiKey.trim() && secretKey.trim()));

  function resetForm() {
    setEditing(null);
    setAccountName("");
    setEnvironment("paper");
    setAccountIsActive(true);
    setApiKey("");
    setSecretKey("");
    setCredentialsError(null);
    setPreflight(null);
  }

  function beginRegistration() {
    setSelectedAccount(null);
    resetForm();
    setFormOpen(true);
    setMutation({ state: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    resetForm();
    setFormOpen(false);
    setMutation({ state: "idle" });
  }

  function beginEdit(account: Account) {
    setSelectedAccount(null);
    setFormOpen(true);
    setEditing(account);
    setAccountName(account.account_name);
    setEnvironment(account.is_paper ? "paper" : "live");
    setAccountIsActive(account.account_is_active);
    setApiKey("");
    setSecretKey("");
    setCredentialsError(null);
    setPreflight(null);
    setMutation({ state: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // A shown registration review describes the inputs it ran with; any change requires a new one.
  function changeInput(apply: () => void, { credentials = false } = {}) {
    apply();
    setInputRevision((current) => current + 1);
    setPreflight(null);
    if (credentials) setCredentialsError(null);
  }

  function completeFormMutation(action: "Registered" | "Updated") {
    const completedName = accountName.trim();
    resetForm();
    setFormOpen(false);
    setMutation({ state: "success", message: `${action} ${completedName}.` });
    setRefreshKey((current) => current + 1);
  }

  function failRequest(error: unknown) {
    if (error instanceof ApiResponseError && error.code === "alpaca_credentials_rejected") {
      setPreflight(null);
      setCredentialsError(
        `Alpaca rejected these credentials. Check that both keys are correct and belong to a ${environment} trading account.`,
      );
      setMutation({ state: "idle" });
      return;
    }
    setMutation({ state: "error", message: formatError(error) });
  }

  function registrationRequest(): AccountRegistrationRequest {
    return {
      account_name: accountName.trim(),
      environment,
      credentials: managedCredentials(apiKey, secretKey),
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      setMutation({ state: "error", message: inputError ?? "No changes to save." });
      return;
    }

    if (!editing) {
      await reviewRegistration();
      return;
    }

    const request: AccountUpdateRequest = rotatingCredentials
      ? { ...accountChanges, credentials: managedCredentials(apiKey, secretKey) }
      : { ...accountChanges };
    setCredentialsError(null);
    setMutation({
      state: "loading",
      label: rotatingCredentials ? "Validating and rotating credentials" : "Updating account",
    });
    try {
      await api.patch<Account>(
        `${API_ENDPOINTS.accounts}/${encodeURIComponent(editing.uid)}`,
        request,
      );
      completeFormMutation("Updated");
    } catch (error) {
      failRequest(error);
    }
  }

  async function reviewRegistration() {
    const revision = inputRevision;
    setPreflight(null);
    setCredentialsError(null);
    setMutation({ state: "loading", label: "Checking credentials with Alpaca" });
    try {
      const plan = await api.post<AccountRegistrationPreflightResponse>(
        API_ENDPOINTS.accountRegistrationPreflight,
        registrationRequest(),
      );
      setPreflight({ revision, plan });
      setMutation({ state: "idle" });
    } catch (error) {
      failRequest(error);
    }
  }

  async function register() {
    if (!canRegister) return;
    setMutation({ state: "loading", label: "Registering account" });
    try {
      await api.post<Account>(API_ENDPOINTS.accounts, registrationRequest());
      completeFormMutation("Registered");
    } catch (error) {
      failRequest(error);
    }
  }

  function requestDelete(account: Account) {
    setDeleteTarget(account);
    setDeleteConfirmation("");
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteConfirmation !== "DELETE") return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const result = await api.delete<AccountDeleteResponse>(
        `${API_ENDPOINTS.accounts}/${encodeURIComponent(deleteTarget.uid)}`,
      );
      const deletedName = deleteTarget.account_name;
      const deletedSecrets = result.deleted_secrets ?? [];
      if (editing?.uid === deleteTarget.uid) {
        resetForm();
        setFormOpen(false);
      }
      if (selectedAccount?.uid === deleteTarget.uid) setSelectedAccount(null);
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setMutation({
        state: "success",
        message: `Removed ${deletedName}.`,
        details: deletedSecrets.length
          ? [`Deleted stored credential Secrets: ${deletedSecrets.join(", ")}.`]
          : [],
        warnings: result.warnings ?? [],
      });
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setDeleteError(formatError(error));
    } finally {
      setDeletePending(false);
    }
  }

  const deletingManagedAccount = deleteTarget?.credential_source === "managed";

  return (
    <ApplicationPage as="main" maxWidth="full">
      <ApplicationPageStack>
        <ApplicationPageHeader
          eyebrow="Accounts"
          title="Alpaca account registrations"
          description="Register and maintain brokerage accounts with their Alpaca API keys. The API checks the keys with Alpaca and stores them as Main Sequence Secrets."
        />

        {formOpen ? (
          <ApplicationCard header={<h2>{editing ? "Edit account registration" : "Register account"}</h2>}>
            <form className="workflow-form" onSubmit={submit}>
            <div className="form-grid">
              <label className="field">Account name
                <input
                  value={accountName}
                  onChange={(event) => changeInput(() => setAccountName(event.target.value))}
                  placeholder="US equities paper account"
                  disabled={busy}
                />
              </label>
              <label className="field">Environment
                <select
                  value={environment}
                  onChange={(event) => changeInput(
                    () => setEnvironment(event.target.value as "paper" | "live"),
                    { credentials: true },
                  )}
                  disabled={busy || editing !== null}
                >
                  <option value="paper">Paper</option>
                  <option value="live">Live</option>
                </select>
                {editing ? <span>The environment is fixed after registration.</span> : null}
              </label>
              {editing ? null : (
                <AlpacaCredentialFields
                  apiKey={apiKey}
                  apiKeyLabel="API key"
                  disabled={busy}
                  secretKey={secretKey}
                  secretKeyLabel="Secret key"
                  onApiKeyChange={(value) => changeInput(() => setApiKey(value), { credentials: true })}
                  onSecretKeyChange={(value) => changeInput(() => setSecretKey(value), { credentials: true })}
                />
              )}
            </div>

            {editing ? (
              <>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={accountIsActive}
                    onChange={(event) => setAccountIsActive(event.target.checked)}
                    disabled={busy}
                  />
                  Active
                </label>
                <section className="workflow-form-section" aria-labelledby="rotate-credentials-heading">
                  <div className="workflow-form-section__header">
                    <h3 id="rotate-credentials-heading">Rotate credentials</h3>
                    <p>
                      Leave both fields empty to keep the current credentials. New keys must
                      authenticate as the same Alpaca account and replace the stored values.
                      {editing.credential_source === "external"
                        ? " This account uses external Main Sequence Secrets; rotating stores the new keys in Secrets owned by this application and leaves the external Secrets unchanged."
                        : null}
                    </p>
                  </div>
                  <div className="form-grid">
                    <AlpacaCredentialFields
                      apiKey={apiKey}
                      apiKeyLabel="New API key"
                      disabled={busy}
                      secretKey={secretKey}
                      secretKeyLabel="New secret key"
                      onApiKeyChange={(value) => changeInput(() => setApiKey(value), { credentials: true })}
                      onSecretKeyChange={(value) => changeInput(() => setSecretKey(value), { credentials: true })}
                    />
                  </div>
                </section>
              </>
            ) : (
              <p className="form-note" role="note">
                Registration resolves every non-zero holding, registers missing assets from their
                immutable Alpaca UUIDs, and creates the initial holdings snapshot in the same flow.
                OpenFIGI metadata is optional. An identity conflict names the affected asset and
                writes no partial Account or snapshot. Review registration first checks the keys
                with Alpaca in a read-only dry run that writes nothing; changing any field requires
                a new review before the account can be registered.
              </p>
            )}

            {credentialsError ? <p className="form-error" role="alert">{credentialsError}</p> : null}
            {showCredentialError ? <p className="form-error" role="alert">{credentialError}</p> : null}
            {editing && !hasAccountChanges ? (
              <p className="form-note" role="status">No changes to save.</p>
            ) : null}
            {reviewedPlan ? <AccountRegistrationReview plan={reviewedPlan} /> : null}

              <div className="form-actions">
                {editing ? (
                  <button className="button button--primary" type="submit" disabled={!canSubmit}>
                    Save changes
                  </button>
                ) : (
                  <>
                    <button className="button button--secondary" type="submit" disabled={!canSubmit}>
                      Review registration
                    </button>
                    <button
                      className="button button--primary"
                      type="button"
                      disabled={!canRegister}
                      onClick={() => void register()}
                    >
                      Register account
                    </button>
                  </>
                )}
                <button className="button button--secondary" type="button" onClick={closeForm} disabled={busy}>
                  {editing ? "Cancel edit" : "Cancel"}
                </button>
              </div>

            <div className="workflow-guidance">
              <ShieldCheck aria-hidden="true" size={18} />
              <p>
                The API key and secret key are sent to the Alpaca Connectors API over the authenticated connection, checked with Alpaca, and stored as Main Sequence Secrets. They are never saved in this browser, and this application never displays them again.
              </p>
            </div>
            </form>
          </ApplicationCard>
        ) : null}

        {mutation.state === "loading" ? (
          <RequestProgressDialog
            open
            title={mutation.label}
            message="Waiting for the Alpaca Connectors API."
          />
        ) : mutation.state === "error" ? (
          <RequestErrorDialog
            open
            title="Account request failed"
            message={mutation.message}
            onClose={() => setMutation({ state: "idle" })}
          />
        ) : mutation.state === "success" ? (
          <section className="action-result" aria-live="polite">
            <div className="section-heading">
              <h3>{mutation.message}</h3>
              {mutation.warnings?.length ? (
                <span className="status-pill status-pill--warning">Completed with warnings</span>
              ) : (
                <span className="status-pill status-pill--success">Complete</span>
              )}
            </div>
            {mutation.details?.map((detail) => <p key={detail}>{detail}</p>)}
            {mutation.warnings?.length ? (
              <ul className="compact-list">
                {mutation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            ) : null}
          </section>
        ) : null}

        {selectedAccount ? (
          <AccountHoldingsDetail
            account={selectedAccount}
            transport={transport}
            onBack={() => setSelectedAccount(null)}
          />
        ) : (
          <AccountList
            transport={transport}
            refreshKey={refreshKey}
            formOpen={formOpen}
            onRegister={beginRegistration}
            onEdit={beginEdit}
            onDelete={requestDelete}
            onActivate={setSelectedAccount}
          />
        )}
      </ApplicationPageStack>

      <ResourceActionConfirmationDialog
        open={deleteTarget !== null}
        actionLabel="Delete"
        title="Remove account registration"
        selectionLabel={deleteTarget?.account_name ?? "account"}
        description={deletingManagedAccount
          ? "Remove this Alpaca registration, deactivate the account, and delete its stored credentials (the Main Sequence Secrets this application created for its API key and secret key)."
          : "Remove this Alpaca registration and deactivate the account. The external Main Sequence Secrets it references are kept."}
        warning={deletingManagedAccount
          ? "The stored credentials cannot be recovered; registering the account again requires its keys. Historical holdings snapshots are retained. Configurations that reference this account can no longer run."
          : "Historical holdings snapshots are retained. Configurations that reference this account can no longer run."}
        confirmationWord="DELETE"
        confirmationValue={deleteConfirmation}
        onConfirmationValueChange={setDeleteConfirmation}
        confirmButtonLabel="Delete"
        confirmDisabled={deleteConfirmation !== "DELETE" || deletePending}
        pending={deletePending}
        error={deleteError ?? undefined}
        tone="danger"
        onClose={() => {
          if (deletePending) return;
          setDeleteTarget(null);
          setDeleteConfirmation("");
          setDeleteError(null);
        }}
        onConfirm={confirmDelete}
      />
    </ApplicationPage>
  );
}
