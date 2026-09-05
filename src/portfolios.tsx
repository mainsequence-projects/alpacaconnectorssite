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
import { BriefcaseBusiness, Info, Repeat2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  API_ENDPOINTS,
  createApiClient,
  type ApiTransport,
  type BarConfiguration,
  type PortfolioConfiguration,
  type PortfolioConfigurationWriteRequest,
  type PortfolioJobRunAccepted,
  type PortfolioRebalanceConfiguration,
  type ResourceCollection,
  type SignalJobConfiguration,
  type SignalSchedulePeriod,
  type SignalScheduleType,
} from "./api";
import {
  buildCronExpression,
  CRON_WEEKDAYS,
  DEFAULT_CRON_SCHEDULE,
  describeCronSchedule,
  isValidCronExpression,
  parseCronExpression,
  type CronScheduleMode,
} from "./signalSchedule";

type MutationState =
  | { state: "idle" }
  | { state: "loading"; label: string }
  | { state: "error"; message: string }
  | { state: "success"; message: string };

function formatError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "Request cancelled.";
  return error instanceof Error ? error.message : "The portfolio request failed unexpectedly.";
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

function formatSchedule(configuration: PortfolioConfiguration): string {
  const job = configuration.job;
  if (!job) return "Not provisioned";
  if (job.schedule_type === "crontab") return job.schedule_expression ?? "Invalid crontab";
  return `Every ${job.schedule_every} ${job.schedule_period}`;
}

function buildPortfolioResource(transport: ApiTransport) {
  const adapter = createHttpResourceAdapter<
    PortfolioConfiguration,
    string,
    ResourceCollection<PortfolioConfiguration>
  >({
    client: createResourceHttpClient(transport),
    endpoints: {
      list: API_ENDPOINTS.portfolioConfigurations,
      detail: (uid) => `${API_ENDPOINTS.portfolioConfigurations}/${encodeURIComponent(uid)}`,
      discovery: API_ENDPOINTS.portfolioConfigurationDiscovery,
    },
    serializeListQuery: ({ pageIndex, pageSize, search, sort, filters }) => ({
      limit: pageSize,
      offset: pageIndex * pageSize,
      search,
      signal_configuration_uid: filters?.signal_configuration_uid,
      bars_configuration_uid: filters?.bars_configuration_uid,
      ordering: sort?.[0]
        ? `${sort[0].direction === "descending" ? "-" : ""}${sort[0].key}`
        : "name",
    }),
    normalizeList: (response) => ({ items: response.items, pageInfo: response.pageInfo }),
  });

  return defineResourceApplication({
    id: "alpaca-etf-portfolio-configurations",
    label: "ETF Portfolios",
    itemLabel: "portfolio configuration",
    description: "Durable analytical portfolios composed from ETF weight signals, Alpaca bars, and ImmediateSignal rebalance configurations.",
    getId: (configuration: PortfolioConfiguration) => configuration.uid,
    adapter,
    columns: [
      {
        id: "name",
        header: "Portfolio",
        getValue: (configuration) => configuration.name,
        sortableKey: "name",
        renderCell: (configuration) => (
          <ResourceIconLabelCell
            icon={<BriefcaseBusiness size={17} />}
            label={configuration.name}
            meta={configuration.description ?? undefined}
          />
        ),
      },
      {
        id: "rebalance-strategy",
        header: "Rebalance",
        getValue: (configuration) => configuration.rebalance_strategy,
        renderCell: () => <ResourceStatusCell label="ImmediateSignal" tone="neutral" />,
      },
      {
        id: "portfolio-uid",
        header: "Portfolio UID",
        getValue: (configuration) => configuration.portfolio_uid ?? "Not materialized",
      },
      {
        id: "job-image-status",
        header: "Image",
        getValue: (configuration) => configuration.job?.image_status ?? "not provisioned",
        renderCell: (configuration) => (
          <ResourceStatusCell
            label={configuration.job?.image_status ?? "not provisioned"}
            tone={configuration.job?.image_status === "ready" ? "success" : "neutral"}
          />
        ),
      },
      {
        id: "latest-run-status",
        header: "Last Run",
        getValue: (configuration) => configuration.latest_run_status ?? "Never",
        renderCell: (configuration) => (
          <ResourceStatusCell
            label={configuration.latest_run_status ?? "Never"}
            tone={configuration.latest_run_status === "SUCCEEDED" ? "success" : configuration.latest_run_status === "FAILED" ? "warning" : "neutral"}
          />
        ),
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
        id: "updated-at",
        header: "Updated",
        getValue: (configuration) => configuration.updated_at,
        sortableKey: "updated_at",
        renderCell: (configuration) => new Date(configuration.updated_at).toLocaleString(),
      },
    ],
  });
}

