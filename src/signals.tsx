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
} from "@dev-mainsequence/command-center-sdk/views";
import { Activity } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import {
  API_ENDPOINTS,
  createApiClient,
  formatSharedJobSchedule,
  signalObservationsPath,
  type ApiTransport,
  type ResourceCollection,
  type SignalJobConfiguration,
  type SignalJobRunAccepted,
  type SignalObservations,
} from "./api";
import { RequestErrorDialog, RequestProgressDialog } from "./requestFeedback";

type MutationState =
  | { state: "idle" }
  | { state: "loading"; label: string }
  | { state: "error"; message: string }
  | { state: "success"; message: string };

const SIGNAL_OBSERVATION_LIMIT = 100;

function formatError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "Request cancelled.";
  return error instanceof Error ? error.message : "The signal request failed unexpectedly.";
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

function formatObservationTime(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) return value;
  return timestamp.toISOString().replace("T", " ").replace(/\.000Z$/, " UTC");
}

type SignalObservationRow = {
  id: string;
  timeIndex: string;
  weights: readonly (number | null)[];
};

function signalObservationRows(observations: SignalObservations): SignalObservationRow[] {
  return observations.time_indexes.map((timeIndex, observationIndex) => ({
    id: timeIndex,
    timeIndex: formatObservationTime(timeIndex),
    weights: observations.assets.map((asset) => asset.weights[observationIndex] ?? null),
  }));
}

function signalObservationColumns(
  observations: SignalObservations,
): ResourceColumnDefinition<SignalObservationRow, ReactNode>[] {
  return [
    {
      id: "time_index",
      header: "Observation time",
      importance: "primary",
      getValue: (row) => row.timeIndex,
    },
    ...observations.assets.map((asset, assetIndex) => ({
      id: `asset_${String(assetIndex).padStart(4, "0")}`,
      header: asset.symbol ?? asset.asset_identifier,
      importance: "secondary" as const,
      getValue: (row: SignalObservationRow) => row.weights[assetIndex],
      renderCell: (row: SignalObservationRow) => {
        const weight = row.weights[assetIndex];
        return weight === null || weight === undefined ? "—" : `${(weight * 100).toFixed(4)}%`;
      },
    })),
  ];
}

