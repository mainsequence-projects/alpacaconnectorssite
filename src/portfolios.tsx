import { ApplicationStatusScreen } from "@dev-mainsequence/command-center-sdk/feedback";
import {
  ApplicationCard,
  ApplicationCardGrid,
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
  getThemeCategoricalColor,
  mainSequenceTheme,
  quartzLightTheme,
  resolveCommandCenterThemeById,
  resolveThemeDataVizPalette,
} from "@dev-mainsequence/command-center-sdk/theme";
import { BriefcaseBusiness, Info, Repeat2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  API_ENDPOINTS,
  createApiClient,
  formatSharedJobSchedule,
  US_EQUITY_REBALANCE_CALENDAR,
  type ApiTransport,
  type BarConfiguration,
  type PortfolioConfiguration,
  type PortfolioConfigurationDetail,
  type PortfolioConfigurationWriteRequest,
  type PortfolioJobRunAccepted,
  type PortfolioValueObservation,
  type PortfolioRebalanceCadence,
  type PortfolioRebalanceCalendarEvent,
  type PortfolioRebalanceConfiguration,
  type PortfolioRebalanceConfigurationWriteRequest,
  type PortfolioRebalanceEvent,
  type PortfolioRebalanceStrategy,
  type ResourceCollection,
  type SignalJobConfiguration,
} from "./api";
import { RequestErrorDialog, RequestProgressDialog } from "./requestFeedback";

type MutationState =
  | { state: "idle" }
  | { state: "loading"; label: string }
  | { state: "error"; message: string }
  | { state: "success"; message: string };

type PortfolioSection = "portfolios" | "rebalances";

const DEFAULT_COMMISSION_PERCENTAGE = "0.018";
/** The connector's default maximum valuation staleness: one day. */
const DEFAULT_VALUATION_MAXIMUM_STALENESS_SECONDS = "86400";
const PORTFOLIO_OBSERVATION_LIMIT = 2_500;
const REBALANCE_STRATEGY_LABEL = "CalendarEventSignal";
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
/** NYSE regular sessions fall on Monday through Friday only. */
const US_EQUITY_SESSION_WEEKDAYS = [0, 1, 2, 3, 4] as const;
const REBALANCE_EVENT_LABELS: Record<PortfolioRebalanceEvent, string> = {
  market_open: "market open",
  market_close: "market close",
};

function formatCommissionPercentage(commissionFee: number): string {
  return String(Number((commissionFee * 100).toFixed(10)));
}

/** Parses a whole number of seconds as the API's integer fields require; null when invalid. */
function parseWholeSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** A duration such as "1 day", "15 min", or "1 h 30 min"; the sign is ignored. */
function formatDuration(totalSeconds: number): string {
  const seconds = Math.abs(totalSeconds);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  const parts = [
    days ? `${days} ${days === 1 ? "day" : "days"}` : null,
    hours ? `${hours} h` : null,
    minutes ? `${minutes} min` : null,
    remainder ? `${remainder} s` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" ") : "0 s";
}

function formatWeekday(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? `Weekday ${weekday}`;
}

function formatRebalanceCalendar(
  schedule: Pick<PortfolioRebalanceCalendarEvent, "calendar_identifier" | "session_label">,
): string {
  return `${schedule.calendar_identifier} · ${schedule.session_label} session`;
}

/** "At market close", or the signed offset from the event, such as "15 min before market close". */
function formatRebalanceEvent(event: PortfolioRebalanceEvent, offsetSeconds: number): string {
  const label = REBALANCE_EVENT_LABELS[event];
  if (offsetSeconds === 0) return `At ${label}`;
  return `${formatDuration(offsetSeconds)} ${offsetSeconds < 0 ? "before" : "after"} ${label}`;
}

function formatRebalanceCadence(cadence: PortfolioRebalanceCadence, weekday: number): string {
  return cadence === "weekly" ? `Weekly on ${formatWeekday(weekday)}` : "Every session";
}

function describeRebalanceSchedule(schedule: PortfolioRebalanceCalendarEvent): string {
  const event = formatRebalanceEvent(schedule.rebalance_event, schedule.event_offset_seconds);
  const timing = `${event.charAt(0).toLowerCase()}${event.slice(1)}`;
  const sessions = `${schedule.calendar_identifier} ${schedule.session_label} session`;
  return schedule.rebalance_cadence === "weekly"
    ? `Rebalances ${timing} of each ${sessions} that falls on a ${formatWeekday(schedule.rebalance_weekday)}.`
    : `Rebalances ${timing} of every ${sessions}.`;
}

function isUsEquityCalendar(
  schedule: Pick<PortfolioRebalanceCalendarEvent, "calendar_identifier" | "session_label">,
): boolean {
  return schedule.calendar_identifier === US_EQUITY_REBALANCE_CALENDAR.calendar_identifier
    && schedule.session_label === US_EQUITY_REBALANCE_CALENDAR.session_label;
}

/** Rebalance form state; numeric inputs stay strings until they are validated. */
interface RebalanceDraft {
  name: string;
  description: string;
  strategy: PortfolioRebalanceStrategy;
  calendarIdentifier: string;
  sessionLabel: string;
  event: PortfolioRebalanceEvent;
  offsetSeconds: string;
  cadence: PortfolioRebalanceCadence;
  weekday: number;
}

function newRebalanceDraft(): RebalanceDraft {
  return {
    name: "",
    description: "",
    strategy: "calendar_event_signal",
    calendarIdentifier: US_EQUITY_REBALANCE_CALENDAR.calendar_identifier,
    sessionLabel: US_EQUITY_REBALANCE_CALENDAR.session_label,
    event: "market_close",
    offsetSeconds: "0",
    cadence: "every_session",
    weekday: 0,
  };
}

/** Editing keeps the stored calendar and session; the form never rewrites them. */
function rebalanceDraftFromConfiguration(configuration: PortfolioRebalanceConfiguration): RebalanceDraft {
  return {
    name: configuration.name,
    description: configuration.description ?? "",
    strategy: configuration.strategy,
    calendarIdentifier: configuration.calendar_identifier,
    sessionLabel: configuration.session_label,
    event: configuration.rebalance_event,
    offsetSeconds: String(configuration.event_offset_seconds),
    cadence: configuration.rebalance_cadence,
    weekday: configuration.rebalance_weekday,
  };
}

