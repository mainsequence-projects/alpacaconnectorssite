import { ApplicationStatusScreen } from "@dev-mainsequence/command-center-sdk/feedback";
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
  ResourcePicker,
  ResourceStatusCell,
  type ResourcePickerOption,
  type ResourceRowAction,
} from "@dev-mainsequence/command-center-sdk/views";
import { Landmark, ShieldCheck, WalletCards } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  API_ENDPOINTS,
  createApiClient,
  type Account,
  type AccountHolding,
  type AccountRegistrationRequest,
  type AccountUpdateRequest,
  type ApiTransport,
  type ResourceCollection,
  type SecretReference,
} from "./api";

type MutationState =
  | { state: "idle" }
  | { state: "loading"; label: string }
  | { state: "error"; message: string }
  | { state: "success"; message: string };

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
            highlight_fields: [],
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

function secretPickerOptions(
  references: readonly SecretReference[],
  selectedName: string,
): ResourcePickerOption[] {
  const names = new Set(references.map((reference) => reference.name));
  if (selectedName) names.add(selectedName);
  return Array.from(names)
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({
      value: name,
      label: name,
      subtitle: name === selectedName && !references.some((item) => item.name === name)
        ? "Currently configured"
        : undefined,
    }));
}

export function AccountsPage({ transport }: { transport: ApiTransport }) {
  const api = useMemo(() => createApiClient(transport), [transport]);
  const [secretReferences, setSecretReferences] = useState<SecretReference[]>([]);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [secretsError, setSecretsError] = useState<string | null>(null);
  const [secretSearch, setSecretSearch] = useState("");
  const [secretLookupRevision, setSecretLookupRevision] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [accountName, setAccountName] = useState("");
  const [environment, setEnvironment] = useState<"paper" | "live">("paper");
  const [apiKeySecretName, setApiKeySecretName] = useState("");
  const [secretKeySecretName, setSecretKeySecretName] = useState("");
  const [accountIsActive, setAccountIsActive] = useState(true);
  const [mutation, setMutation] = useState<MutationState>({ state: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!formOpen) return;
    const controller = new AbortController();
    const search = secretSearch.trim();
    setSecretsLoading(true);
    setSecretsError(null);
    const timer = window.setTimeout(() => {
      api.get<ResourceCollection<SecretReference>>(
        withQuery(API_ENDPOINTS.accountSecretReferences, {
          limit: 100,
          offset: 0,
          search,
        }),
        controller.signal,
      )
        .then((response) => setSecretReferences(response.items))
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setSecretsError(formatError(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setSecretsLoading(false);
        });
    }, search ? 150 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [api, formOpen, secretLookupRevision, secretSearch]);

  const refreshSecretLookup = () => {
    setSecretLookupRevision((current) => current + 1);
  };

  const apiKeyOptions = useMemo(
    () => secretPickerOptions(secretReferences, apiKeySecretName),
    [apiKeySecretName, secretReferences],
  );
  const secretKeyOptions = useMemo(
    () => secretPickerOptions(secretReferences, secretKeySecretName),
    [secretKeySecretName, secretReferences],
  );
  const busy = mutation.state === "loading";
  const canSubmit = !busy
    && !secretsLoading
    && !secretsError
    && Boolean(accountName.trim())
    && Boolean(apiKeySecretName)
    && Boolean(secretKeySecretName)
    && apiKeySecretName !== secretKeySecretName;

  function resetForm() {
    setEditing(null);
    setAccountName("");
    setEnvironment("paper");
    setApiKeySecretName("");
    setSecretKeySecretName("");
    setAccountIsActive(true);
    setSecretSearch("");
    setSecretsError(null);
  }

  function beginRegistration() {
    setSelectedAccount(null);
    resetForm();
    setSecretsLoading(true);
    setFormOpen(true);
    setMutation({ state: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    resetForm();
    setFormOpen(false);
    setSecretsLoading(false);
    setMutation({ state: "idle" });
  }

  function beginEdit(account: Account) {
    setSelectedAccount(null);
    setSecretSearch("");
    setSecretsLoading(true);
    setSecretLookupRevision((current) => current + 1);
    setFormOpen(true);
    setEditing(account);
    setAccountName(account.account_name);
    setEnvironment(account.is_paper ? "paper" : "live");
    setApiKeySecretName(account.api_key_secret_name);
    setSecretKeySecretName(account.secret_key_secret_name);
    setAccountIsActive(account.account_is_active);
    setMutation({ state: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      setMutation({
        state: "error",
        message: apiKeySecretName === secretKeySecretName
          ? "Choose two different Main Sequence Secrets."
          : "Complete the account name and both Secret references.",
      });
      return;
    }

    setMutation({ state: "loading", label: editing ? "Updating account" : "Registering account" });
    try {
      if (editing) {
        const request: AccountUpdateRequest = {
          account_name: accountName.trim(),
          api_key_secret_name: apiKeySecretName,
          secret_key_secret_name: secretKeySecretName,
          account_is_active: accountIsActive,
        };
        await api.patch<Account>(
          `${API_ENDPOINTS.accounts}/${encodeURIComponent(editing.uid)}`,
          request,
        );
      } else {
        const request: AccountRegistrationRequest = {
          account_name: accountName.trim(),
          environment,
          api_key_secret_name: apiKeySecretName,
          secret_key_secret_name: secretKeySecretName,
        };
        await api.post<Account>(API_ENDPOINTS.accounts, request);
      }

      const completedName = accountName.trim();
      const completedAction = editing ? "Updated" : "Registered";
      resetForm();
      setFormOpen(false);
      setSecretsLoading(false);
      setMutation({ state: "success", message: `${completedAction} ${completedName}.` });
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setMutation({ state: "error", message: formatError(error) });
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
      await api.delete<Record<string, unknown>>(
        `${API_ENDPOINTS.accounts}/${encodeURIComponent(deleteTarget.uid)}`,
      );
      const deletedName = deleteTarget.account_name;
      if (editing?.uid === deleteTarget.uid) {
        resetForm();
        setFormOpen(false);
        setSecretsLoading(false);
      }
      if (selectedAccount?.uid === deleteTarget.uid) setSelectedAccount(null);
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setMutation({ state: "success", message: `Removed ${deletedName}.` });
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setDeleteError(formatError(error));
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <ApplicationPage as="main" maxWidth="content">
      <ApplicationPageStack>
        <ApplicationPageHeader
          eyebrow="Accounts"
          title="Alpaca account registrations"
          description="Register and maintain brokerage accounts by selecting the Main Sequence Secrets that hold their Alpaca credentials."
        />

        {formOpen ? (
          <ApplicationCard header={<h2>{editing ? "Edit account registration" : "Register account"}</h2>}>
            <form className="workflow-form" onSubmit={submit}>
            <div className="form-grid">
              <label className="field">Account name
                <input
                  value={accountName}
                  onChange={(event) => setAccountName(event.target.value)}
                  placeholder="US equities paper account"
                  disabled={busy}
                />
              </label>
              <label className="field">Environment
                <select
                  value={environment}
                  onChange={(event) => setEnvironment(event.target.value as "paper" | "live")}
                  disabled={busy || editing !== null}
                >
                  <option value="paper">Paper</option>
                  <option value="live">Live</option>
                </select>
                {editing ? <span>The environment is fixed after registration.</span> : null}
              </label>
              <div className="field resource-picker-field">
                <label id="api-key-secret-label">API key Secret</label>
                <ResourcePicker
                  ariaLabelledBy="api-key-secret-label"
                  disabled={busy || secretsError !== null}
                  emptyMessage={secretSearch.trim()
                    ? "No visible Main Sequence Secrets match this name."
                    : "No visible Main Sequence Secrets."}
                  fullWidth
                  loading={secretsLoading}
                  mode="single"
                  onOpenChange={(open) => {
                    if (open) refreshSecretLookup();
                  }}
                  onSearchValueChange={setSecretSearch}
                  options={apiKeyOptions}
                  placeholder="Select the Secret containing the API key"
                  searchable
                  searchPlaceholder="Search Secret names"
                  searchValue={secretSearch}
                  value={apiKeySecretName || null}
                  onValueChange={setApiKeySecretName}
                />
              </div>
              <div className="field resource-picker-field">
                <label id="secret-key-secret-label">Secret key Secret</label>
                <ResourcePicker
                  ariaLabelledBy="secret-key-secret-label"
                  disabled={busy || secretsError !== null}
                  emptyMessage={secretSearch.trim()
                    ? "No visible Main Sequence Secrets match this name."
                    : "No visible Main Sequence Secrets."}
                  fullWidth
                  loading={secretsLoading}
                  mode="single"
                  onOpenChange={(open) => {
                    if (open) refreshSecretLookup();
                  }}
                  onSearchValueChange={setSecretSearch}
                  options={secretKeyOptions}
                  placeholder="Select the Secret containing the secret key"
                  searchable
                  searchPlaceholder="Search Secret names"
                  searchValue={secretSearch}
                  value={secretKeySecretName || null}
                  onValueChange={setSecretKeySecretName}
                />
              </div>
            </div>

            {editing ? (
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={accountIsActive}
                  onChange={(event) => setAccountIsActive(event.target.checked)}
                  disabled={busy}
                />
                Active
              </label>
            ) : (
              <p className="form-note" role="note">
                Registration resolves every non-zero holding, registers missing assets from their
                immutable Alpaca UUIDs, and creates the initial holdings snapshot in the same flow.
                OpenFIGI metadata is optional. An identity conflict names the affected asset and
                writes no partial Account or snapshot.
              </p>
            )}

            {secretsError ? (
              <div className="inline-feedback" role="alert">
                <p className="form-error">Secret references could not be loaded: {secretsError}</p>
                <button className="button button--secondary" type="button" onClick={refreshSecretLookup}>
                  Retry Secret lookup
                </button>
              </div>
            ) : null}
            {!secretsLoading && !secretsError && !secretSearch.trim() && secretReferences.length === 0 ? (
              <p className="form-error" role="alert">Create and share the Alpaca credential Secrets in Main Sequence before registering an account.</p>
            ) : null}
            {apiKeySecretName && apiKeySecretName === secretKeySecretName ? (
              <p className="form-error" role="alert">The API key and secret key must reference different Secrets.</p>
            ) : null}

              <div className="form-actions">
                <button className="button button--primary" type="submit" disabled={!canSubmit}>
                  {editing ? "Save changes" : "Register account"}
                </button>
                <button className="button button--secondary" type="button" onClick={closeForm} disabled={busy}>
                  {editing ? "Cancel edit" : "Cancel"}
                </button>
              </div>

            <div className="workflow-guidance">
              <ShieldCheck aria-hidden="true" size={18} />
              <p>
                This application stores only the selected Secret names. Credential values remain in Main Sequence and are resolved by the backend only when Alpaca access is required.
              </p>
            </div>
            </form>
          </ApplicationCard>
        ) : null}

        {mutation.state === "loading" ? (
          <ApplicationStatusScreen
            as="section"
            state="loading"
            title={mutation.label}
            message="Waiting for the Alpaca Connectors API."
            variant="contained"
          />
        ) : mutation.state === "error" ? (
          <ApplicationStatusScreen
            as="section"
            state="error"
            title="Account request failed"
            message={mutation.message}
            variant="contained"
          />
        ) : mutation.state === "success" ? (
          <section className="action-result" aria-live="polite">
            <div className="section-heading">
              <h3>{mutation.message}</h3>
              <span className="status-pill status-pill--success">Complete</span>
            </div>
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
        description="Remove this Alpaca registration and deactivate the account."
        warning="Historical holdings snapshots are retained. Configurations that reference this account can no longer run."
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
