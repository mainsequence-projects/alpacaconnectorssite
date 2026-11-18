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
  type ResourceColumnDefinition,
  type ResourceHttpClient,
  type ResourceHttpRequest,
} from "@dev-mainsequence/command-center-sdk/resource";
import {
  DataTable,
  EntitySummary,
  ResourceActionConfirmationDialog,
  ResourceDetailShell,
  ResourceIconLabelCell,
  ResourceListPage,
  ResourceStatusCell,
  type ResourceRowAction,
  type ResourceSelectFilterDefinition,
} from "@dev-mainsequence/command-center-sdk/views";
import { Info, Signal } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";

import {
  API_ENDPOINTS,
  createApiClient,
  signalDefinitionPath,
  signalDefinitionWeightsPath,
  type Account,
  type ApiTransport,
  type PortfolioConfiguration,
  type ResourceCollection,
  type SignalDefinition,
  type SignalDefinitionDeleteResponse,
  type SignalDefinitionUpdateRequest,
  type SignalObservationAsset,
  type SignalObservations,
} from "./api";
import { LOOKUP_LIMIT, accountLabel, accountName, useAccountLookup } from "./lookups";
import { RequestErrorDialog, RequestProgressDialog } from "./requestFeedback";

type MutationState =
  | { state: "idle" }
  | { state: "loading"; label: string }
  | { state: "error"; message: string }
  | { state: "success"; message: string };

/** The latest observations the detail shows, newest first. */
const WEIGHT_OBSERVATION_LIMIT = 5;

function formatError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "Request cancelled.";
  return error instanceof Error ? error.message : "The request failed unexpectedly.";
}

function formatDateTime(value: string | null): string {
  if (!value) return "Unavailable";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.valueOf()) ? value : timestamp.toLocaleString();
}