/** The draft's calendar-event fields; null while the offset is not a whole number of seconds. */
function rebalanceScheduleFromDraft(draft: RebalanceDraft): PortfolioRebalanceCalendarEvent | null {
  const offsetSeconds = parseWholeSeconds(draft.offsetSeconds);
  if (offsetSeconds === null) return null;
  return {
    calendar_identifier: draft.calendarIdentifier,
    session_label: draft.sessionLabel,
    rebalance_event: draft.event,
    event_offset_seconds: offsetSeconds,
    rebalance_cadence: draft.cadence,
    // The weekday applies only to weekly cadence; every-session policies store the default.
    rebalance_weekday: draft.cadence === "weekly" ? draft.weekday : 0,
  };
}

/** The exact create (and edit PATCH) body; null while the draft is incomplete or invalid. */
function rebalanceWriteRequest(draft: RebalanceDraft): PortfolioRebalanceConfigurationWriteRequest | null {
  const name = draft.name.trim();
  const schedule = rebalanceScheduleFromDraft(draft);
  if (!name || !schedule) return null;
  return {
    name,
    description: draft.description.trim() || null,
    strategy: draft.strategy,
    ...schedule,
  };
}

function formatPortfolioValue(value: number | null): string {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatReturn(value: number | null): string {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatRatio(value: number | null): string {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string | null): string {
  if (!value) return "Unavailable";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.valueOf()) ? value : timestamp.toLocaleString();
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "Not specified";
  return `${start ?? "Open start"} – ${end ?? "Open end"}`;
}

function formatPerformanceWindow(start: string | null, end: string | null): string {
  if (!start || !end) return "Unavailable";
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf())) {
    return `${start} – ${end}`;
  }
  return `${startDate.toLocaleDateString()} – ${endDate.toLocaleDateString()}`;
}

function formatEnvironment(value: "paper" | "live"): string {
  return value === "paper" ? "Paper" : "Live";
}

function usePortfolioChartColor(): string {
  const [themeRevision, setThemeRevision] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeRevision((value) => value + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme-id", "data-theme-mode"],
    });
    return () => observer.disconnect();
  }, []);

  return useMemo(() => {
    const root = document.documentElement;
    const theme = resolveCommandCenterThemeById(root.dataset.themeId ?? "")
      ?? (root.dataset.themeMode === "dark" ? mainSequenceTheme : quartzLightTheme);
    return getThemeCategoricalColor(
      resolveThemeDataVizPalette(theme, theme.tokens),
      0,
    );
  }, [themeRevision]);
}

const REBALANCE_STRATEGY_OPTIONS: ResourcePickerOption[] = [
  {
    value: "calendar_event_signal",
    label: "Calendar Event Signal",
    subtitle: "Execute the latest observed weights at each selected session event",
  },
];

function formatError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "Request cancelled.";
  return error instanceof Error ? error.message : "The request failed unexpectedly.";
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
    description: "Durable analytical portfolios composed from ETF weight signals, Alpaca bars, and CalendarEventSignal rebalance configurations.",
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
        renderCell: () => <ResourceStatusCell label={REBALANCE_STRATEGY_LABEL} tone="neutral" />,
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
    description: "Reusable calendar-event rebalance policies: the latest observed ETF weights execute at selected NYSE session events.",
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
        renderCell: () => <ResourceStatusCell label={REBALANCE_STRATEGY_LABEL} tone="neutral" />,
      },
      {
        id: "calendar-identifier",
        header: "Calendar",
        getValue: (configuration) => formatRebalanceCalendar(configuration),
      },
      {
        id: "rebalance-event",
        header: "Market Event",
        getValue: (configuration) => formatRebalanceEvent(
          configuration.rebalance_event,
          configuration.event_offset_seconds,
        ),
      },
      {
        id: "rebalance-cadence",
        header: "Cadence",
        getValue: (configuration) => formatRebalanceCadence(
          configuration.rebalance_cadence,
          configuration.rebalance_weekday,
        ),
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

interface PortfolioChartPoint {
  observation: PortfolioValueObservation;
  timestamp: number;
  value: number;
}

function PortfolioValueChart({ observations }: { observations: PortfolioValueObservation[] }) {
  const seriesColor = usePortfolioChartColor();
  const points = useMemo<PortfolioChartPoint[]>(() => observations.flatMap((observation) => {
    const value = observation.close ?? observation.calculated_close;
    const timestamp = new Date(observation.time_index).valueOf();
    if (value === null || !Number.isFinite(value) || !Number.isFinite(timestamp)) return [];
    return [{ observation, timestamp, value }];
  }), [observations]);

  if (points.length === 0) {
    return (
      <div className="portfolio-chart__empty">
        <p>No portfolio values have been published yet.</p>
        <span>Run the portfolio Job to produce the first analytical observation.</span>
      </div>
    );
  }

  const width = 960;
  const height = 220;
  const paddingX = 24;
  const paddingY = 20;
  const values = points.map((point) => point.value);
  const minimumValue = Math.min(...values);
  const maximumValue = Math.max(...values);
  const valuePadding = maximumValue === minimumValue
    ? Math.max(Math.abs(maximumValue) * 0.01, 1)
    : (maximumValue - minimumValue) * 0.08;
  const chartMinimum = minimumValue - valuePadding;
  const chartMaximum = maximumValue + valuePadding;
  const firstTimestamp = points[0].timestamp;
  const lastTimestamp = points[points.length - 1].timestamp;
  const timestampSpan = Math.max(lastTimestamp - firstTimestamp, 1);
  const chartPoints = points.map((point, index) => {
    const x = points.length === 1
      ? width / 2
      : paddingX + ((point.timestamp - firstTimestamp) / timestampSpan) * (width - paddingX * 2);
    const y = paddingY + ((chartMaximum - point.value) / (chartMaximum - chartMinimum)) * (height - paddingY * 2);
    return { ...point, index, x, y };
  });
  const polyline = chartPoints.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${chartPoints[0].x.toFixed(2)},${(height - paddingY).toFixed(2)} ${polyline} ${chartPoints[chartPoints.length - 1].x.toFixed(2)},${(height - paddingY).toFixed(2)}`;
  const drawdownPoints = chartPoints.flatMap((point) => point.observation.drawdown === null
    ? []
    : [{ ...point, drawdown: point.observation.drawdown }]);
  const drawdownHeight = 90;
  const minimumDrawdown = Math.min(...drawdownPoints.map((point) => point.drawdown), 0);
  const drawdownScaleMinimum = minimumDrawdown < 0 ? minimumDrawdown : -0.001;
  const drawdownPolyline = drawdownPoints.map((point) => {
    const y = paddingY / 2
      + ((0 - point.drawdown) / (0 - drawdownScaleMinimum)) * (drawdownHeight - paddingY);
    return `${point.x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const drawdownArea = drawdownPoints.length === 0
    ? ""
    : `${drawdownPoints[0].x.toFixed(2)},${(paddingY / 2).toFixed(2)} ${drawdownPolyline} ${drawdownPoints[drawdownPoints.length - 1].x.toFixed(2)},${(paddingY / 2).toFixed(2)}`;

  return (
    <figure className="portfolio-chart" data-portfolio-value-chart>
      <div className="portfolio-chart__plot">
        <svg
          className="portfolio-chart__svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Portfolio value across ${points.length} observations`}
          preserveAspectRatio="none"
        >
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              className="portfolio-chart__grid-line"
              key={ratio}
              x1={paddingX}
              x2={width - paddingX}
              y1={paddingY + ratio * (height - paddingY * 2)}
              y2={paddingY + ratio * (height - paddingY * 2)}
            />
          ))}
          <polygon points={area} fill={seriesColor} opacity="0.12" />
          <polyline
            points={polyline}
            fill="none"
            stroke={seriesColor}
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {chartPoints.length <= 20 ? chartPoints.map((point) => (
            <circle key={`${point.observation.time_index}-${point.index}`} cx={point.x} cy={point.y} r="4" fill={seriesColor}>
              <title>{`${formatDateTime(point.observation.time_index)}: ${formatPortfolioValue(point.value)}`}</title>
            </circle>
          )) : null}
        </svg>
      </div>
      {drawdownPoints.length > 0 ? (
        <div className="portfolio-chart__drawdown">
          <div className="portfolio-chart__subheading">
            <span>Drawdown</span>
            <strong>{formatReturn(minimumDrawdown)}</strong>
          </div>
          <svg
            className="portfolio-chart__drawdown-svg"
            viewBox={`0 0 ${width} ${drawdownHeight}`}
            role="img"
            aria-label={`Portfolio drawdown across ${drawdownPoints.length} observations`}
            preserveAspectRatio="none"
          >
            <line className="portfolio-chart__grid-line" x1={paddingX} x2={width - paddingX} y1={paddingY / 2} y2={paddingY / 2} />
            <polygon className="portfolio-chart__drawdown-area" points={drawdownArea} />
            <polyline className="portfolio-chart__drawdown-line" points={drawdownPolyline} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
      ) : null}
      <figcaption className="portfolio-chart__caption">
        <span>{formatDateTime(points[0].observation.time_index)}</span>
        <span>{formatDateTime(points[points.length - 1].observation.time_index)}</span>
      </figcaption>
    </figure>
  );
}