function buildRebalanceResource(transport: ApiTransport) {
  const adapter = createHttpResourceAdapter<
    PortfolioRebalanceConfiguration,
    string,
    ResourceCollection<PortfolioRebalanceConfiguration>
  >({
    client: createResourceHttpClient(transport),
    endpoints: {
      list: API_ENDPOINTS.portfolioRebalanceConfigurations,
      detail: (uid) => `${API_ENDPOINTS.portfolioRebalanceConfigurations}/${encodeURIComponent(uid)}`,
      discovery: API_ENDPOINTS.portfolioRebalanceConfigurationDiscovery,
    },
    serializeListQuery: ({ pageIndex, pageSize, search, sort }) => ({
      limit: pageSize,
      offset: pageIndex * pageSize,
      search,
      ordering: sort?.[0]
        ? `${sort[0].direction === "descending" ? "-" : ""}${sort[0].key}`
        : "name",
    }),
    normalizeList: (response) => ({ items: response.items, pageInfo: response.pageInfo }),
  });

  return defineResourceApplication({
    id: "portfolio-rebalance-configurations",
    label: "Rebalance Configurations",
    itemLabel: "rebalance configuration",
    description: "Reusable analytical rebalance policies. Phase 1 supports ImmediateSignal only.",
    getId: (configuration: PortfolioRebalanceConfiguration) => configuration.uid,
    adapter,
    columns: [
      {
        id: "name",
        header: "Configuration",
        getValue: (configuration) => configuration.name,
        sortableKey: "name",
        renderCell: (configuration) => (
          <ResourceIconLabelCell
            icon={<Repeat2 size={17} />}
            label={configuration.name}
            meta={configuration.description ?? undefined}
          />
        ),
      },
      {
        id: "strategy",
        header: "Strategy",
        getValue: (configuration) => configuration.strategy,
        renderCell: () => <ResourceStatusCell label="ImmediateSignal" tone="neutral" />,
      },
      {
        id: "updated-at",
        header: "Updated",
        getValue: (configuration) => configuration.updated_at,
        sortableKey: "updated_at",
        renderCell: (configuration) => new Date(configuration.updated_at).toLocaleString(),
      },
    ],
  });
}

function PortfolioDetail({
  configuration,
  onBack,
}: {
  configuration: PortfolioConfiguration;
  onBack: () => void;
}) {
  return (
    <ResourceDetailShell<PortfolioConfiguration>
      embedded
      breadcrumbs={[
        { id: "portfolios", label: "ETF Portfolios", onSelect: onBack },
        { id: configuration.uid, label: configuration.name },
      ]}
      headerActions={(
        <button className="button button--secondary" type="button" onClick={onBack}>
          Back to portfolios
        </button>
      )}
      summary={(
        <EntitySummary
          summary={{
            entity: {
              id: configuration.uid,
              type: "Analytical ETF portfolio",
              title: configuration.name,
            },
            badges: [{
              key: "strategy",
              label: "ImmediateSignal",
              tone: "default",
            }],
            inline_fields: [
              { key: "portfolio-uid", label: "Portfolio UID", value: configuration.portfolio_uid ?? "Not materialized" },
              { key: "signal-uid", label: "Signal UID", value: configuration.signal_uid },
              { key: "bars-configuration", label: "Bars Configuration UID", value: configuration.bars_configuration_uid },
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
              { key: "frequency", label: "Portfolio frequency", value: 1, display: configuration.portfolio_prices_frequency ?? "Source cadence" },
              { key: "commission", label: "Commission fee", value: configuration.commission_fee, display: `${(configuration.commission_fee * 100).toFixed(4)}%` },
            ],
          }}
        />
      )}
    >
      <ApplicationCard header={<h2>Calculation contract</h2>}>
        <dl className="summary-list">
          <div><dt>Signal Configuration</dt><dd>{configuration.signal_configuration_uid}</dd></div>
          <div><dt>Bars Configuration</dt><dd>{configuration.bars_configuration_uid}</dd></div>
          <div><dt>Rebalance Configuration</dt><dd>{configuration.rebalance_configuration_uid}</dd></div>
          <div><dt>Persistent interpolation</dt><dd>{configuration.upsample_frequency_id} · {configuration.intraday_bar_interpolation_rule}</dd></div>
          <div><dt>Valuation column</dt><dd>{configuration.valuation_column}</dd></div>
          <div><dt>Missing prices</dt><dd>{configuration.fail_on_missing_prices ? "Fail the run" : "Allow"}</dd></div>
        </dl>
        <p className="muted">This is an analytical observation-time backtest. Each observed ETF weight signal is applied immediately; it does not claim perfect point-in-time holdings or model execution latency, fills, impact, or slippage beyond the commission fee.</p>
      </ApplicationCard>
    </ResourceDetailShell>
  );
}