function SignalDetail({
  configuration,
  transport,
  onBack,
  onConfigurationChange,
}: {
  configuration: SignalJobConfiguration;
  transport: ApiTransport;
  onBack: () => void;
  onConfigurationChange: (configuration: SignalJobConfiguration) => void;
}) {
  const api = useMemo(() => createApiClient(transport), [transport]);
  const [observations, setObservations] = useState<SignalObservations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const [schedulePending, setSchedulePending] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  async function toggleScheduled() {
    setSchedulePending(true);
    setScheduleError(null);
    try {
      const action = configuration.scheduled ? "pause" : "resume";
      onConfigurationChange(await api.post<SignalJobConfiguration>(
        `${API_ENDPOINTS.signalJobs}/${encodeURIComponent(configuration.uid)}/actions/${action}`,
        {},
      ));
    } catch (requestError) {
      setScheduleError(formatError(requestError));
    } finally {
      setSchedulePending(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.get<SignalObservations>(
      signalObservationsPath(configuration.uid, SIGNAL_OBSERVATION_LIMIT),
      controller.signal,
    )
      .then(setObservations)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(formatError(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, configuration.uid, retryRevision]);

  const tableRows = useMemo(
    () => observations ? signalObservationRows(observations) : [],
    [observations],
  );
  const tableColumns = useMemo(
    () => observations ? signalObservationColumns(observations) : [],
    [observations],
  );

  return (
    <ResourceDetailShell<SignalJobConfiguration>
      embedded
      breadcrumbs={[
        { id: "signals", label: "ETF Weight Signals", onSelect: onBack },
        { id: configuration.uid, label: configuration.name },
      ]}
      loading={loading}
      loadingTitle="Loading signal observations…"
      loadingDescription="Querying the latest 100 observed weight frames from SignalWeightsStorage."
      error={error ? (
        <ApplicationStatusScreen
          as="section"
          state="error"
          title="Signal observations unavailable"
          message={error}
          variant="contained"
          action={{ label: "Retry", onSelect: () => setRetryRevision((value) => value + 1) }}
        />
      ) : undefined}
      headerActions={(
        <>
          <button className="button button--secondary" type="button" onClick={() => void toggleScheduled()} disabled={schedulePending}>
            {configuration.scheduled ? "Pause" : "Resume"}
          </button>
          <button className="button button--secondary" type="button" onClick={onBack}>
            Back to signals
          </button>
        </>
      )}
      summary={(
        <EntitySummary
          summary={{
            entity: {
              id: configuration.uid,
              type: "Universe-backed ETF signal",
              title: configuration.name,
            },
            badges: [{
              key: "state",
              label: configuration.lifecycle_state,
              tone: configuration.lifecycle_state === "ready" ? "success" : "default",
            }],
            inline_fields: [
              { key: "signal-uid", label: "Signal UID", value: configuration.signal_uid },
              { key: "universe-uid", label: "Universe UID", value: configuration.universe_uid },
              { key: "scheduled", label: "Scheduled run", value: configuration.scheduled ? "Included" : "Paused" },
              { key: "schedule", label: "Shared Job schedule", value: formatSharedJobSchedule(configuration.job) },
              {
                key: "latest-run",
                label: "Latest run",
                value: configuration.latest_run_at
                  ? `${configuration.latest_run_status ?? "Unknown"} · ${new Date(configuration.latest_run_at).toLocaleString()}`
                  : "Never",
              },
            ],
            highlight_fields: [],
            stats: [
              {
                key: "observations",
                label: "Observations",
                value: observations?.observation_count ?? 0,
                display: String(observations?.observation_count ?? 0),
              },
              {
                key: "assets",
                label: "Assets",
                value: observations?.asset_count ?? 0,
                display: String(observations?.asset_count ?? 0),
              },
            ],
          }}
        />
      )}
    >
      {scheduleError ? <p className="form-error" role="alert">{scheduleError}</p> : null}
      {observations && observations.observation_count === 0 ? (
        <ApplicationCard header={<h2>Latest signal weights</h2>}>
          <p className="muted">This signal has no published observations yet. Run it to publish the first weight frame.</p>
        </ApplicationCard>
      ) : observations ? (
        <section className="signal-observations" aria-labelledby="signal-observations-heading">
          <div className="signal-observations__heading">
            <h2 id="signal-observations-heading">Latest signal weights</h2>
            <p>The latest {observations?.observation_count} observation times are rows and {observations?.asset_count} assets are columns.</p>
          </div>
          <div className="signal-observations__table">
            <DataTable
              columns={tableColumns}
              emptyContent="No signal observations."
              getId={(row) => row.id}
              items={tableRows}
              presentation="table"
            />
          </div>
          <p className="muted signal-observations__note">
            Weights are shown as percentages. Each timestamp records when the extraction observed the holdings; it does not guarantee their exact economic effective time. A missing asset row in a complete observation is shown as 0%; an explicit null remains unavailable.
          </p>
        </section>
      ) : null}
    </ResourceDetailShell>
  );
}

function buildSignalResource(transport: ApiTransport) {
  const adapter = createHttpResourceAdapter<
    SignalJobConfiguration,
    string,
    ResourceCollection<SignalJobConfiguration>
  >({
    client: createResourceHttpClient(transport),
    endpoints: {
      list: API_ENDPOINTS.signalJobs,
      detail: (uid) => `${API_ENDPOINTS.signalJobs}/${encodeURIComponent(uid)}`,
      discovery: API_ENDPOINTS.signalJobDiscovery,
    },
    serializeListQuery: ({ pageIndex, pageSize, search, sort, filters }) => ({
      limit: pageSize,
      offset: pageIndex * pageSize,
      search,
      scheduled: filters?.scheduled,
      ordering: sort?.[0]
        ? `${sort[0].direction === "descending" ? "-" : ""}${sort[0].key}`
        : "name",
    }),
    normalizeList: (response) => ({ items: response.items, pageInfo: response.pageInfo }),
  });

  return defineResourceApplication({
    id: "alpaca-etf-signal-jobs",
    label: "ETF Weight Signals",
    itemLabel: "signal",
    description: "Scheduled Universe observations. The shared signal Job runs every configuration; each JobRun selects one with --configuration-uid.",
    getId: (configuration: SignalJobConfiguration) => configuration.uid,
    adapter,
    columns: [
      {
        id: "name",
        header: "Signal",
        getValue: (configuration) => configuration.name,
        sortableKey: "name",
        renderCell: (configuration) => (
          <ResourceIconLabelCell
            icon={<Activity size={17} />}
            label={configuration.name}
            meta={configuration.description ?? undefined}
          />
        ),
      },
      {
        id: "signal-uid",
        header: "Signal UID",
        getValue: (configuration) => configuration.signal_uid,
      },
      {
        id: "lifecycle-state",
        header: "State",
        getValue: (configuration) => configuration.lifecycle_state,
        renderCell: (configuration) => (
          <ResourceStatusCell
            label={configuration.lifecycle_state}
            tone={configuration.lifecycle_state === "ready" ? "success" : "neutral"}
          />
        ),
      },
      {
        id: "job-image-status",
        header: "Image",
        getValue: (configuration) => configuration.job?.image_status ?? "not provisioned",
      },
      {
        id: "latest-run-status",
        header: "Last Run",
        getValue: (configuration) => configuration.latest_run_status ?? "Never",
      },
      {
        id: "latest-run-at",
        header: "Last Run At",
        getValue: (configuration) => configuration.latest_run_at,
        renderCell: (configuration) => configuration.latest_run_at
          ? new Date(configuration.latest_run_at).toLocaleString()
          : "Never",
      },
      {
        id: "scheduled",
        header: "Scheduled Run",
        getValue: (configuration) => configuration.scheduled,
        renderCell: (configuration) => (
          <ResourceStatusCell
            label={configuration.scheduled ? "Included" : "Paused"}
            tone={configuration.scheduled ? "success" : "neutral"}
          />
        ),
      },
    ],
  });
}

export function SignalsPage({
  transport,
}: {
  transport: ApiTransport;
}) {
  const api = useMemo(() => createApiClient(transport), [transport]);
  const definition = useMemo(() => buildSignalResource(transport), [transport]);
  const [mutation, setMutation] = useState<MutationState>({ state: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSignal, setSelectedSignal] = useState<SignalJobConfiguration | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SignalJobConfiguration | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function runSignalJob(item: SignalJobConfiguration) {
    setMutation({ state: "loading", label: `Starting ${item.name}` });
    try {
      const result = await api.post<SignalJobRunAccepted>(
        `${API_ENDPOINTS.signalJobs}/${encodeURIComponent(item.uid)}/actions/run`,
        {},
      );
      setMutation({
        state: "success",
        message: `${item.name}: run completed. JobRun ${result.job_run_uid} was accepted.`,
      });
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setMutation({ state: "error", message: formatError(error) });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteConfirmation !== "DELETE") return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await api.delete<Record<string, unknown>>(
        `${API_ENDPOINTS.signalJobs}/${encodeURIComponent(deleteTarget.uid)}`,
      );
      const deletedName = deleteTarget.name;
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setMutation({ state: "success", message: `Deleted ${deletedName}. Signal observations were retained.` });
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setDeleteError(formatError(error));
    } finally {
      setDeletePending(false);
    }
  }

  const rowActions = useMemo<readonly ResourceRowAction<SignalJobConfiguration>[]>(() => [
    { id: "run-signal-job", label: "Run now", disabled: (item) => item.job?.image_status !== "ready", onSelect: (item) => void runSignalJob(item) },
    { id: "delete-signal-job", label: "Delete", tone: "danger", onSelect: setDeleteTarget },
  ], []);

  return (
    <ApplicationPage as="main" maxWidth="full">
      <ApplicationPageStack>
        <ApplicationPageHeader
          eyebrow="Portfolios"
          title="ETF Weight Signals"
          description="ETF weight signals are being retired: new signals can no longer be created or edited. The shared signal Job declared in the connector's workflow still runs the remaining ones; inspect, run, pause or resume, and delete them here."
        />

        {mutation.state === "loading" ? (
          <RequestProgressDialog open title={mutation.label} message="Waiting for the Alpaca Connectors API and Main Sequence Job service." />
        ) : mutation.state === "error" ? (
          <RequestErrorDialog open title="Signal request failed" message={mutation.message} onClose={() => setMutation({ state: "idle" })} />
        ) : mutation.state === "success" ? (
          <section className="action-result" aria-live="polite"><div className="section-heading"><h3>{mutation.message}</h3><span className="status-pill status-pill--success">Complete</span></div></section>
        ) : null}

        {selectedSignal ? (
          <SignalDetail
            configuration={selectedSignal}
            transport={transport}
            onBack={() => setSelectedSignal(null)}
            onConfigurationChange={(configuration) => {
              setSelectedSignal(configuration);
              setRefreshKey((current) => current + 1);
            }}
          />
        ) : (
          <ResourceListPage
            definition={definition}
            embedded
            pageSize={25}
            onRowActivate={setSelectedSignal}
            refreshable
            refreshKey={refreshKey}
            rowActions={rowActions}
            searchPlaceholder="Search ETF Weight Signals"
          />
        )}
      </ApplicationPageStack>

      <ResourceActionConfirmationDialog
        open={deleteTarget !== null}
        actionLabel="Delete"
        title="Delete signal"
        selectionLabel={deleteTarget?.name ?? "signal"}
        description="Delete this durable signal configuration. The shared signal Job and its past runs remain."
        warning="Existing SignalWeights observations are retained."
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