function PortfolioDetail({
  configuration,
  transport,
  onBack,
  onChanged,
}: {
  configuration: PortfolioConfiguration;
  transport: ApiTransport;
  onBack: () => void;
  onChanged: () => void;
}) {
  const api = useMemo(() => createApiClient(transport), [transport]);
  const [detail, setDetail] = useState<PortfolioConfigurationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);
  const [schedulePending, setSchedulePending] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setLoading(true);
    setError(null);
    api.get<PortfolioConfigurationDetail>(
      `${API_ENDPOINTS.portfolioConfigurations}/${encodeURIComponent(configuration.uid)}?observation_limit=${PORTFOLIO_OBSERVATION_LIMIT}`,
      controller.signal,
    )
      .then(setDetail)
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) {
          setError(formatError(requestError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, configuration.uid, retryRevision]);

  const resolved = detail ?? configuration;
  const canonicalPortfolio = detail?.canonical_portfolio;

  async function toggleScheduled() {
    const scheduled = !resolved.scheduled;
    setSchedulePending(true);
    setScheduleNotice(null);
    setScheduleError(null);
    try {
      await api.patch<PortfolioConfiguration>(
        `${API_ENDPOINTS.portfolioConfigurations}/${encodeURIComponent(configuration.uid)}`,
        { scheduled },
      );
      setScheduleNotice(scheduled
        ? "Portfolio included in the scheduled run."
        : "Portfolio left out of the scheduled run.");
      setRetryRevision((value) => value + 1);
      onChanged();
    } catch (requestError) {
      setScheduleError(formatError(requestError));
    } finally {
      setSchedulePending(false);
    }
  }

  const latestRun = resolved.latest_run_at
    ? `${resolved.latest_run_status ?? "Unknown"} · ${formatDateTime(resolved.latest_run_at)}`
    : "Never";

  return (
    <ResourceDetailShell<PortfolioConfigurationDetail>
      embedded
      breadcrumbs={[
        { id: "portfolios", label: "ETF Portfolios", onSelect: onBack },
        { id: configuration.uid, label: configuration.name },
      ]}
      loading={loading}
      loadingTitle="Loading portfolio details…"
      loadingDescription="Resolving its construction, execution settings, and up to 2,500 daily values for performance analysis."
      error={error ? (
        <ApplicationStatusScreen
          as="section"
          state="error"
          title="Portfolio details unavailable"
          message={error}
          variant="contained"
          action={{ label: "Retry", onSelect: () => setRetryRevision((value) => value + 1) }}
        />
      ) : undefined}
      headerActions={(
        <>
          <button className="button button--secondary" type="button" onClick={() => void toggleScheduled()} disabled={schedulePending || loading}>
            {resolved.scheduled ? "Pause" : "Resume"}
          </button>
          <button className="button button--secondary" type="button" onClick={onBack}>
            Back to portfolios
          </button>
        </>
      )}
      summary={(
        <EntitySummary
          summary={{
            entity: {
              id: configuration.uid,
              type: "Analytical ETF portfolio",
              title: resolved.name,
            },
            badges: [
              { key: "strategy", label: REBALANCE_STRATEGY_LABEL, tone: "default" },
              {
                key: "materialization",
                label: canonicalPortfolio?.materialized ? "Materialized" : "Awaiting first run",
                tone: canonicalPortfolio?.materialized ? "success" : "default",
              },
            ],
            inline_fields: [
              { key: "signal", label: "Signal", value: detail?.linked_signal.name ?? "Loading" },
              { key: "bars", label: "Valuation source", value: detail?.linked_bars.name ?? "Loading" },
              { key: "scheduled", label: "Scheduled run", value: resolved.scheduled ? "Included" : "Paused" },
              { key: "schedule", label: "Shared Job schedule", value: formatSharedJobSchedule(resolved.job) },
              { key: "latest-run", label: "Latest run", value: latestRun },
            ],
            highlight_fields: [],
            stats: [
              {
                key: "observations",
                label: "Historical values",
                value: canonicalPortfolio?.total_observation_count ?? 0,
                display: String(canonicalPortfolio?.total_observation_count ?? 0),
              },
              {
                key: "total-return",
                label: "Total return",
                value: canonicalPortfolio?.performance.total_return ?? 0,
                display: formatReturn(canonicalPortfolio?.performance.total_return ?? null),
              },
              {
                key: "max-drawdown",
                label: "Max drawdown",
                value: canonicalPortfolio?.performance.max_drawdown ?? 0,
                display: formatReturn(canonicalPortfolio?.performance.max_drawdown ?? null),
              },
              {
                key: "commission",
                label: "Commission fee",
                value: resolved.commission_fee,
                display: `${formatCommissionPercentage(resolved.commission_fee)}%`,
              },
            ],
          }}
        />
      )}
    >
      {scheduleNotice ? <p className="muted" role="status">{scheduleNotice}</p> : null}
      {scheduleError ? <p className="form-error" role="alert">{scheduleError}</p> : null}
      {detail ? (
        <div className="portfolio-detail-stack">
          <ApplicationCard
            header={(
              <div className="portfolio-chart__header">
                <div>
                  <h2>Historical performance</h2>
                  <p>{detail.canonical_portfolio.observation_count > 0
                    ? `${detail.canonical_portfolio.history_window_truncated ? "Latest" : "All"} ${detail.canonical_portfolio.observation_count} of ${detail.canonical_portfolio.total_observation_count} published daily observations.`
                    : "No published daily observations yet."}</p>
                </div>
                <div className="portfolio-chart__latest">
                  <span>Latest</span>
                  <strong>{formatPortfolioValue(detail.canonical_portfolio.latest_close)}</strong>
                  <small>{detail.canonical_portfolio.latest_period_return === null
                    ? "No period return yet"
                    : `${formatReturn(detail.canonical_portfolio.latest_period_return)} period return`}</small>
                </div>
              </div>
            )}
          >
            <PortfolioValueChart observations={detail.canonical_portfolio.observations} />
            <div className="portfolio-performance-metrics" aria-label="Portfolio performance statistics">
              {[
                ["Total return", formatReturn(detail.canonical_portfolio.performance.total_return), "Compounded return over the displayed history."],
                ["Annualized return", formatReturn(detail.canonical_portfolio.performance.annualized_return), "Compounded return annualized at 252 trading periods."],
                ["Annualized volatility", formatReturn(detail.canonical_portfolio.performance.annualized_volatility), "Standard deviation of daily returns, annualized."],
                ["Sharpe ratio", formatRatio(detail.canonical_portfolio.performance.sharpe_ratio), "Annualized excess return per unit of volatility; 0% risk-free rate."],
                ["Sortino ratio", formatRatio(detail.canonical_portfolio.performance.sortino_ratio), "Annualized return relative to downside deviation only."],
                ["Maximum drawdown", formatReturn(detail.canonical_portfolio.performance.max_drawdown), "Largest peak-to-trough decline in the displayed history."],
              ].map(([label, value, explanation]) => (
                <div className="portfolio-performance-metric" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{explanation}</small>
                </div>
              ))}
            </div>
            <dl className="portfolio-performance-secondary">
              <div><dt>Calmar ratio</dt><dd>{formatRatio(detail.canonical_portfolio.performance.calmar_ratio)}</dd></div>
              <div><dt>Best daily return</dt><dd>{formatReturn(detail.canonical_portfolio.performance.best_period_return)}</dd></div>
              <div><dt>Worst daily return</dt><dd>{formatReturn(detail.canonical_portfolio.performance.worst_period_return)}</dd></div>
              <div><dt>Positive periods</dt><dd>{formatReturn(detail.canonical_portfolio.performance.positive_period_ratio)}</dd></div>
              <div><dt>Return observations</dt><dd>{detail.canonical_portfolio.performance.return_observation_count}</dd></div>
              <div><dt>Statistics window</dt><dd>{formatPerformanceWindow(detail.canonical_portfolio.performance.period_start, detail.canonical_portfolio.performance.period_end)}</dd></div>
            </dl>
            <p className="portfolio-performance-methodology">
              Calculated by Empyrical from daily portfolio values using {detail.canonical_portfolio.performance.annualization_factor} periods per year and a {formatReturn(detail.canonical_portfolio.performance.risk_free_rate)} risk-free rate. No benchmark is configured, so alpha and beta are not reported.
            </p>
          </ApplicationCard>

          <section className="portfolio-detail-panels" aria-label="Portfolio configuration details">
            <details className="portfolio-detail-panel" open>
              <summary className="portfolio-detail-panel__summary">
                <span>
                  <h2>Portfolio construction</h2>
                  <p>Signal lineage and rebalance policy</p>
                </span>
                <span className="portfolio-detail-panel__hint">Signal + rebalance</span>
              </summary>
              <div className="portfolio-detail-panel__content">
                <section className="portfolio-detail-subpanel">
                  <h3>Signal</h3>
                  <dl className="portfolio-detail-tree">
                    <div><dt>Signal</dt><dd>{detail.linked_signal.name}</dd></div>
                    <div><dt>Signal description</dt><dd>{detail.linked_signal.description ?? "No description"}</dd></div>
                    <div><dt>Universe</dt><dd>{detail.linked_signal.universe_name} ({detail.linked_signal.universe_symbol})</dd></div>
                    <div><dt>Signal runtime account</dt><dd>{detail.linked_signal.account_name} · {formatEnvironment(detail.linked_signal.account_environment)}</dd></div>
                  </dl>
                </section>
                <section className="portfolio-detail-subpanel">
                  <h3>Rebalance</h3>
                  <dl className="portfolio-detail-tree">
                    <div><dt>Rebalance policy</dt><dd>{detail.linked_rebalance.name}</dd></div>
                    <div><dt>Rebalance strategy</dt><dd>{REBALANCE_STRATEGY_LABEL}</dd></div>
                    <div><dt>Rebalance calendar</dt><dd>{formatRebalanceCalendar(detail.linked_rebalance)}</dd></div>
                    <div><dt>Rebalance event</dt><dd>{formatRebalanceEvent(detail.linked_rebalance.rebalance_event, detail.linked_rebalance.event_offset_seconds)}</dd></div>
                    <div><dt>Rebalance cadence</dt><dd>{formatRebalanceCadence(detail.linked_rebalance.rebalance_cadence, detail.linked_rebalance.rebalance_weekday)}</dd></div>
                    <div><dt>Rebalance description</dt><dd>{detail.linked_rebalance.description ?? "No description"}</dd></div>
                    <div><dt>Portfolio description</dt><dd>{detail.canonical_portfolio.description ?? detail.description ?? "No description"}</dd></div>
                  </dl>
                </section>
              </div>
            </details>

            <details className="portfolio-detail-panel">
              <summary className="portfolio-detail-panel__summary">
                <span>
                  <h2>Valuation source</h2>
                  <p>Bars profile and interpolation strategy</p>
                </span>
                <span className="portfolio-detail-panel__hint">Bars + pricing</span>
              </summary>
              <div className="portfolio-detail-panel__content">
                <section className="portfolio-detail-subpanel">
                  <h3>Alpaca bars</h3>
                  <dl className="portfolio-detail-tree">
                    <div><dt>Bars configuration</dt><dd>{detail.linked_bars.name}</dd></div>
                    <div><dt>Bars description</dt><dd>{detail.linked_bars.description ?? "No description"}</dd></div>
                    <div><dt>Source account</dt><dd>{detail.linked_bars.account_name} · {formatEnvironment(detail.linked_bars.account_environment)}</dd></div>
                    <div><dt>Asset scope</dt><dd>{detail.linked_bars.asset_source_name}{detail.linked_bars.asset_count === null ? "" : ` · ${detail.linked_bars.asset_count} assets`}</dd></div>
                    <div><dt>Bars profile</dt><dd>{detail.linked_bars.frequency_id} · {detail.linked_bars.feed.toUpperCase()} · {detail.linked_bars.adjustment} adjusted</dd></div>
                  </dl>
                </section>
                <section className="portfolio-detail-subpanel">
                  <h3>Interpolation and valuation alignment</h3>
                  <dl className="portfolio-detail-tree">
                    <div><dt>Persistent interpolation</dt><dd>{detail.upsample_frequency_id} · forward fill</dd></div>
                    <div><dt>Maximum price staleness</dt><dd>{formatDuration(detail.valuation_maximum_staleness_seconds)} ({detail.valuation_maximum_staleness_seconds} seconds)</dd></div>
                    <div><dt>Portfolio value column</dt><dd>{detail.canonical_portfolio.backtest_price_column ?? detail.valuation_column}</dd></div>
                  </dl>
                </section>
              </div>
            </details>

            <details className="portfolio-detail-panel">
              <summary className="portfolio-detail-panel__summary">
                <span>
                  <h2>Execution and calendar</h2>
                  <p>Shared portfolio Job, deployment, and run observability</p>
                </span>
                <span className="portfolio-detail-panel__hint">Shared Job</span>
              </summary>
              <div className="portfolio-detail-panel__content">
                <section className="portfolio-detail-subpanel">
                  <h3>Shared portfolio Job</h3>
                  <dl className="portfolio-detail-tree">
                    <div><dt>Scheduled run</dt><dd>{detail.scheduled ? "Included" : "Paused"}</dd></div>
                    <div><dt>Schedule</dt><dd>{formatSharedJobSchedule(detail.job)}</dd></div>
                    <div><dt>Latest run</dt><dd>{latestRun}</dd></div>
                    <div><dt>Job resources</dt><dd>{detail.job ? `${detail.job.cpu_request ?? "Default"} CPU · ${detail.job.memory_request ?? "Default"} GiB · ${detail.job.max_runtime_seconds ?? "Default"} seconds${detail.job.spot ? " · spot" : ""}` : "Job not deployed on this branch yet"}</dd></div>
                    <div><dt>Deployment</dt><dd>{detail.job ? `${detail.job.image_status ?? "Unknown image status"} · ${detail.job.automatic_deployment ? "automatic" : "manual"}` : "Job not deployed on this branch yet"}</dd></div>
                    <div><dt>Latest portfolio observation</dt><dd>{formatDateTime(detail.canonical_portfolio.latest_observation_at)}</dd></div>
                  </dl>
                </section>
                <section className="portfolio-detail-subpanel">
                  <h3>Calendar and quality controls</h3>
                  <dl className="portfolio-detail-tree">
                    <div><dt>Calendar</dt><dd>{detail.canonical_portfolio.calendar_name ?? "Not materialized"}{detail.canonical_portfolio.calendar_type ? ` · ${detail.canonical_portfolio.calendar_type}` : ""}</dd></div>
                    <div><dt>Calendar timezone</dt><dd>{detail.canonical_portfolio.calendar_timezone ?? "Not specified"}</dd></div>
                    <div><dt>Calendar validity</dt><dd>{formatDateRange(detail.canonical_portfolio.calendar_valid_from, detail.canonical_portfolio.calendar_valid_to)}</dd></div>
                    <div><dt>Missing-price policy</dt><dd>{detail.fail_on_missing_prices ? "Stop when a required asset has no price within the staleness limit" : "Continue without a missing price"}</dd></div>
                    <div><dt>Configuration created</dt><dd>{formatDateTime(detail.created_at)}</dd></div>
                    <div><dt>Configuration updated</dt><dd>{formatDateTime(detail.updated_at)}</dd></div>
                  </dl>
                </section>
              </div>
            </details>
          </section>

          <aside className="workflow-guidance" aria-label="Portfolio analytical limitation">
            <Info aria-hidden="true" size={18} />
            <p>This is an analytical calendar-executed reconstruction. At each configured session event it applies the latest ETF weights observed at or before that event; it does not claim perfect point-in-time holdings or model execution latency, fills, impact, or slippage beyond the configured commission fee.</p>
          </aside>
        </div>
      ) : null}
    </ResourceDetailShell>
  );
}

