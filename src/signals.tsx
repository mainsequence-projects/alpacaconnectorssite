import { ApplicationStatusScreen } from "@dev-mainsequence/command-center-sdk/feedback";
import {
  CORE_TABULAR_FRAME_SOURCE_CONTRACT,
  type TabularFrameSourceV1,
} from "@dev-mainsequence/command-center-sdk/contracts";
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
import {
  TableWidget,
  tableWidget,
  type TableWidgetProps,
} from "@dev-mainsequence/command-center-sdk/widget/built-ins/table";
import { Activity, Info } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  API_ENDPOINTS,
  createApiClient,
  signalObservationsPath,
  type AccountSummary,
  type ApiTransport,
  type AssetUniverse,
  type ResourceCollection,
  type SignalJobConfiguration,
  type SignalJobConfigurationWriteRequest,
  type SignalJobRunAccepted,
  type SignalObservations,
  type SignalSchedulePeriod,
  type SignalScheduleType,
} from "./api";
import { RequestErrorDialog, RequestProgressDialog } from "./requestFeedback";
import {
  buildCronExpression,
  browserScheduleTimezone,
  CRON_WEEKDAYS,
  DEFAULT_CRON_SCHEDULE,
  describeCronSchedule,
  isValidCronExpression,
  parseCronExpression,
  supportedScheduleTimezones,
  type CronScheduleMode,
} from "./signalSchedule";

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

function formatSchedule(configuration: SignalJobConfiguration): string {
  if (configuration.schedule_type === "crontab") {
    const expression = configuration.schedule_expression ?? "Invalid crontab";
    return `${expression} · ${configuration.schedule_timezone ?? "UTC"}`;
  }
  return `Every ${configuration.schedule_every} ${configuration.schedule_period}`;
}

function formatObservationTime(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) return value;
  return timestamp.toISOString().replace("T", " ").replace(/\.000Z$/, " UTC");
}

function signalObservationFrame(observations: SignalObservations): TabularFrameSourceV1 {
  const assetColumns = observations.assets.map((_, index) => (
    `asset_${String(index).padStart(4, "0")}`
  ));
  const rows = observations.time_indexes.map((timeIndex, observationIndex) => {
    const row: Record<string, unknown> = {
      time_index: formatObservationTime(timeIndex),
    };
    assetColumns.forEach((column, assetIndex) => {
      const weight = observations.assets[assetIndex].weights[observationIndex];
      row[column] = weight === null || weight === undefined ? null : weight * 100;
    });
    return row;
  });

  return {
    status: "ready",
    columns: ["time_index", ...assetColumns],
    rows,
    fields: [
      {
        key: "time_index",
        label: "Observation time",
        type: "string",
        nullable: false,
        provenance: "derived",
        derivedFrom: ["time_index"],
      },
      ...assetColumns.map((column, index) => ({
        key: column,
        label: observations.assets[index].symbol ?? observations.assets[index].asset_identifier,
        description: observations.assets[index].name
          ? `${observations.assets[index].name} · ${observations.assets[index].asset_identifier}`
          : observations.assets[index].asset_identifier,
        type: "number" as const,
        nullable: true,
        provenance: "derived" as const,
        derivedFrom: ["asset_identifier", "signal_weight"],
      })),
    ],
    source: {
      kind: "alpaca-etf-signal-observations",
      id: observations.signal_uid,
      label: "Latest signal weights",
      updatedAtMs: observations.time_indexes.length > 0
        ? new Date(observations.time_indexes.at(-1)!).valueOf()
        : undefined,
      context: {
        configuration_uid: observations.configuration_uid,
        observation_count: observations.observation_count,
        asset_count: observations.asset_count,
        unit: "percent",
      },
    },
  };
}

