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
  ResourceActionConfirmationDialog,
  ResourceIconLabelCell,
  ResourceListPage,
  ResourcePicker,
  ResourceStatusCell,
  type ResourcePickerOption,
  type ResourceRowAction,
} from "@dev-mainsequence/command-center-sdk/views";
import { Landmark, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  API_ENDPOINTS,
  createApiClient,
  type Account,
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

function AccountList({
  transport,
  refreshKey,
  onEdit,
  onDelete,
}: {
  transport: ApiTransport;
  refreshKey: number;
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
}) {
  const definition = useMemo(() => buildAccountResource(transport), [transport]);
  const rowActions = useMemo<readonly ResourceRowAction<Account>[]>(() => [
    { id: "edit-account", label: "Edit", onSelect: onEdit },
    { id: "delete-account", label: "Delete", tone: "danger", onSelect: onDelete },
  ], [onDelete, onEdit]);

  return (
    <ResourceListPage
      definition={definition}
      embedded
      pageSize={25}
      refreshable
      refreshKey={refreshKey}
      rowActions={rowActions}
      searchPlaceholder="Search Alpaca accounts"
    />
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
  const [secretsLoading, setSecretsLoading] = useState(true);
  const [secretsError, setSecretsError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [accountName, setAccountName] = useState("");
  const [environment, setEnvironment] = useState<"paper" | "live">("paper");
  const [apiKeySecretName, setApiKeySecretName] = useState("");
  const [secretKeySecretName, setSecretKeySecretName] = useState("");
  const [accountIsActive, setAccountIsActive] = useState(true);
  const [captureInitialHoldings, setCaptureInitialHoldings] = useState(false);
  const [registerMissingAssets, setRegisterMissingAssets] = useState(true);
  const [mutation, setMutation] = useState<MutationState>({ state: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setSecretsLoading(true);
    setSecretsError(null);
    api.get<ResourceCollection<SecretReference>>(
      `${API_ENDPOINTS.accountSecretReferences}?limit=100&offset=0`,
      controller.signal,
    )
      .then((response) => setSecretReferences(response.items))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setSecretsError(formatError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSecretsLoading(false);
      });
    return () => controller.abort();
  }, [api]);

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
    setCaptureInitialHoldings(false);
    setRegisterMissingAssets(true);
  }

  function beginEdit(account: Account) {
    setEditing(account);
    setAccountName(account.account_name);
    setEnvironment(account.is_paper ? "paper" : "live");
    setApiKeySecretName(account.api_key_secret_name);
    setSecretKeySecretName(account.secret_key_secret_name);
    setAccountIsActive(account.account_is_active);
    setCaptureInitialHoldings(false);
    setRegisterMissingAssets(true);
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
          capture_initial_holdings: captureInitialHoldings,
          register_missing_assets: registerMissingAssets,
        };
        await api.post<Account>(API_ENDPOINTS.accounts, request);
      }

      const completedName = accountName.trim();
      const completedAction = editing ? "Updated" : "Registered";
      resetForm();
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
      if (editing?.uid === deleteTarget.uid) resetForm();
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
                  emptyMessage="No visible Main Sequence Secrets."
                  fullWidth
                  loading={secretsLoading}
                  mode="single"
                  options={apiKeyOptions}
                  placeholder="Select the Secret containing the API key"
                  searchable
                  searchPlaceholder="Search Secret names"
                  value={apiKeySecretName || null}
                  onValueChange={setApiKeySecretName}
                />
              </div>
              <div className="field resource-picker-field">
                <label id="secret-key-secret-label">Secret key Secret</label>
                <ResourcePicker
                  ariaLabelledBy="secret-key-secret-label"
                  disabled={busy || secretsError !== null}
                  emptyMessage="No visible Main Sequence Secrets."
                  fullWidth
                  loading={secretsLoading}
                  mode="single"
                  options={secretKeyOptions}
                  placeholder="Select the Secret containing the secret key"
                  searchable
                  searchPlaceholder="Search Secret names"
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
              <>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={captureInitialHoldings}
                    onChange={(event) => setCaptureInitialHoldings(event.target.checked)}
                    disabled={busy}
                  />
                  Capture an initial holdings snapshot after registration
                </label>
                {captureInitialHoldings ? (
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={registerMissingAssets}
                      onChange={(event) => setRegisterMissingAssets(event.target.checked)}
                      disabled={busy}
                    />
                    Register strictly resolved missing held assets
                  </label>
                ) : null}
              </>
            )}

            {secretsError ? <p className="form-error" role="alert">Secret references could not be loaded: {secretsError}</p> : null}
            {!secretsLoading && !secretsError && secretReferences.length === 0 ? (
              <p className="form-error" role="alert">Create and share the Alpaca credential Secrets in Main Sequence before registering an account.</p>
            ) : null}
            {apiKeySecretName && apiKeySecretName === secretKeySecretName ? (
              <p className="form-error" role="alert">The API key and secret key must reference different Secrets.</p>
            ) : null}

            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={!canSubmit}>
                {editing ? "Save changes" : "Register account"}
              </button>
              {editing ? (
                <button className="button button--secondary" type="button" onClick={resetForm} disabled={busy}>
                  Cancel edit
                </button>
              ) : null}
            </div>

            <div className="workflow-guidance">
              <ShieldCheck aria-hidden="true" size={18} />
              <p>
                This application stores only the selected Secret names. Credential values remain in Main Sequence and are resolved by the backend only when Alpaca access is required.
              </p>
            </div>
          </form>
        </ApplicationCard>

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

        <AccountList
          transport={transport}
          refreshKey={refreshKey}
          onEdit={beginEdit}
          onDelete={requestDelete}
        />
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