export function PortfoliosPage({
  transport,
  section = "portfolios",
}: {
  transport: ApiTransport;
  section?: PortfolioSection;
}) {
  const api = useMemo(() => createApiClient(transport), [transport]);
  const portfolioDefinition = useMemo(() => buildPortfolioResource(transport), [transport]);
  const rebalanceDefinition = useMemo(() => buildRebalanceResource(transport), [transport]);
  const manageRebalances = section === "rebalances";
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
  const [maximumStalenessSeconds, setMaximumStalenessSeconds] = useState(DEFAULT_VALUATION_MAXIMUM_STALENESS_SECONDS);
  const [failOnMissingPrices, setFailOnMissingPrices] = useState(true);
  const [commissionPercentage, setCommissionPercentage] = useState(DEFAULT_COMMISSION_PERCENTAGE);
  const [scheduled, setScheduled] = useState(true);
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
  const [rebalanceDraft, setRebalanceDraft] = useState<RebalanceDraft>(newRebalanceDraft);
  const rebalanceSchedule = useMemo(() => rebalanceScheduleFromDraft(rebalanceDraft), [rebalanceDraft]);
  const rebalanceRequest = useMemo(() => rebalanceWriteRequest(rebalanceDraft), [rebalanceDraft]);
  const rebalanceWeekdayOptions = useMemo<number[]>(() => {
    if (!isUsEquityCalendar({ calendar_identifier: rebalanceDraft.calendarIdentifier, session_label: rebalanceDraft.sessionLabel })) {
      return WEEKDAY_NAMES.map((_, weekday) => weekday);
    }
    const sessionWeekdays: number[] = [...US_EQUITY_SESSION_WEEKDAYS];
    // Keep a stored weekend weekday visible instead of silently replacing it.
    return sessionWeekdays.includes(rebalanceDraft.weekday) ? sessionWeekdays : [...sessionWeekdays, rebalanceDraft.weekday];
  }, [rebalanceDraft.calendarIdentifier, rebalanceDraft.sessionLabel, rebalanceDraft.weekday]);

  function updateRebalanceDraft(changes: Partial<RebalanceDraft>) {
    setRebalanceDraft((current) => ({ ...current, ...changes }));
  }

  useEffect(() => {
    if (!portfolioFormOpen) return;
    const controller = new AbortController();
    setDependenciesLoading(true);
    setDependenciesError(null);
    Promise.all([
      api.get<ResourceCollection<SignalJobConfiguration>>(`${API_ENDPOINTS.signalJobs}?limit=100&offset=0&scheduled=true&ordering=name`, controller.signal),
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
    subtitle: [
      configuration.calendar_identifier,
      formatRebalanceEvent(configuration.rebalance_event, configuration.event_offset_seconds),
      formatRebalanceCadence(configuration.rebalance_cadence, configuration.rebalance_weekday),
    ].join(" · "),
  })), [rebalances]);
  const parsedCommissionPercentage = Number(commissionPercentage);
  const commissionValid = commissionPercentage.trim() !== ""
    && Number.isFinite(parsedCommissionPercentage)
    && parsedCommissionPercentage >= 0;
  const parsedMaximumStalenessSeconds = parseWholeSeconds(maximumStalenessSeconds);
  const maximumStalenessValid = parsedMaximumStalenessSeconds !== null && parsedMaximumStalenessSeconds > 0;
  const busy = mutation.state === "loading";
  const canSubmit = Boolean(
    name.trim()
    && signalConfigurationUid
    && barsConfigurationUid
    && rebalanceConfigurationUid
    && valuationColumn.trim()
    && commissionValid
    && maximumStalenessValid
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
    setMaximumStalenessSeconds(DEFAULT_VALUATION_MAXIMUM_STALENESS_SECONDS);
    setFailOnMissingPrices(true);
    setCommissionPercentage(DEFAULT_COMMISSION_PERCENTAGE);
    setScheduled(true);
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
    setMaximumStalenessSeconds(String(item.valuation_maximum_staleness_seconds));
    setFailOnMissingPrices(item.fail_on_missing_prices);
    setCommissionPercentage(formatCommissionPercentage(item.commission_fee));
    setScheduled(item.scheduled);
    setPortfolioFormOpen(true);
    setMutation({ state: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitPortfolio(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit || parsedMaximumStalenessSeconds === null) {
      setMutation({ state: "error", message: "Complete the signal, bars, rebalance, and calculation fields." });
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
      valuation_maximum_staleness_seconds: parsedMaximumStalenessSeconds,
      fail_on_missing_prices: failOnMissingPrices,
      commission_fee: parsedCommissionPercentage / 100,
      scheduled,
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
    setRebalanceDraft(newRebalanceDraft());
    setRebalanceFormOpen(true);
    setMutation({ state: "idle" });
  }

  function openEditRebalance(item: PortfolioRebalanceConfiguration) {
    setEditingRebalance(item);
    setRebalanceDraft(rebalanceDraftFromConfiguration(item));
    setRebalanceFormOpen(true);
    setMutation({ state: "idle" });
  }

  async function submitRebalance(event: FormEvent) {
    event.preventDefault();
    if (!rebalanceRequest) return;
    const payload = rebalanceRequest;
    setMutation({ state: "loading", label: editingRebalance ? "Updating rebalance configuration" : "Creating rebalance configuration" });
    try {
      if (editingRebalance) {
        await api.patch<PortfolioRebalanceConfiguration>(`${API_ENDPOINTS.portfolioRebalanceConfigurations}/${encodeURIComponent(editingRebalance.uid)}`, payload);
      } else {
        await api.post<PortfolioRebalanceConfiguration>(API_ENDPOINTS.portfolioRebalanceConfigurations, payload);
      }
      setRebalanceFormOpen(false);
      setEditingRebalance(null);
      setRebalanceDraft(newRebalanceDraft());
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
  ], [portfolioFormOpen]);
  const portfolioRowActions = useMemo<readonly ResourceRowAction<PortfolioConfiguration>[]>(() => [
    { id: "run-portfolio", label: "Run now", disabled: (item) => item.job?.image_status !== "ready", onSelect: (item) => void runPortfolio(item) },
    { id: "edit-portfolio", label: "Edit", onSelect: openEditPortfolio },
    { id: "delete-portfolio", label: "Delete", tone: "danger", onSelect: setDeletePortfolioTarget },
  ], []);
  const rebalancePrimaryActions = useMemo(() => [
    { id: "create-rebalance", label: "Create rebalance configuration", tone: "primary" as const, disabled: rebalanceFormOpen, onSelect: openCreateRebalance },
  ], [rebalanceFormOpen]);
  const rebalanceRowActions = useMemo<readonly ResourceRowAction<PortfolioRebalanceConfiguration>[]>(() => [
    { id: "edit-rebalance", label: "Edit", onSelect: openEditRebalance },
    { id: "delete-rebalance", label: "Delete", tone: "danger", onSelect: setDeleteRebalanceTarget },
  ], []);

  return (
    <ApplicationPage as="main" maxWidth="full">
      <ApplicationPageStack>
        <ApplicationPageHeader
          eyebrow="Portfolios"
          title={manageRebalances ? "Rebalance Configurations" : "ETF Portfolios"}
          description={manageRebalances
            ? "Maintain reusable CalendarEventSignal policies that execute the latest observed ETF weights at selected NYSE session events."
            : "Compose an existing ETF weight Signal, an Alpaca Bars Configuration, persistent interpolated prices, and a CalendarEventSignal rebalance policy. The shared portfolio Job declared in the connector's workflow runs every Portfolio Configuration."}
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
                    <ResourcePicker ariaLabelledBy="portfolio-signal-label" disabled={busy || dependenciesLoading} emptyMessage="No scheduled ETF weight Signals." fullWidth loading={dependenciesLoading} mode="single" onValueChange={setSignalConfigurationUid} options={signalOptions} placeholder="Select an ETF weight Signal" searchable searchPlaceholder="Search Signals" value={signalConfigurationUid || null} />
                  </div>
                  <div className="field resource-picker-field">
                    <label id="portfolio-bars-label">Alpaca Bars Configuration</label>
                    <ResourcePicker ariaLabelledBy="portfolio-bars-label" disabled={busy || dependenciesLoading} emptyMessage="No enabled Bars Configurations." fullWidth loading={dependenciesLoading} mode="single" onValueChange={setBarsConfigurationUid} options={barsOptions} placeholder="Select a Bars Configuration" searchable searchPlaceholder="Search Bars Configurations" value={barsConfigurationUid || null} />
                  </div>
                  <div className="field resource-picker-field">
                    <label id="portfolio-rebalance-label">Rebalance Configuration</label>
                    <ResourcePicker ariaLabelledBy="portfolio-rebalance-label" disabled={busy || dependenciesLoading} emptyMessage="No Rebalance Configurations. Create one from the list action." fullWidth loading={dependenciesLoading} mode="single" onValueChange={setRebalanceConfigurationUid} options={rebalanceOptions} placeholder="Select a Rebalance Configuration" searchable searchPlaceholder="Search Rebalance Configurations" value={rebalanceConfigurationUid || null} />
                  </div>
                  <label className="field">Valuation column<input value={valuationColumn} onChange={(event) => setValuationColumn(event.target.value)} disabled={busy} /></label>
                  <div className="field">
                    <label htmlFor="portfolio-commission-percentage">Commission fee (%)</label>
                    <div className="field-input-with-unit">
                      <input
                        id="portfolio-commission-percentage"
                        type="number"
                        min={0}
                        step="0.001"
                        value={commissionPercentage}
                        onChange={(event) => setCommissionPercentage(event.target.value)}
                        disabled={busy}
                        aria-describedby="portfolio-commission-percentage-help"
                      />
                      <span className="field-input-with-unit__unit" aria-hidden="true">%</span>
                    </div>
                    <small id="portfolio-commission-percentage-help" className="field-help">Enter percentage points. For example, 0.018% is stored and submitted as 0.00018.</small>
                  </div>
                  <div className="field">
                    <label htmlFor="portfolio-maximum-staleness">Maximum price staleness (seconds)</label>
                    <div className="field-input-with-unit">
                      <input
                        id="portfolio-maximum-staleness"
                        type="number"
                        min={1}
                        step={1}
                        value={maximumStalenessSeconds}
                        onChange={(event) => setMaximumStalenessSeconds(event.target.value)}
                        disabled={busy}
                        aria-describedby="portfolio-maximum-staleness-help"
                        aria-invalid={!maximumStalenessValid}
                      />
                      <span className="field-input-with-unit__unit" aria-hidden="true">s</span>
                    </div>
                    <small id="portfolio-maximum-staleness-help" className="field-help">
                      {maximumStalenessValid && parsedMaximumStalenessSeconds !== null
                        ? `A price may be up to ${formatDuration(parsedMaximumStalenessSeconds)} old at a real rebalance or valuation timestamp.`
                        : "Enter a whole number of seconds greater than zero; 86400 is one day."}
                    </small>
                  </div>
                </div>
                <fieldset className="policy-fieldset">
                  <legend>Valuation alignment</legend>
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
                      <small id="portfolio-missing-prices-help">An asset is required when the portfolio holds it, enters it, or exits it. If it has no price at or before a valuation timestamp within the maximum staleness, the run stops and reports it. Leave this off to attempt the valuation without that price; no price is invented, and the run may still fail if no usable valuation remains.</small>
                    </span>
                  </label>
                  <p className="policy-fieldset__note"><strong>Bounded alignment:</strong> valuation uses the latest price at or before each real portfolio timestamp, no older than the maximum staleness. It never creates timestamps, extends the portfolio to the current time, or changes signal validity.</p>
                </fieldset>
              </section>

              <section className="workflow-form-section" aria-labelledby="portfolio-scheduled-run-heading">
                <div className="workflow-form-section__header"><h3 id="portfolio-scheduled-run-heading">Scheduled run</h3><p>The shared portfolio Job declared in the connector&apos;s workflow runs every scheduled portfolio once a day; its schedule and resources are shown on the portfolio&apos;s details page. A portfolio left out can still be run manually.</p></div>
                <label className="checkbox-field"><input type="checkbox" checked={scheduled} onChange={(event) => setScheduled(event.target.checked)} disabled={busy} />Include in the shared portfolio Job&apos;s daily scheduled run</label>
              </section>
              {dependenciesError ? <p className="form-error" role="alert">{dependenciesError}</p> : null}
              <aside className="workflow-guidance" aria-label="Portfolio calculation notes"><Info aria-hidden="true" size={18} /><p>Valuation uses a persistent daily <strong>InterpolatedPrices</strong> dependency with forward-fill interpolation for source-bar gaps. The selected Rebalance Configuration executes the latest observed weights through <strong>CalendarEventSignal</strong> at its session events. Signal timestamps record observation time and do not guarantee exact economic effective time.</p></aside>
              <div className="form-actions"><button className="button button--primary" type="submit" disabled={!canSubmit}>{editingPortfolio ? "Save changes" : "Create portfolio"}</button><button className="button button--secondary" type="button" onClick={() => { resetPortfolioForm(); setPortfolioFormOpen(false); }} disabled={busy}>Cancel</button></div>
            </form>
          </ApplicationCard>
        ) : null}

        {rebalanceFormOpen && manageRebalances ? (
          <ApplicationCard header={<h2>{editingRebalance ? "Edit rebalance configuration" : "Create rebalance configuration"}</h2>}>
            <form className="workflow-form" onSubmit={submitRebalance}>
              <div className="form-grid">
                <label className="field">Name<input value={rebalanceDraft.name} onChange={(event) => updateRebalanceDraft({ name: event.target.value })} placeholder="NYSE close" disabled={busy} /></label>
                <label className="field field--wide">Description <span>Optional</span><textarea rows={2} value={rebalanceDraft.description} onChange={(event) => updateRebalanceDraft({ description: event.target.value })} disabled={busy} /></label>
                <div className="field resource-picker-field">
                  <label id="rebalance-strategy-label">Strategy</label>
                  <ResourcePicker
                    ariaLabelledBy="rebalance-strategy-label"
                    disabled={busy}
                    emptyMessage="No rebalance strategies are available."
                    fullWidth
                    mode="single"
                    onValueChange={(value) => updateRebalanceDraft({ strategy: value as PortfolioRebalanceStrategy })}
                    options={REBALANCE_STRATEGY_OPTIONS}
                    placeholder="Select a rebalance strategy"
                    value={rebalanceDraft.strategy}
                  />
                </div>
                <div className="field">
                  <label htmlFor="rebalance-calendar">Calendar</label>
                  <input
                    id="rebalance-calendar"
                    readOnly
                    value={formatRebalanceCalendar({ calendar_identifier: rebalanceDraft.calendarIdentifier, session_label: rebalanceDraft.sessionLabel })}
                    aria-describedby="rebalance-calendar-help"
                  />
                  <small id="rebalance-calendar-help" className="field-help">
                    {isUsEquityCalendar({ calendar_identifier: rebalanceDraft.calendarIdentifier, session_label: rebalanceDraft.sessionLabel })
                      ? "Alpaca trades US equities, so events come from the persisted NYSE calendar's regular sessions, including actual early closes."
                      : "This configuration's calendar was set outside this application; saving keeps it."}
                  </small>
                </div>
                <label className="field">Market event
                  <select value={rebalanceDraft.event} onChange={(event) => updateRebalanceDraft({ event: event.target.value as PortfolioRebalanceEvent })} disabled={busy}>
                    <option value="market_close">Market close</option>
                    <option value="market_open">Market open</option>
                  </select>
                </label>
                <div className="field">
                  <label htmlFor="rebalance-event-offset">Event offset (seconds)</label>
                  <div className="field-input-with-unit">
                    <input
                      id="rebalance-event-offset"
                      type="number"
                      step={1}
                      value={rebalanceDraft.offsetSeconds}
                      onChange={(event) => updateRebalanceDraft({ offsetSeconds: event.target.value })}
                      disabled={busy}
                      aria-describedby="rebalance-event-offset-help"
                      aria-invalid={!rebalanceSchedule}
                    />
                    <span className="field-input-with-unit__unit" aria-hidden="true">s</span>
                  </div>
                  <small id="rebalance-event-offset-help" className="field-help">0 is the actual exchange event time. Negative values rebalance before it and positive values after it; -900 is 15 minutes before.</small>
                </div>
                <label className="field">Cadence
                  <select value={rebalanceDraft.cadence} onChange={(event) => updateRebalanceDraft({ cadence: event.target.value as PortfolioRebalanceCadence })} disabled={busy}>
                    <option value="every_session">Every session</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </label>
                {rebalanceDraft.cadence === "weekly" ? (
                  <div className="field">
                    <label htmlFor="rebalance-weekday">Weekday</label>
                    <select id="rebalance-weekday" value={rebalanceDraft.weekday} onChange={(event) => updateRebalanceDraft({ weekday: Number(event.target.value) })} disabled={busy} aria-describedby="rebalance-weekday-help">
                      {rebalanceWeekdayOptions.map((weekday) => <option key={weekday} value={weekday}>{formatWeekday(weekday)}</option>)}
                    </select>
                    <small id="rebalance-weekday-help" className="field-help">Only sessions on this calendar-local weekday rebalance; a week whose session that day is a holiday has none.</small>
                  </div>
                ) : null}
              </div>
              {rebalanceSchedule ? (
                <p className="form-note" role="status">{describeRebalanceSchedule(rebalanceSchedule)}</p>
              ) : (
                <p className="form-error" role="alert">Enter the event offset as a whole number of seconds.</p>
              )}
              <div className="workflow-guidance"><Info aria-hidden="true" size={18} /><p>CalendarEventSignal executes, at each selected session event, the latest ETF weights observed at or before it. A signal observed after the event first becomes eligible at the next one. It does not model execution delay, partial fills, volume participation, market impact, or slippage beyond the portfolio commission fee.</p></div>
              <div className="form-actions"><button className="button button--primary" type="submit" disabled={!rebalanceRequest || busy}>{editingRebalance ? "Save changes" : "Create configuration"}</button><button className="button button--secondary" type="button" onClick={() => setRebalanceFormOpen(false)} disabled={busy}>Cancel</button></div>
            </form>
          </ApplicationCard>
        ) : null}

        {mutation.state === "loading" ? (
          <RequestProgressDialog
            open
            title={mutation.label}
            message={manageRebalances
              ? "Waiting for the Alpaca Connectors API."
              : "Waiting for the Alpaca Connectors API and Main Sequence Job service."}
          />
        ) : mutation.state === "error" ? (
          <RequestErrorDialog
            open
            title={manageRebalances
              ? "Rebalance configuration request failed"
              : "ETF portfolio request failed"}
            message={mutation.message}
            onClose={() => setMutation({ state: "idle" })}
          />
        ) : mutation.state === "success" ? (
          <section className="action-result" aria-live="polite"><div className="section-heading"><h3>{mutation.message}</h3><span className="status-pill status-pill--success">Complete</span></div></section>
        ) : null}

        {manageRebalances ? (
          <ResourceListPage definition={rebalanceDefinition} embedded pageSize={25} primaryActions={rebalancePrimaryActions} refreshable refreshKey={rebalanceRefreshKey} rowActions={rebalanceRowActions} searchPlaceholder="Search Rebalance Configurations" />
        ) : selectedPortfolio ? (
          <PortfolioDetail configuration={selectedPortfolio} transport={transport} onBack={() => setSelectedPortfolio(null)} onChanged={() => setPortfolioRefreshKey((current) => current + 1)} />
        ) : (
          <ResourceListPage definition={portfolioDefinition} embedded pageSize={25} primaryActions={portfolioPrimaryActions} onRowActivate={setSelectedPortfolio} refreshable refreshKey={portfolioRefreshKey} rowActions={portfolioRowActions} searchPlaceholder="Search ETF Portfolios" />
        )}
      </ApplicationPageStack>

      <ResourceActionConfirmationDialog
        open={deletePortfolioTarget !== null || deleteRebalanceTarget !== null}
        actionLabel="Delete"
        title={deletePortfolioTarget ? "Delete portfolio configuration" : "Delete rebalance configuration"}
        selectionLabel={deletePortfolioTarget?.name ?? deleteRebalanceTarget?.name ?? "configuration"}
        description={deletePortfolioTarget ? "Delete this durable Portfolio Configuration. The shared portfolio Job and its past runs remain." : "Delete this reusable Rebalance Configuration."}
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