function SignalDetail({
  configuration,
  transport,
  onBack,
}: {
  configuration: SignalJobConfiguration;
  transport: ApiTransport;
  onBack: () => void;
}) {
  const api = useMemo(() => createApiClient(transport), [transport]);
  const [observations, setObservations] = useState<SignalObservations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);

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

  const frame = useMemo(
    () => observations ? signalObservationFrame(observations) : null,
    [observations],
  );
  const tableProps = useMemo<TableWidgetProps>(() => ({
    tableSourceMode: "bound",
    density: "compact",
    showToolbar: true,
    showSearch: true,
    showColumnFilters: false,
    zebraRows: true,
    pagination: true,
    pageSize: 25,
    selectionMode: "none",
    schema: frame?.fields?.map((field) => field.key === "time_index" ? {
      key: field.key,
      label: field.label ?? "Observation time",
      format: "text" as const,
      minWidth: 224,
      pinned: "left" as const,
    } : {
      key: field.key,
      label: field.label ?? field.key,
      format: "number" as const,
      decimals: 4,
      suffix: "%",
      minWidth: 184,
    }) ?? [],
  }), [frame]);

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
        <button className="button button--secondary" type="button" onClick={onBack}>
          Back to signals
        </button>
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
              { key: "schedule", label: "Schedule", value: formatSchedule(configuration) },
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
      {observations && observations.observation_count === 0 ? (
        <ApplicationCard header={<h2>Latest signal weights</h2>}>
          <p className="muted">This signal has no published observations yet. Run its Job to publish the first weight frame.</p>
        </ApplicationCard>
      ) : frame ? (
        <section className="signal-observations" aria-labelledby="signal-observations-heading">
          <div className="signal-observations__heading">
            <h2 id="signal-observations-heading">Latest signal weights</h2>
            <p>The latest {observations?.observation_count} observation times are rows and {observations?.asset_count} assets are columns.</p>
          </div>
          <div className="signal-observations__table">
            <TableWidget
              instanceId={`signal-observations-${configuration.uid}`}
              widget={tableWidget}
              props={tableProps}
              resolvedInputs={{
                seedData: {
                  inputId: "seedData",
                  label: "Signal observations",
                  status: "valid",
                  contractId: CORE_TABULAR_FRAME_SOURCE_CONTRACT,
                  value: frame,
                },
              }}
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
      enabled: filters?.enabled,
      lifecycle_state: filters?.lifecycle_state,
      ordering: sort?.[0]
        ? `${sort[0].direction === "descending" ? "-" : ""}${sort[0].key}`
        : "name",
    }),
    normalizeList: (response) => ({ items: response.items, pageInfo: response.pageInfo }),
  });

  return defineResourceApplication({
    id: "alpaca-etf-signal-jobs",
    label: "ETF Weight Signals",
    itemLabel: "signal Job",
    description: "Scheduled Universe observations. Each configuration owns one Job and every JobRun resolves that stored configuration.",
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
        sortableKey: "lifecycle_state",
        renderCell: (configuration) => (
          <ResourceStatusCell
            label={configuration.lifecycle_state}
            tone={configuration.lifecycle_state === "ready" ? "success" : configuration.lifecycle_state === "error" ? "warning" : "neutral"}
          />
        ),
      },
      {
        id: "schedule-type",
        header: "Schedule",
        getValue: formatSchedule,
      },
      {
        id: "job-image-status",
        header: "Image",
        getValue: (configuration) => configuration.job_image_status ?? "not provisioned",
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
        id: "enabled",
        header: "Enabled",
        getValue: (configuration) => configuration.enabled,
        renderCell: (configuration) => (
          <ResourceStatusCell
            label={configuration.enabled ? "Enabled" : "Paused"}
            tone={configuration.enabled ? "success" : "neutral"}
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
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SignalJobConfiguration | null>(null);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [universes, setUniverses] = useState<AssetUniverse[]>([]);
  const [dependenciesLoading, setDependenciesLoading] = useState(false);
  const [dependenciesError, setDependenciesError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [universeUid, setUniverseUid] = useState("");
  const [accountUid, setAccountUid] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [scheduleType, setScheduleType] = useState<SignalScheduleType>("interval");
  const [scheduleEvery, setScheduleEvery] = useState(1);
  const [schedulePeriod, setSchedulePeriod] = useState<SignalSchedulePeriod>("days");
  const [cronMode, setCronMode] = useState<CronScheduleMode>(DEFAULT_CRON_SCHEDULE.mode);
  const [cronTime, setCronTime] = useState(DEFAULT_CRON_SCHEDULE.time);
  const [cronWeekday, setCronWeekday] = useState(DEFAULT_CRON_SCHEDULE.weekday);
  const [cronMonthDay, setCronMonthDay] = useState(DEFAULT_CRON_SCHEDULE.monthDay);
  const [advancedCronExpression, setAdvancedCronExpression] = useState(
    DEFAULT_CRON_SCHEDULE.advancedExpression,
  );
  const [scheduleTimezone, setScheduleTimezone] = useState(browserScheduleTimezone);
  const [cpuRequest, setCpuRequest] = useState("0.25");
  const [memoryRequest, setMemoryRequest] = useState("0.5");
  const [maxRuntimeSeconds, setMaxRuntimeSeconds] = useState(3600);
  const [spot, setSpot] = useState(false);
  const [mutation, setMutation] = useState<MutationState>({ state: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSignal, setSelectedSignal] = useState<SignalJobConfiguration | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SignalJobConfiguration | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!formOpen) return;
    const controller = new AbortController();
    setDependenciesLoading(true);
    setDependenciesError(null);
    Promise.all([
      api.get<ResourceCollection<AccountSummary>>(
        `${API_ENDPOINTS.accounts}?limit=100&offset=0&active=true&ordering=account_name`,
        controller.signal,
      ),
      api.get<ResourceCollection<AssetUniverse>>(
        `${API_ENDPOINTS.universes}?limit=100&offset=0&ordering=display_name`,
        controller.signal,
      ),
    ])
      .then(([accountResponse, universeResponse]) => {
        setAccounts(accountResponse.items);
        setUniverses(universeResponse.items.filter((universe) => universe.is_active));
        setAccountUid((current) => current || accountResponse.items[0]?.uid || "");
        setUniverseUid((current) => current || universeResponse.items.find((item) => item.is_active)?.uid || "");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDependenciesError(formatError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDependenciesLoading(false);
      });
    return () => controller.abort();
  }, [api, formOpen]);

  const accountOptions = useMemo<ResourcePickerOption[]>(() => accounts.map((account) => ({
    value: account.uid,
    label: account.account_name,
    subtitle: `${account.is_paper ? "Paper" : "Live"} · ${account.unique_identifier}`,
  })), [accounts]);
  const universeOptions = useMemo<ResourcePickerOption[]>(() => universes.map((universe) => ({
    value: universe.uid,
    label: universe.display_name,
    subtitle: `${universe.symbol} · ${universe.uid}`,
  })), [universes]);
  const busy = mutation.state === "loading";
  const cronEditorValue = useMemo(() => ({
    mode: cronMode,
    time: cronTime,
    weekday: cronWeekday,
    monthDay: cronMonthDay,
    advancedExpression: advancedCronExpression,
  }), [advancedCronExpression, cronMode, cronMonthDay, cronTime, cronWeekday]);
  const scheduleExpression = useMemo(
    () => buildCronExpression(cronEditorValue),
    [cronEditorValue],
  );
  const timezoneOptions = useMemo(
    () => supportedScheduleTimezones(scheduleTimezone),
    [scheduleTimezone],
  );
  const scheduleValid = scheduleType === "interval"
    ? scheduleEvery > 0
    : isValidCronExpression(scheduleExpression) && Boolean(scheduleTimezone);
  const canSubmit = Boolean(
    name.trim()
    && universeUid
    && accountUid
    && scheduleValid
    && cpuRequest.trim()
    && memoryRequest.trim()
    && maxRuntimeSeconds > 0
    && !busy
    && !dependenciesLoading
    && !dependenciesError,
  );

  function resetForm() {
    setEditing(null);
    setName("");
    setDescription("");
    setUniverseUid("");
    setAccountUid("");
    setEnabled(true);
    setScheduleType("interval");
    setScheduleEvery(1);
    setSchedulePeriod("days");
    setCronMode(DEFAULT_CRON_SCHEDULE.mode);
    setCronTime(DEFAULT_CRON_SCHEDULE.time);
    setCronWeekday(DEFAULT_CRON_SCHEDULE.weekday);
    setCronMonthDay(DEFAULT_CRON_SCHEDULE.monthDay);
    setAdvancedCronExpression(DEFAULT_CRON_SCHEDULE.advancedExpression);
    setScheduleTimezone(browserScheduleTimezone());
    setCpuRequest("0.25");
    setMemoryRequest("0.5");
    setMaxRuntimeSeconds(3600);
    setSpot(false);
  }

  function openCreate() {
    resetForm();
    setFormOpen(true);
    setMutation({ state: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEdit(item: SignalJobConfiguration) {
    setEditing(item);
    setName(item.name);
    setDescription(item.description ?? "");
    setUniverseUid(item.universe_uid);
    setAccountUid(item.account_uid);
    setEnabled(item.enabled);
    setScheduleType(item.schedule_type);
    setScheduleEvery(item.schedule_every ?? 1);
    setSchedulePeriod(item.schedule_period ?? "days");
    const cron = parseCronExpression(
      item.schedule_expression ?? DEFAULT_CRON_SCHEDULE.advancedExpression,
    );
    setCronMode(cron.mode);
    setCronTime(cron.time);
    setCronWeekday(cron.weekday);
    setCronMonthDay(cron.monthDay);
    setAdvancedCronExpression(cron.advancedExpression);
    setScheduleTimezone(item.schedule_timezone ?? "UTC");
    setCpuRequest(item.cpu_request);
    setMemoryRequest(item.memory_request);
    setMaxRuntimeSeconds(item.max_runtime_seconds);
    setSpot(item.spot);
    setFormOpen(true);
    setMutation({ state: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    resetForm();
    setFormOpen(false);
    setMutation({ state: "idle" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      setMutation({ state: "error", message: "Complete the Universe, account, schedule, and compute fields." });
      return;
    }
    const request: SignalJobConfigurationWriteRequest = {
      name: name.trim(),
      description: description.trim() || null,
      universe_uid: universeUid,
      account_uid: accountUid,
      enabled,
      schedule_type: scheduleType,
      schedule_every: scheduleType === "interval" ? scheduleEvery : null,
      schedule_period: scheduleType === "interval" ? schedulePeriod : null,
      schedule_expression: scheduleType === "crontab" ? scheduleExpression.trim() : null,
      schedule_timezone: scheduleType === "crontab" ? scheduleTimezone : null,
      schedule_start_time: null,
      cpu_request: cpuRequest.trim(),
      memory_request: memoryRequest.trim(),
      max_runtime_seconds: maxRuntimeSeconds,
      spot,
    };
    setMutation({ state: "loading", label: editing ? "Updating signal Job" : "Creating signal Job" });
    try {
      if (editing) {
        await api.patch<SignalJobConfiguration>(
          `${API_ENDPOINTS.signalJobs}/${encodeURIComponent(editing.uid)}`,
          request,
        );
      } else {
        await api.post<SignalJobConfiguration>(API_ENDPOINTS.signalJobs, request);
      }
      const message = `${editing ? "Updated" : "Created"} ${request.name}.`;
      resetForm();
      setFormOpen(false);
      setMutation({ state: "success", message });
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setMutation({ state: "error", message: formatError(error) });
    }
  }

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

  const primaryActions = useMemo(() => [{
    id: "create-signal-job",
    label: "Create signal",
    tone: "primary" as const,
    disabled: formOpen,
    onSelect: openCreate,
  }], [formOpen]);
  const rowActions = useMemo<readonly ResourceRowAction<SignalJobConfiguration>[]>(() => [
    { id: "run-signal-job", label: "Run now", disabled: (item) => !item.enabled || item.job_image_status !== "ready", onSelect: (item) => void runSignalJob(item) },
    { id: "edit-signal-job", label: "Edit", onSelect: openEdit },
    { id: "delete-signal-job", label: "Delete", tone: "danger", onSelect: setDeleteTarget },
  ], []);

  return (
    <ApplicationPage as="main" maxWidth="full">
      <ApplicationPageStack>
        <ApplicationPageHeader
          eyebrow="Portfolios"
          title="ETF Weight Signals"
          description="Create one canonical ms-markets Signal and one dedicated Main Sequence Job for each Universe-backed configuration. Each run extracts the current components, registers missing Alpaca assets in bulk, and publishes one observed weight frame."
        />

        {formOpen ? (
          <ApplicationCard header={<h2>{editing ? "Edit signal" : "Create signal"}</h2>}>
            <form className="workflow-form" onSubmit={submit}>
              <section className="workflow-form-section" aria-labelledby="signal-update-configuration-heading">
                <div className="workflow-form-section__header">
                  <h3 id="signal-update-configuration-heading">Signal update configuration</h3>
                  <p>The Universe defines the signal. The account supplies Alpaca credentials and asset resolution only while the update runs.</p>
                </div>
                <div className="form-grid">
                  <label className="field">Signal name
                    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Daily S&amp;P 500 holdings signal" disabled={busy} />
                  </label>
                  <label className="field field--wide">Signal description <span>Optional</span>
                    <textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} disabled={busy} />
                  </label>
                  <div className="field resource-picker-field">
                    <label id="signal-universe-label">Universe</label>
                    <ResourcePicker
                      ariaLabelledBy="signal-universe-label"
                      disabled={busy || dependenciesLoading}
                      emptyMessage="No active Universes."
                      fullWidth
                      loading={dependenciesLoading}
                      mode="single"
                      onValueChange={setUniverseUid}
                      options={universeOptions}
                      placeholder="Select the signal Universe"
                      searchable
                      searchPlaceholder="Search Universes"
                      value={universeUid || null}
                    />
                  </div>
                  <div className="field resource-picker-field">
                    <label id="signal-account-label">Runtime Alpaca account</label>
                    <ResourcePicker
                      ariaLabelledBy="signal-account-label"
                      disabled={busy || dependenciesLoading}
                      emptyMessage="No active registered Alpaca accounts."
                      fullWidth
                      loading={dependenciesLoading}
                      mode="single"
                      onValueChange={setAccountUid}
                      options={accountOptions}
                      placeholder="Select the account used at runtime"
                      searchable
                      searchPlaceholder="Search registered accounts"
                      value={accountUid || null}
                    />
                  </div>
                </div>
              </section>

              <section className="workflow-form-section" aria-labelledby="signal-job-schedule-heading">
                <div className="workflow-form-section__header">
                  <h3 id="signal-job-schedule-heading">Job schedule</h3>
                  <p>Choose a simple interval or build a calendar schedule. This controls when the update starts; it is not part of the signal table identity.</p>
                </div>
                <div className="form-grid">
                  <label className="field">Scheduling method
                    <select value={scheduleType} onChange={(event) => setScheduleType(event.target.value as SignalScheduleType)} disabled={busy}>
                      <option value="interval">Interval</option>
                      <option value="crontab">Calendar schedule</option>
                    </select>
                  </label>
                  {scheduleType === "interval" ? (
                    <>
                      <label className="field">Run every
                        <input type="number" min={1} value={scheduleEvery} onChange={(event) => setScheduleEvery(Number(event.target.value))} disabled={busy} />
                      </label>
                      <label className="field">Interval period
                        <select value={schedulePeriod} onChange={(event) => setSchedulePeriod(event.target.value as SignalSchedulePeriod)} disabled={busy}>
                          <option value="minutes">Minutes</option>
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                        </select>
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="field">Calendar pattern
                        <select value={cronMode} onChange={(event) => setCronMode(event.target.value as CronScheduleMode)} disabled={busy}>
                          <option value="daily">Every day</option>
                          <option value="weekdays">Monday through Friday</option>
                          <option value="weekly">Once a week</option>
                          <option value="monthly">Once a month</option>
                          <option value="advanced">Advanced crontab</option>
                        </select>
                      </label>
                      {cronMode === "advanced" ? (
                        <label className="field">Five-field crontab
                          <input
                            aria-describedby="signal-cron-help"
                            value={advancedCronExpression}
                            onChange={(event) => setAdvancedCronExpression(event.target.value)}
                            placeholder="0 9 * * 1-5"
                            spellCheck={false}
                            disabled={busy}
                          />
                        </label>
                      ) : (
                        <label className="field">Schedule time
                          <input type="time" value={cronTime} onChange={(event) => setCronTime(event.target.value)} disabled={busy} />
                        </label>
                      )}
                      {cronMode === "weekly" ? (
                        <label className="field">Day of week
                          <select value={cronWeekday} onChange={(event) => setCronWeekday(event.target.value)} disabled={busy}>
                            {CRON_WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                          </select>
                        </label>
                      ) : null}
                      {cronMode === "monthly" ? (
                        <label className="field">Day of month
                          <input type="number" min={1} max={31} value={cronMonthDay} onChange={(event) => setCronMonthDay(Number(event.target.value))} disabled={busy} />
                        </label>
                      ) : null}
                      <label className="field">Timezone
                        <select value={scheduleTimezone} onChange={(event) => setScheduleTimezone(event.target.value)} disabled={busy}>
                          {timezoneOptions.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
                        </select>
                      </label>
                      <div className="schedule-preview field--wide" aria-live="polite">
                        <div>
                          <span>Generated schedule</span>
                          <strong>{describeCronSchedule(cronEditorValue, scheduleTimezone)}</strong>
                        </div>
                        <code>{scheduleExpression || "Invalid schedule"}</code>
                        <small id="signal-cron-help">Main Sequence evaluates the five-field crontab in the selected IANA timezone. Daylight-saving changes follow that timezone; the Job keeps the same local clock time.</small>
                      </div>
                    </>
                  )}
                </div>
                <label className="checkbox-field"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={busy} />Enabled and scheduled</label>
              </section>

              <section className="workflow-form-section" aria-labelledby="signal-job-resources-heading">
                <div className="workflow-form-section__header">
                  <h3 id="signal-job-resources-heading">Job resources</h3>
                  <p>Execution capacity and timeout for this dedicated Job.</p>
                </div>
                <div className="form-grid">
                  <label className="field">CPU request
                    <input value={cpuRequest} onChange={(event) => setCpuRequest(event.target.value)} disabled={busy} />
                  </label>
                  <label className="field">Memory request (GiB)
                    <input value={memoryRequest} onChange={(event) => setMemoryRequest(event.target.value)} disabled={busy} />
                  </label>
                  <label className="field">Maximum runtime (seconds)
                    <input type="number" min={1} value={maxRuntimeSeconds} onChange={(event) => setMaxRuntimeSeconds(Number(event.target.value))} disabled={busy} />
                  </label>
                </div>
                <label className="checkbox-field"><input type="checkbox" checked={spot} onChange={(event) => setSpot(event.target.checked)} disabled={busy} />Prefer spot capacity</label>
              </section>
              {dependenciesError ? <p className="form-error" role="alert">{dependenciesError}</p> : null}
              <div className="form-actions">
                <button className="button button--primary" type="submit" disabled={!canSubmit}>{editing ? "Save changes" : "Create signal"}</button>
                <button className="button button--secondary" type="button" onClick={closeForm} disabled={busy}>Cancel</button>
              </div>
              <div className="workflow-guidance">
                <Info aria-hidden="true" size={18} />
                <p><strong>Universe</strong> defines the stable signal identity. The account is serialized updater input only: it resolves Secret names and registers missing assets, but is never written into the signal UID or signal weights table. The Job schedule controls when the updater starts. Every start forces one complete observation; that execution rule is fixed for this signal and is not another user-editable schedule field. Published timestamps are observations and do not guarantee the exact economic effective time of ETF weights.</p>
              </div>
            </form>
          </ApplicationCard>
        ) : null}

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
          />
        ) : (
          <ResourceListPage
            definition={definition}
            embedded
            pageSize={25}
            primaryActions={primaryActions}
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
        title="Delete signal Job"
        selectionLabel={deleteTarget?.name ?? "signal"}
        description="Delete this dedicated Main Sequence Job and its durable configuration."
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