function formatWeight(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatFollowers(count: number): string {
  if (count === 0) return "No portfolio";
  return `${count} ${count === 1 ? "portfolio" : "portfolios"}`;
}

function withQuery(path: string, query?: Readonly<Record<string, unknown>>): string {
  const parameters = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") parameters.set(key, String(value));
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

function buildSignalDefinitionResource(transport: ApiTransport, accounts: ReadonlyMap<string, Account>) {
  const adapter = createHttpResourceAdapter<SignalDefinition, string, ResourceCollection<SignalDefinition>>({
    client: createResourceHttpClient(transport),
    endpoints: {
      list: API_ENDPOINTS.signalDefinitions,
      detail: (uid) => signalDefinitionPath(uid),
      discovery: API_ENDPOINTS.signalDefinitionDiscovery,
    },
    // The API orders signals by name and takes no ordering parameter.
    serializeListQuery: ({ pageIndex, pageSize, search, filters }) => ({
      limit: pageSize,
      offset: pageIndex * pageSize,
      search,
      account_uid: filters?.account_uid,
    }),
    normalizeList: (response) => ({ items: response.items, pageInfo: response.pageInfo }),
  });

  return defineResourceApplication({
    id: "alpaca-signal-definitions",
    label: "Signals",
    itemLabel: "signal",
    description: "Each signal belongs to one account. Its key is the application's own, the application publishes its weights, and the account's portfolios follow it.",
    getId: (definition: SignalDefinition) => definition.uid,
    adapter,
    columns: [
      {
        id: "name",
        header: "Signal",
        getValue: (definition) => definition.name,
        renderCell: (definition) => (
          <ResourceIconLabelCell
            icon={<Signal size={17} />}
            label={definition.name}
            meta={definition.description ?? undefined}
          />
        ),
      },
      {
        id: "account-uid",
        header: "Account",
        getValue: (definition) => accountName(accounts, definition.account_uid),
      },
      {
        id: "portfolio-count",
        header: "Followed By",
        getValue: (definition) => definition.portfolio_count,
        renderCell: (definition) => (
          <ResourceStatusCell
            label={formatFollowers(definition.portfolio_count)}
            tone={definition.portfolio_count > 0 ? "success" : "neutral"}
          />
        ),
      },
      {
        id: "updated-at",
        header: "Updated",
        getValue: (definition) => definition.updated_at,
        renderCell: (definition) => formatDateTime(definition.updated_at),
      },
    ],
  });
}

interface WeightRow extends SignalObservationAsset {
  /** Weights newest first, aligned with the shown time indexes. */
  latestFirst: (number | null)[];
}

function SignalWeights({ observations }: { observations: SignalObservations }) {
  const timeIndexes = useMemo(() => [...observations.time_indexes].reverse(), [observations.time_indexes]);
  const rows = useMemo<WeightRow[]>(() => observations.assets.map((asset) => ({
    ...asset,
    latestFirst: [...asset.weights].reverse(),
  })), [observations.assets]);
  const columns = useMemo<ResourceColumnDefinition<WeightRow, ReactNode>[]>(() => [
    {
      id: "asset",
      header: "Asset",
      importance: "primary",
      getValue: (row) => row.symbol ?? row.asset_identifier,
      renderCell: (row) => (
        <ResourceIconLabelCell
          label={row.symbol ?? row.asset_identifier}
          meta={row.name ?? row.asset_identifier}
        />
      ),
    },
    ...timeIndexes.map((timeIndex, index) => ({
      id: `observation-${index}`,
      header: formatDateTime(timeIndex),
      importance: index === 0 ? "secondary" as const : "tertiary" as const,
      getValue: (row: WeightRow) => row.latestFirst[index],
      renderCell: (row: WeightRow) => formatWeight(row.latestFirst[index]),
    })),
  ], [timeIndexes]);

  if (observations.observation_count === 0) {
    return <p className="muted">The application has not published weights to this signal yet.</p>;
  }
  return (
    <DataTable
      columns={columns}
      getId={(row) => row.asset_identifier}
      items={rows}
      presentation="auto"
    />
  );
}

function SignalPortfolios({ portfolios }: { portfolios: PortfolioConfiguration[] }) {
  const columns = useMemo<ResourceColumnDefinition<PortfolioConfiguration, ReactNode>[]>(() => [
    {
      id: "name",
      header: "Portfolio",
      importance: "primary",
      getValue: (portfolio) => portfolio.name,
      renderCell: (portfolio) => (
        <ResourceIconLabelCell label={portfolio.name} meta={portfolio.description ?? undefined} />
      ),
    },
    {
      id: "scheduled",
      header: "Scheduled Run",
      getValue: (portfolio) => portfolio.scheduled,
      renderCell: (portfolio) => (
        <ResourceStatusCell
          label={portfolio.scheduled ? "Included" : "Paused"}
          tone={portfolio.scheduled ? "success" : "neutral"}
        />
      ),
    },
    {
      id: "latest-run",
      header: "Last Run",
      getValue: (portfolio) => portfolio.latest_run_status ?? "Never",
    },
  ], []);

  if (portfolios.length === 0) {
    return <p className="muted">No portfolio follows this signal. Its account&apos;s owner can delete it.</p>;
  }
  return (
    <DataTable
      columns={columns}
      getId={(portfolio) => portfolio.uid}
      items={portfolios}
      presentation="auto"
    />
  );
}

function SignalDetail({
  definition,
  accounts,
  transport,
  onBack,
}: {
  definition: SignalDefinition;
  accounts: ReadonlyMap<string, Account>;
  transport: ApiTransport;
  onBack: () => void;
}) {
  const api = useMemo(() => createApiClient(transport), [transport]);
  const [current, setCurrent] = useState<SignalDefinition | null>(null);
  const [observations, setObservations] = useState<SignalObservations | null>(null);
  const [portfolios, setPortfolios] = useState<PortfolioConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<SignalDefinition>(signalDefinitionPath(definition.uid), controller.signal),
      api.get<SignalObservations>(
        signalDefinitionWeightsPath(definition.uid, WEIGHT_OBSERVATION_LIMIT),
        controller.signal,
      ),
      api.get<ResourceCollection<PortfolioConfiguration>>(
        `${API_ENDPOINTS.portfolioConfigurations}?limit=${LOOKUP_LIMIT}&offset=0&ordering=name&signal_definition_uid=${encodeURIComponent(definition.uid)}`,
        controller.signal,
      ),
    ])
      .then(([loaded, weights, followers]) => {
        setCurrent(loaded);
        setObservations(weights);
        setPortfolios(followers.items);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(formatError(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, definition.uid, retryRevision]);

  const resolved = current ?? definition;
  const latestObservation = observations?.time_indexes.at(-1) ?? null;

  return (
    <ResourceDetailShell<SignalDefinition>
      embedded
      breadcrumbs={[
        { id: "signals", label: "Signals", onSelect: onBack },
        { id: definition.uid, label: resolved.name },
      ]}
      loading={loading}
      loadingTitle="Loading the signal…"
      loadingDescription="Reading its latest weights and the portfolios that follow it."
      error={error ? (
        <ApplicationStatusScreen
          as="section"
          state="error"
          title="Signal unavailable"
          message={error}
          variant="contained"
          action={{ label: "Retry", onSelect: () => setRetryRevision((value) => value + 1) }}
        />
      ) : undefined}
      headerActions={(
        <button className="button button--secondary" type="button" onClick={onBack}>
          Back to signals
        </button>
      )}
      summary={(
        <EntitySummary
          summary={{
            entity: { id: resolved.uid, type: "Signal", title: resolved.name },
            badges: [{
              key: "followers",
              label: `Followed by ${formatFollowers(resolved.portfolio_count).toLowerCase()}`,
              tone: resolved.portfolio_count > 0 ? "success" : "default",
            }],
            inline_fields: [
              { key: "account", label: "Account", value: accountName(accounts, resolved.account_uid) },
              { key: "key", label: "Application key", value: resolved.key },
              { key: "latest", label: "Latest weights", value: formatDateTime(latestObservation) },
              { key: "updated", label: "Updated", value: formatDateTime(resolved.updated_at) },
            ],
            highlight_fields: [
              { key: "description", label: "Description", value: resolved.description ?? "No description" },
            ],
            stats: [
              {
                key: "assets",
                label: "Assets",
                value: observations?.asset_count ?? 0,
                display: String(observations?.asset_count ?? 0),
              },
              {
                key: "portfolios",
                label: "Portfolios",
                value: resolved.portfolio_count,
                display: String(resolved.portfolio_count),
              },
            ],
          }}
        />
      )}
    >
      {observations ? (
        <div className="portfolio-detail-stack">
          <ApplicationCard header={<h2>Latest weights</h2>}>
            <SignalWeights observations={observations} />
          </ApplicationCard>
          <ApplicationCard header={<h2>Portfolios that follow it</h2>}>
            <SignalPortfolios portfolios={portfolios} />
          </ApplicationCard>
          <aside className="workflow-guidance" aria-label="Where the weights come from">
            <Info aria-hidden="true" size={18} />
            <p>The account owner&apos;s application publishes the weights with the Alpaca Connectors API; every portfolio of the account that follows this signal uses them. This page only reads them.</p>
          </aside>
        </div>
      ) : null}
    </ResourceDetailShell>
  );
}

export function SignalsPage({ transport }: { transport: ApiTransport }) {
  const api = useMemo(() => createApiClient(transport), [transport]);
  const accountLookup = useAccountLookup(transport);
  const definition = useMemo(
    () => buildSignalDefinitionResource(transport, accountLookup.byUid),
    [accountLookup.byUid, transport],
  );
  const [accountFilter, setAccountFilter] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<SignalDefinition | null>(null);
  const [editing, setEditing] = useState<SignalDefinition | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mutation, setMutation] = useState<MutationState>({ state: "idle" });
  const [deleteTarget, setDeleteTarget] = useState<SignalDefinition | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const busy = mutation.state === "loading";
  const changes = useMemo<SignalDefinitionUpdateRequest>(() => {
    if (!editing) return {};
    const request: SignalDefinitionUpdateRequest = {};
    if (name.trim() !== editing.name) request.name = name.trim();
    const nextDescription = description.trim() || null;
    if (nextDescription !== editing.description) request.description = nextDescription;
    return request;
  }, [description, editing, name]);
  const canSave = !busy && Boolean(name.trim()) && Object.keys(changes).length > 0;

  const filterDefinitions = useMemo<readonly ResourceSelectFilterDefinition[]>(() => [{
    id: "account_uid",
    label: "Account",
    value: accountFilter,
    options: [
      { value: "", label: "All accounts" },
      ...accountLookup.items.map((account) => ({ value: account.uid, label: accountLabel(account) })),
    ],
    onChange: setAccountFilter,
  }], [accountFilter, accountLookup.items]);

  const rowActions = useMemo<readonly ResourceRowAction<SignalDefinition>[]>(() => [
    {
      id: "rename-signal",
      label: "Rename",
      onSelect: (item) => {
        setSelected(null);
        setEditing(item);
        setName(item.name);
        setDescription(item.description ?? "");
        setMutation({ state: "idle" });
        window.scrollTo({ top: 0, behavior: "smooth" });
      },
    },
    {
      id: "delete-signal",
      label: "Delete",
      tone: "danger",
      // The API refuses it too (409 signal_followed): delete its portfolios first.
      disabled: (item) => item.portfolio_count > 0,
      onSelect: (item) => {
        setDeleteTarget(item);
        setDeleteConfirmation("");
        setDeleteError(null);
      },
    },
  ], []);

  function closeForm() {
    setEditing(null);
    setName("");
    setDescription("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || !canSave) return;
    setMutation({ state: "loading", label: "Updating signal" });
    try {
      const updated = await api.patch<SignalDefinition>(signalDefinitionPath(editing.uid), changes);
      closeForm();
      setMutation({ state: "success", message: `Updated ${updated.name}.` });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setMutation({ state: "error", message: formatError(error) });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteConfirmation !== "DELETE") return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const result = await api.delete<SignalDefinitionDeleteResponse>(signalDefinitionPath(deleteTarget.uid));
      const deletedName = deleteTarget.name;
      if (editing?.uid === deleteTarget.uid) closeForm();
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setMutation({
        state: "success",
        message: result.signal.state === "kept"
          ? `Deleted ${deletedName}. A retired portfolio still follows its signal, so its weights stay with that portfolio's record.`
          : `Deleted ${deletedName} and its weights.`,
      });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setDeleteError(formatError(error));
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <ApplicationPage as="main" maxWidth="full">
      <ApplicationPageStack>
        <ApplicationPageHeader
          eyebrow="Portfolios"
          title="Signals"
          description="Each signal belongs to one account. The account owner's application creates it with its own key and publishes its weights; any of the account's portfolios can follow it. Inspect, rename, or delete signals here; a signal a portfolio follows cannot be deleted."
        />

        {editing ? (
          <ApplicationCard header={<h2>Rename signal</h2>}>
            <form className="workflow-form" onSubmit={save}>
              <div className="form-grid">
                <label className="field">Name
                  <input value={name} onChange={(event) => setName(event.target.value)} disabled={busy} />
                </label>
                <label className="field">Application key
                  <input readOnly value={editing.key} />
                  <span>The key is the application&apos;s and never changes.</span>
                </label>
                <label className="field field--wide">Description <span>Optional</span>
                  <textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} disabled={busy} />
                </label>
              </div>
              {Object.keys(changes).length === 0 ? <p className="form-note" role="status">No changes to save.</p> : null}
              <div className="form-actions">
                <button className="button button--primary" type="submit" disabled={!canSave}>Save changes</button>
                <button className="button button--secondary" type="button" onClick={closeForm} disabled={busy}>Cancel</button>
              </div>
              <div className="workflow-guidance">
                <Info aria-hidden="true" size={18} />
                <p>Only the account&apos;s owner can rename or delete its signals.</p>
              </div>
            </form>
          </ApplicationCard>
        ) : null}

        {mutation.state === "loading" ? (
          <RequestProgressDialog open title={mutation.label} message="Waiting for the Alpaca Connectors API." />
        ) : mutation.state === "error" ? (
          <RequestErrorDialog
            open
            title="Signal request failed"
            message={mutation.message}
            onClose={() => setMutation({ state: "idle" })}
          />
        ) : mutation.state === "success" ? (
          <section className="action-result" aria-live="polite">
            <div className="section-heading">
              <h3>{mutation.message}</h3>
              <span className="status-pill status-pill--success">Complete</span>
            </div>
          </section>
        ) : null}

        {selected ? (
          <SignalDetail
            definition={selected}
            accounts={accountLookup.byUid}
            transport={transport}
            onBack={() => setSelected(null)}
          />
        ) : (
          <ResourceListPage
            definition={definition}
            embedded
            filterDefinitions={filterDefinitions}
            onRowActivate={setSelected}
            pageSize={25}
            refreshable
            refreshKey={refreshKey}
            rowActions={rowActions}
            searchPlaceholder="Search signals"
          />
        )}
      </ApplicationPageStack>

      <ResourceActionConfirmationDialog
        open={deleteTarget !== null}
        actionLabel="Delete"
        title="Delete signal"
        selectionLabel={deleteTarget?.name ?? "signal"}
        description="Delete this signal and its published weights. Only the account's owner can delete it, and only while no portfolio follows it."
        warning="If a retired portfolio still follows the signal, its weights stay as that portfolio's record."
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