export function PortfoliosPage({ transport }: { transport: ApiTransport }) {
  const api = useMemo(() => createApiClient(transport), [transport]);
  const portfolioDefinition = useMemo(() => buildPortfolioResource(transport), [transport]);
  const rebalanceDefinition = useMemo(() => buildRebalanceResource(transport), [transport]);
  const [manageRebalances, setManageRebalances] = useState(false);
  const [portfolioFormOpen, setPortfolioFormOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<PortfolioConfiguration | null>(null);
  const [selectedPortfolio, setSelectedPortfolio] = useState<PortfolioConfiguration | null>(null);
  const [signals, setSignals] = useState<SignalJobConfiguration[]>([]);
  const [bars, setBars] = useState<BarConfiguration[]>([]);
  const [rebalances, setRebalances] = useState<PortfolioRebalanceConfiguration[]>([]);
  const [dependenciesLoading, setDependenciesLoading] = useState(false);
  const [dependenciesError, setDependenciesError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [signalConfigurationUid, setSignalConfigurationUid] = useState("");
  const [barsConfigurationUid, setBarsConfigurationUid] = useState("");
  const [rebalanceConfigurationUid, setRebalanceConfigurationUid] = useState("");
  const [valuationColumn, setValuationColumn] = useState("close");
  const [forwardFillToNow, setForwardFillToNow] = useState(false);
  const [failOnMissingPrices, setFailOnMissingPrices] = useState(true);
  const [commissionFee, setCommissionFee] = useState(0.00018);
  const [scheduleType, setScheduleType] = useState<SignalScheduleType>("interval");
  const [scheduleEvery, setScheduleEvery] = useState(1);
  const [schedulePeriod, setSchedulePeriod] = useState<SignalSchedulePeriod>("days");
  const [cronMode, setCronMode] = useState<CronScheduleMode>(DEFAULT_CRON_SCHEDULE.mode);
  const [cronTime, setCronTime] = useState(DEFAULT_CRON_SCHEDULE.time);
  const [cronWeekday, setCronWeekday] = useState(DEFAULT_CRON_SCHEDULE.weekday);
  const [cronMonthDay, setCronMonthDay] = useState(DEFAULT_CRON_SCHEDULE.monthDay);
  const [advancedCronExpression, setAdvancedCronExpression] = useState(DEFAULT_CRON_SCHEDULE.advancedExpression);
  const [cpuRequest, setCpuRequest] = useState("0.25");
  const [memoryRequest, setMemoryRequest] = useState("0.5");
  const [maxRuntimeSeconds, setMaxRuntimeSeconds] = useState(3600);
  const [spot, setSpot] = useState(false);
  const [mutation, setMutation] = useState<MutationState>({ state: "idle" });
  const [portfolioRefreshKey, setPortfolioRefreshKey] = useState(0);
  const [rebalanceRefreshKey, setRebalanceRefreshKey] = useState(0);
  const [deletePortfolioTarget, setDeletePortfolioTarget] = useState<PortfolioConfiguration | null>(null);
  const [deleteRebalanceTarget, setDeleteRebalanceTarget] = useState<PortfolioRebalanceConfiguration | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [rebalanceFormOpen, setRebalanceFormOpen] = useState(false);
  const [editingRebalance, setEditingRebalance] = useState<PortfolioRebalanceConfiguration | null>(null);
  const [rebalanceName, setRebalanceName] = useState("");
  const [rebalanceDescription, setRebalanceDescription] = useState("");

  useEffect(() => {
    if (!portfolioFormOpen) return;
    const controller = new AbortController();
    setDependenciesLoading(true);
    setDependenciesError(null);
    Promise.all([
      api.get<ResourceCollection<SignalJobConfiguration>>(`${API_ENDPOINTS.signalJobs}?limit=100&offset=0&enabled=true&ordering=name`, controller.signal),
      api.get<ResourceCollection<BarConfiguration>>(`${API_ENDPOINTS.barConfigurations}?limit=100&offset=0&enabled=true&ordering=name`, controller.signal),
      api.get<ResourceCollection<PortfolioRebalanceConfiguration>>(`${API_ENDPOINTS.portfolioRebalanceConfigurations}?limit=100&offset=0&ordering=name`, controller.signal),
    ])
      .then(([signalResponse, barsResponse, rebalanceResponse]) => {
        setSignals(signalResponse.items);
        setBars(barsResponse.items.filter((item) => item.enabled));
        setRebalances(rebalanceResponse.items);
        setSignalConfigurationUid((current) => current || signalResponse.items[0]?.uid || "");
        setBarsConfigurationUid((current) => current || barsResponse.items.find((item) => item.enabled)?.uid || "");
        setRebalanceConfigurationUid((current) => current || rebalanceResponse.items[0]?.uid || "");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDependenciesError(formatError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDependenciesLoading(false);
      });
    return () => controller.abort();
  }, [api, portfolioFormOpen, rebalanceRefreshKey]);

  const signalOptions = useMemo<ResourcePickerOption[]>(() => signals.map((signal) => ({
    value: signal.uid,
    label: signal.name,
    subtitle: signal.signal_uid,
  })), [signals]);
  const barsOptions = useMemo<ResourcePickerOption[]>(() => bars.map((configuration) => ({
    value: configuration.uid,
    label: configuration.name,
    subtitle: `${configuration.frequency_id}/${configuration.feed}/${configuration.adjustment}`,
  })), [bars]);
  const rebalanceOptions = useMemo<ResourcePickerOption[]>(() => rebalances.map((configuration) => ({
    value: configuration.uid,
    label: configuration.name,
    subtitle: "ImmediateSignal",
  })), [rebalances]);
  const cronEditorValue = useMemo(() => ({
    mode: cronMode,
    time: cronTime,
    weekday: cronWeekday,
    monthDay: cronMonthDay,
    advancedExpression: advancedCronExpression,
  }), [advancedCronExpression, cronMode, cronMonthDay, cronTime, cronWeekday]);
  const scheduleExpression = useMemo(() => buildCronExpression(cronEditorValue), [cronEditorValue]);
  const scheduleValid = scheduleType === "interval" ? scheduleEvery > 0 : isValidCronExpression(scheduleExpression);
  const busy = mutation.state === "loading";
  const canSubmit = Boolean(
    name.trim()
    && signalConfigurationUid
    && barsConfigurationUid
    && rebalanceConfigurationUid
    && valuationColumn.trim()
    && commissionFee >= 0
    && scheduleValid
    && cpuRequest.trim()
    && memoryRequest.trim()
    && maxRuntimeSeconds > 0
    && !busy
    && !dependenciesLoading
    && !dependenciesError,
  );

  function resetPortfolioForm() {
    setEditingPortfolio(null);
    setName("");
    setDescription("");
    setSignalConfigurationUid("");
    setBarsConfigurationUid("");
    setRebalanceConfigurationUid("");
    setValuationColumn("close");
    setForwardFillToNow(false);
    setFailOnMissingPrices(true);
    setCommissionFee(0.00018);
    setScheduleType("interval");
    setScheduleEvery(1);
    setSchedulePeriod("days");
    setCronMode(DEFAULT_CRON_SCHEDULE.mode);
    setCronTime(DEFAULT_CRON_SCHEDULE.time);
    setCronWeekday(DEFAULT_CRON_SCHEDULE.weekday);
    setCronMonthDay(DEFAULT_CRON_SCHEDULE.monthDay);
    setAdvancedCronExpression(DEFAULT_CRON_SCHEDULE.advancedExpression);
    setCpuRequest("0.25");
    setMemoryRequest("0.5");
    setMaxRuntimeSeconds(3600);
    setSpot(false);
  }

  function openCreatePortfolio() {
    resetPortfolioForm();
    setPortfolioFormOpen(true);
    setMutation({ state: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEditPortfolio(item: PortfolioConfiguration) {
    setEditingPortfolio(item);
    setName(item.name);
    setDescription(item.description ?? "");
    setSignalConfigurationUid(item.signal_configuration_uid);
    setBarsConfigurationUid(item.bars_configuration_uid);
    setRebalanceConfigurationUid(item.rebalance_configuration_uid);
    setValuationColumn(item.valuation_column);
    setForwardFillToNow(item.forward_fill_to_now);
    setFailOnMissingPrices(item.fail_on_missing_prices);
    setCommissionFee(item.commission_fee);
    const job = item.job;
    setScheduleType(job?.schedule_type ?? "interval");
    setScheduleEvery(job?.schedule_every ?? 1);
    setSchedulePeriod(job?.schedule_period ?? "days");
    const cron = parseCronExpression(job?.schedule_expression ?? DEFAULT_CRON_SCHEDULE.advancedExpression);
    setCronMode(cron.mode);
    setCronTime(cron.time);
    setCronWeekday(cron.weekday);
    setCronMonthDay(cron.monthDay);
    setAdvancedCronExpression(cron.advancedExpression);
    setCpuRequest(job?.cpu_request ?? "0.25");
    setMemoryRequest(job?.memory_request ?? "0.5");
    setMaxRuntimeSeconds(job?.max_runtime_seconds ?? 3600);
    setSpot(job?.spot ?? false);
    setPortfolioFormOpen(true);
    setMutation({ state: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitPortfolio(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) {
      setMutation({ state: "error", message: "Complete the signal, bars, rebalance, calculation, schedule, and Job resource fields." });
      return;
    }
    const request: PortfolioConfigurationWriteRequest = {
      name: name.trim(),
      description: description.trim() || null,
      signal_configuration_uid: signalConfigurationUid,
      bars_configuration_uid: barsConfigurationUid,
      rebalance_configuration_uid: rebalanceConfigurationUid,
      upsample_frequency_id: "1d",
      intraday_bar_interpolation_rule: "ffill",
      valuation_column: valuationColumn.trim(),
      portfolio_prices_frequency: "1d",
      forward_fill_to_now: forwardFillToNow,
      fail_on_missing_prices: failOnMissingPrices,
      commission_fee: commissionFee,
      job: {
        schedule_type: scheduleType,
        schedule_every: scheduleType === "interval" ? scheduleEvery : null,
        schedule_period: scheduleType === "interval" ? schedulePeriod : null,
        schedule_expression: scheduleType === "crontab" ? scheduleExpression : null,
        schedule_start_time: null,
        cpu_request: cpuRequest.trim(),
        memory_request: memoryRequest.trim(),
        max_runtime_seconds: maxRuntimeSeconds,
        spot,
      },
    };
    setMutation({ state: "loading", label: editingPortfolio ? "Updating portfolio" : "Creating portfolio" });
    try {
      if (editingPortfolio) {
        await api.patch<PortfolioConfiguration>(`${API_ENDPOINTS.portfolioConfigurations}/${encodeURIComponent(editingPortfolio.uid)}`, request);
      } else {
        await api.post<PortfolioConfiguration>(API_ENDPOINTS.portfolioConfigurations, request);
      }
      const message = `${editingPortfolio ? "Updated" : "Created"} ${request.name}.`;
      resetPortfolioForm();
      setPortfolioFormOpen(false);
      setMutation({ state: "success", message });
      setPortfolioRefreshKey((current) => current + 1);
    } catch (error) {
      setMutation({ state: "error", message: formatError(error) });
    }
  }

  async function runPortfolio(item: PortfolioConfiguration) {
    setMutation({ state: "loading", label: `Starting ${item.name}` });
    try {
      const result = await api.post<PortfolioJobRunAccepted>(`${API_ENDPOINTS.portfolioConfigurations}/${encodeURIComponent(item.uid)}/actions/run`, {});
      setMutation({ state: "success", message: `${item.name}: JobRun ${result.job_run_uid} was accepted.` });
      setPortfolioRefreshKey((current) => current + 1);
    } catch (error) {
      setMutation({ state: "error", message: formatError(error) });
    }
  }

  function openCreateRebalance() {
    setEditingRebalance(null);
    setRebalanceName("");
    setRebalanceDescription("");
    setRebalanceFormOpen(true);
    setMutation({ state: "idle" });
  }

  function openEditRebalance(item: PortfolioRebalanceConfiguration) {
    setEditingRebalance(item);
    setRebalanceName(item.name);
    setRebalanceDescription(item.description ?? "");
    setRebalanceFormOpen(true);
    setMutation({ state: "idle" });
  }

  async function submitRebalance(event: FormEvent) {
    event.preventDefault();
    if (!rebalanceName.trim()) return;
    const payload = {
      name: rebalanceName.trim(),
      description: rebalanceDescription.trim() || null,
      strategy: "immediate_signal" as const,
    };
    setMutation({ state: "loading", label: editingRebalance ? "Updating rebalance configuration" : "Creating rebalance configuration" });
    try {
      if (editingRebalance) {
        await api.patch<PortfolioRebalanceConfiguration>(`${API_ENDPOINTS.portfolioRebalanceConfigurations}/${encodeURIComponent(editingRebalance.uid)}`, payload);
      } else {
        await api.post<PortfolioRebalanceConfiguration>(API_ENDPOINTS.portfolioRebalanceConfigurations, payload);
      }
      setRebalanceFormOpen(false);
      setEditingRebalance(null);
      setRebalanceName("");
      setRebalanceDescription("");
      setMutation({ state: "success", message: `${editingRebalance ? "Updated" : "Created"} ${payload.name}.` });
      setRebalanceRefreshKey((current) => current + 1);
    } catch (error) {
      setMutation({ state: "error", message: formatError(error) });
    }
  }

  async function confirmDelete() {
    if (deleteConfirmation !== "DELETE") return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      if (deletePortfolioTarget) {
        await api.delete(`${API_ENDPOINTS.portfolioConfigurations}/${encodeURIComponent(deletePortfolioTarget.uid)}`);
        setMutation({ state: "success", message: `Deleted ${deletePortfolioTarget.name}. Published portfolio observations were retained.` });
        setDeletePortfolioTarget(null);
        setPortfolioRefreshKey((current) => current + 1);
      } else if (deleteRebalanceTarget) {
        await api.delete(`${API_ENDPOINTS.portfolioRebalanceConfigurations}/${encodeURIComponent(deleteRebalanceTarget.uid)}`);
        setMutation({ state: "success", message: `Deleted ${deleteRebalanceTarget.name}.` });
        setDeleteRebalanceTarget(null);
        setRebalanceRefreshKey((current) => current + 1);
      }
      setDeleteConfirmation("");
    } catch (error) {
      setDeleteError(formatError(error));
    } finally {
      setDeletePending(false);
    }
  }

  const portfolioPrimaryActions = useMemo(() => [
    { id: "create-portfolio", label: "Create portfolio", tone: "primary" as const, disabled: portfolioFormOpen, onSelect: openCreatePortfolio },
    { id: "manage-rebalances", label: "Rebalance configurations", tone: "default" as const, onSelect: () => { setManageRebalances(true); setSelectedPortfolio(null); } },
  ], [portfolioFormOpen]);
  const portfolioRowActions = useMemo<readonly ResourceRowAction<PortfolioConfiguration>[]>(() => [
    { id: "run-portfolio", label: "Run now", disabled: (item) => item.job?.image_status !== "ready", onSelect: (item) => void runPortfolio(item) },
    { id: "edit-portfolio", label: "Edit", onSelect: openEditPortfolio },
    { id: "delete-portfolio", label: "Delete", tone: "danger", onSelect: setDeletePortfolioTarget },
  ], []);
  const rebalancePrimaryActions = useMemo(() => [
    { id: "create-rebalance", label: "Create rebalance configuration", tone: "primary" as const, disabled: rebalanceFormOpen, onSelect: openCreateRebalance },
    { id: "back-to-portfolios", label: "Back to portfolios", tone: "default" as const, onSelect: () => { setManageRebalances(false); setRebalanceFormOpen(false); } },
  ], [rebalanceFormOpen]);
  const rebalanceRowActions = useMemo<readonly ResourceRowAction<PortfolioRebalanceConfiguration>[]>(() => [
    { id: "edit-rebalance", label: "Edit", onSelect: openEditRebalance },
    { id: "delete-rebalance", label: "Delete", tone: "danger", onSelect: setDeleteRebalanceTarget },
  ], []);

  return (
    <ApplicationPage as="main" maxWidth={selectedPortfolio ? "full" : "content"}>
      <ApplicationPageStack>
        <ApplicationPageHeader
          eyebrow="Portfolios"
          title={manageRebalances ? "Rebalance Configurations" : "ETF Portfolios"}
          description={manageRebalances
            ? "Maintain reusable analytical rebalance policies. Phase 1 exposes only ImmediateSignal."
            : "Compose an existing ETF weight Signal, an Alpaca Bars Configuration, persistent interpolated prices, and an ImmediateSignal rebalance policy. Each Portfolio Configuration owns one dedicated Main Sequence Job."}
        />

        {portfolioFormOpen && !manageRebalances ? (
          <ApplicationCard header={<h2>{editingPortfolio ? "Edit portfolio" : "Create portfolio"}</h2>}>
            <form className="workflow-form" onSubmit={submitPortfolio}>
              <section className="workflow-form-section">
                <div className="workflow-form-section__header">
                  <h3>Portfolio calculation</h3>
                  <p>References are resolved at runtime. Universe, account, raw bars table UID, schedule, and compute fields are not copied into the Portfolio Configuration.</p>
                </div>
                <div className="form-grid">
                  <label className="field">Portfolio name<input value={name} onChange={(event) => setName(event.target.value)} disabled={busy} placeholder="Daily IVV analytical portfolio" /></label>
                  <label className="field field--wide">Description <span>Optional</span><textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} disabled={busy} /></label>
                  <div className="field resource-picker-field">
                    <label id="portfolio-signal-label">ETF weight Signal</label>
                    <ResourcePicker ariaLabelledBy="portfolio-signal-label" disabled={busy || dependenciesLoading} emptyMessage="No enabled ETF weight Signals." fullWidth loading={dependenciesLoading} mode="single" onValueChange={setSignalConfigurationUid} options={signalOptions} placeholder="Select an ETF weight Signal" searchable searchPlaceholder="Search Signals" value={signalConfigurationUid || null} />
                  </div>
                  <div className="field resource-picker-field">
                    <label id="portfolio-bars-label">Alpaca Bars Configuration</label>
                    <ResourcePicker ariaLabelledBy="portfolio-bars-label" disabled={busy || dependenciesLoading} emptyMessage="No enabled Bars Configurations." fullWidth loading={dependenciesLoading} mode="single" onValueChange={setBarsConfigurationUid} options={barsOptions} placeholder="Select a Bars Configuration" searchable searchPlaceholder="Search Bars Configurations" value={barsConfigurationUid || null} />
                  </div>
                  <div className="field resource-picker-field">
                    <label id="portfolio-rebalance-label">Rebalance Configuration</label>
                    <ResourcePicker ariaLabelledBy="portfolio-rebalance-label" disabled={busy || dependenciesLoading} emptyMessage="No Rebalance Configurations. Create one from the list action." fullWidth loading={dependenciesLoading} mode="single" onValueChange={setRebalanceConfigurationUid} options={rebalanceOptions} placeholder="Select an ImmediateSignal configuration" searchable searchPlaceholder="Search Rebalance Configurations" value={rebalanceConfigurationUid || null} />
                  </div>
                  <label className="field">Valuation column<input value={valuationColumn} onChange={(event) => setValuationColumn(event.target.value)} disabled={busy} /></label>
                  <label className="field">Commission fee<input type="number" min={0} step="0.00001" value={commissionFee} onChange={(event) => setCommissionFee(Number(event.target.value))} disabled={busy} /></label>
                </div>
                <fieldset className="policy-fieldset">
                  <legend>Price availability policies</legend>
                  <div className="policy-option-grid">
                    <label className="policy-option">
                      <input
                        type="checkbox"
                        checked={forwardFillToNow}
                        onChange={(event) => setForwardFillToNow(event.target.checked)}
                        disabled={busy}
                        aria-labelledby="portfolio-forward-fill-label"
                        aria-describedby="portfolio-forward-fill-help"
                      />
                      <span className="policy-option__copy">
                        <strong id="portfolio-forward-fill-label">Extend latest valuation prices to now</strong>
                        <small id="portfolio-forward-fill-help">Extend the portfolio calculation index to the current UTC time and reuse each asset&apos;s latest known valuation. This is calculation-only alignment; it does not write synthetic <strong>InterpolatedPrices</strong> rows or extend signal validity.</small>
                      </span>
                    </label>
                    <label className="policy-option">
                      <input
                        type="checkbox"
                        checked={failOnMissingPrices}
                        onChange={(event) => setFailOnMissingPrices(event.target.checked)}
                        disabled={busy}
                        aria-labelledby="portfolio-missing-prices-label"
                        aria-describedby="portfolio-missing-prices-help"
                      />
                      <span className="policy-option__copy">
                        <strong id="portfolio-missing-prices-label">Stop when a required asset has no price</strong>
                        <small id="portfolio-missing-prices-help">Fail the run when an asset required by the signal has no usable valuation observation. Leave this off to log missing coverage and continue only when the rebalance can still produce a usable portfolio frame.</small>
                      </span>
                    </label>
                  </div>
                  <p className="policy-fieldset__note"><strong>Independent policies:</strong> forward-fill handles dates after an asset has a known price; strict missing-price validation catches assets with no usable price. You may enable either or both.</p>
                </fieldset>
              </section>

              <section className="workflow-form-section">
                <div className="workflow-form-section__header"><h3>Job schedule</h3><p>The schedule is written only to the dedicated Main Sequence Job.</p></div>
                <div className="form-grid">
                  <label className="field">Scheduling method<select value={scheduleType} onChange={(event) => setScheduleType(event.target.value as SignalScheduleType)} disabled={busy}><option value="interval">Interval</option><option value="crontab">Calendar schedule</option></select></label>
                  {scheduleType === "interval" ? (
                    <>
                      <label className="field">Run every<input type="number" min={1} value={scheduleEvery} onChange={(event) => setScheduleEvery(Number(event.target.value))} disabled={busy} /></label>
                      <label className="field">Interval period<select value={schedulePeriod} onChange={(event) => setSchedulePeriod(event.target.value as SignalSchedulePeriod)} disabled={busy}><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select></label>
                    </>
                  ) : (
                    <>
                      <label className="field">Calendar pattern<select value={cronMode} onChange={(event) => setCronMode(event.target.value as CronScheduleMode)} disabled={busy}><option value="daily">Every day</option><option value="weekdays">Monday through Friday</option><option value="weekly">Once a week</option><option value="monthly">Once a month</option><option value="advanced">Advanced crontab</option></select></label>
                      {cronMode === "advanced" ? (
                        <label className="field">Five-field crontab<input aria-describedby="portfolio-cron-help" value={advancedCronExpression} onChange={(event) => setAdvancedCronExpression(event.target.value)} placeholder="0 9 * * 1-5" spellCheck={false} disabled={busy} /></label>
                      ) : (
                        <label className="field">Schedule time<input type="time" value={cronTime} onChange={(event) => setCronTime(event.target.value)} disabled={busy} /></label>
                      )}
                      {cronMode === "weekly" ? <label className="field">Day of week<select value={cronWeekday} onChange={(event) => setCronWeekday(event.target.value)} disabled={busy}>{CRON_WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</select></label> : null}
                      {cronMode === "monthly" ? <label className="field">Day of month<input type="number" min={1} max={31} value={cronMonthDay} onChange={(event) => setCronMonthDay(Number(event.target.value))} disabled={busy} /></label> : null}
                      <div className="schedule-preview field--wide" aria-live="polite"><div><span>Generated schedule</span><strong>{describeCronSchedule(cronEditorValue)}</strong></div><code>{scheduleExpression || "Invalid schedule"}</code><small id="portfolio-cron-help">Main Sequence stores a standard five-field crontab. The current Job contract does not expose a per-Job timezone.</small></div>
                    </>
                  )}
                </div>
              </section>

              <section className="workflow-form-section">
                <div className="workflow-form-section__header"><h3>Job resources</h3><p>These values are written only to the Job and are never duplicated in the Portfolio Configuration.</p></div>
                <div className="form-grid">
                  <label className="field">CPU request<input value={cpuRequest} onChange={(event) => setCpuRequest(event.target.value)} disabled={busy} /></label>
                  <label className="field">Memory request (GiB)<input value={memoryRequest} onChange={(event) => setMemoryRequest(event.target.value)} disabled={busy} /></label>
                  <label className="field">Maximum runtime (seconds)<input type="number" min={1} value={maxRuntimeSeconds} onChange={(event) => setMaxRuntimeSeconds(Number(event.target.value))} disabled={busy} /></label>
                </div>
                <label className="checkbox-field"><input type="checkbox" checked={spot} onChange={(event) => setSpot(event.target.checked)} disabled={busy} />Prefer spot capacity</label>
              </section>
              {dependenciesError ? <p className="form-error" role="alert">{dependenciesError}</p> : null}
              <aside className="workflow-guidance" aria-label="Portfolio calculation notes"><Info aria-hidden="true" size={18} /><p>Phase 1 uses a persistent daily <strong>InterpolatedPrices</strong> dependency with forward-fill interpolation for source-bar gaps, then applies observed weights through <strong>ImmediateSignal</strong>. Signal timestamps record observation time and do not guarantee exact economic effective time.</p></aside>
              <div className="form-actions"><button className="button button--primary" type="submit" disabled={!canSubmit}>{editingPortfolio ? "Save changes" : "Create portfolio"}</button><button className="button button--secondary" type="button" onClick={() => { resetPortfolioForm(); setPortfolioFormOpen(false); }} disabled={busy}>Cancel</button></div>
            </form>
          </ApplicationCard>
        ) : null}

        {rebalanceFormOpen && manageRebalances ? (
          <ApplicationCard header={<h2>{editingRebalance ? "Edit rebalance configuration" : "Create rebalance configuration"}</h2>}>
            <form className="workflow-form" onSubmit={submitRebalance}>
              <div className="form-grid">
                <label className="field">Name<input value={rebalanceName} onChange={(event) => setRebalanceName(event.target.value)} placeholder="Immediate observed weights" disabled={busy} /></label>
                <label className="field field--wide">Description <span>Optional</span><textarea rows={2} value={rebalanceDescription} onChange={(event) => setRebalanceDescription(event.target.value)} disabled={busy} /></label>
                <label className="field">Strategy<input value="ImmediateSignal" readOnly disabled /></label>
              </div>
              <div className="workflow-guidance"><Info aria-hidden="true" size={18} /><p>ImmediateSignal applies every observed signal weight frame immediately in the analytical backtest. It does not model execution delay, partial fills, volume participation, market impact, or slippage beyond the portfolio commission fee.</p></div>
              <div className="form-actions"><button className="button button--primary" type="submit" disabled={!rebalanceName.trim() || busy}>{editingRebalance ? "Save changes" : "Create configuration"}</button><button className="button button--secondary" type="button" onClick={() => setRebalanceFormOpen(false)} disabled={busy}>Cancel</button></div>
            </form>
          </ApplicationCard>
        ) : null}

        {mutation.state === "loading" ? <ApplicationStatusScreen as="section" state="loading" title={mutation.label} message="Waiting for the Alpaca Connectors API and Main Sequence Job service." variant="contained" /> : mutation.state === "error" ? <ApplicationStatusScreen as="section" state="error" title="Portfolio request failed" message={mutation.message} variant="contained" /> : mutation.state === "success" ? <section className="action-result" aria-live="polite"><div className="section-heading"><h3>{mutation.message}</h3><span className="status-pill status-pill--success">Complete</span></div></section> : null}

        {manageRebalances ? (
          <ResourceListPage definition={rebalanceDefinition} embedded pageSize={25} primaryActions={rebalancePrimaryActions} refreshable refreshKey={rebalanceRefreshKey} rowActions={rebalanceRowActions} searchPlaceholder="Search Rebalance Configurations" />
        ) : selectedPortfolio ? (
          <PortfolioDetail configuration={selectedPortfolio} onBack={() => setSelectedPortfolio(null)} />
        ) : (
          <ResourceListPage definition={portfolioDefinition} embedded pageSize={25} primaryActions={portfolioPrimaryActions} onRowActivate={setSelectedPortfolio} refreshable refreshKey={portfolioRefreshKey} rowActions={portfolioRowActions} searchPlaceholder="Search ETF Portfolios" />
        )}
      </ApplicationPageStack>

      <ResourceActionConfirmationDialog
        open={deletePortfolioTarget !== null || deleteRebalanceTarget !== null}
        actionLabel="Delete"
        title={deletePortfolioTarget ? "Delete portfolio configuration and Job" : "Delete rebalance configuration"}
        selectionLabel={deletePortfolioTarget?.name ?? deleteRebalanceTarget?.name ?? "configuration"}
        description={deletePortfolioTarget ? "Delete this dedicated Main Sequence Job and its durable Portfolio Configuration." : "Delete this reusable Rebalance Configuration."}
        warning={deletePortfolioTarget ? "Published portfolio values and weights are retained." : "Deletion is blocked while a Portfolio Configuration still references this row."}
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
          setDeletePortfolioTarget(null);
          setDeleteRebalanceTarget(null);
          setDeleteConfirmation("");
          setDeleteError(null);
        }}
        onConfirm={confirmDelete}
      />
    </ApplicationPage>
  );
}
