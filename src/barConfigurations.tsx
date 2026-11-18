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
  type ResourceSelectFilterDefinition,
} from "@dev-mainsequence/command-center-sdk/views";
import { ChartCandlestick, Info } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  API_ENDPOINTS,
  createApiClient,
  type Account,
  type ApiTransport,
  type BarConfiguration,
  type BarConfigurationAssetSource,
  type BarFeedAssetSource,
  type BarFeedWriteRequest,
  type PortfolioBarsUpdateRequest,
  type PortfoliosFeedUpdateRequest,
  type PortfolioConfiguration,
  type ProjectConfigurationResponse,
  type ResourceCollection,
} from "./api";
import { accountLabel, accountName, shortUid, useAccountLookup, usePortfolioLookup } from "./lookups";
import { RequestErrorDialog, RequestProgressDialog } from "./requestFeedback";

type MutationState =
  | { state: "idle" }
  | { state: "loading"; label: string }
  | { state: "error"; message: string }
  | { state: "success"; message: string };

/** A bars feed prices explicit assets or its account's holdings (connector ADR 0028). */
const FEED_ASSET_SOURCE_OPTIONS: readonly ResourcePickerOption[] = [
  {
    value: "account_holdings",
    label: "Latest account holdings",
    subtitle: "Use the newest stored account holdings snapshot from the trailing 30 days.",
  },
  {
    value: "assets",
    label: "Explicit assets",
    subtitle: "Use an explicit set of registered Main Sequence Asset UIDs.",
  },
];

/** The list's "Belongs to" filter, sent as the API's `portfolio_owned`. */
const PARENT_FILTER_OPTIONS = [
  { value: "", label: "Feeds and portfolios" },
  { value: "false", label: "Bars feeds of accounts" },
  { value: "true", label: "Portfolios' own" },
] as const;

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

function isPortfolioOwned(configuration: BarConfiguration): boolean {
  return configuration.portfolio_configuration_uid !== null;
}

/**
 * A `portfolios` feed of an account: it prices the portfolios not yet adopted that name it, as
 * before accounts owned portfolios, and the API keeps it while they do (connector ADR 0028).
 */
function isLegacyPortfoliosFeed(configuration: BarConfiguration): boolean {
  return !isPortfolioOwned(configuration) && configuration.asset_source === "portfolios";
}

function formatAssetSource(configuration: BarConfiguration): string {
  const labels: Record<BarConfigurationAssetSource, string> = {
    assets: "Explicit assets",
    account_holdings: "Latest account holdings",
    portfolios: isPortfolioOwned(configuration)
      ? "Its portfolio's assets"
      : "Assets of the portfolios that name it",
  };
  // A source this site does not know yet still shows as the API names it.
  return labels[configuration.asset_source] ?? configuration.asset_source;
}

/** The portfolio a portfolio's own configuration belongs to; a feed has none. */
function portfolioName(
  configuration: BarConfiguration,
  portfolios: ReadonlyMap<string, PortfolioConfiguration>,
): string {
  const portfolioUid = configuration.portfolio_configuration_uid;
  return portfolioUid ? portfolios.get(portfolioUid)?.name ?? shortUid(portfolioUid) : "—";
}

function buildBarConfigurationResource(
  transport: ApiTransport,
  accounts: ReadonlyMap<string, Account>,
  portfolios: ReadonlyMap<string, PortfolioConfiguration>,
) {
  const adapter = createHttpResourceAdapter<
    BarConfiguration,
    string,
    ResourceCollection<BarConfiguration>
  >({
    client: createResourceHttpClient(transport),
    endpoints: {
      list: API_ENDPOINTS.barConfigurations,
      detail: (uid) => `${API_ENDPOINTS.barConfigurations}/${encodeURIComponent(uid)}`,
      discovery: API_ENDPOINTS.barConfigurationDiscovery,
    },
    serializeListQuery: ({ pageIndex, pageSize, search, sort, filters }) => ({
      limit: pageSize,
      offset: pageIndex * pageSize,
      search,
      enabled: filters?.enabled,
      asset_source: filters?.asset_source,
      portfolio_owned: filters?.portfolio_owned,
      ordering: sort?.[0]
        ? `${sort[0].direction === "descending" ? "-" : ""}${sort[0].key}`
        : "name",
    }),
    normalizeList: (response) => ({
      items: response.items,
      pageInfo: response.pageInfo,
    }),
  });

  return defineResourceApplication({
    id: "alpaca-bar-configurations",
    label: "Bars configurations",
    itemLabel: "configuration",
    description: "A bars feed belongs to one account; a portfolio's own bars configuration belongs to its portfolio. Each selects the assets one migrated Alpaca bars profile prices into that profile's shared price table.",
    getId: (configuration: BarConfiguration) => configuration.uid,
    adapter,
    columns: [
      {
        id: "name",
        header: "Configuration",
        getValue: (configuration) => configuration.name,
        sortableKey: "name",
        renderCell: (configuration) => (
          <ResourceIconLabelCell
            icon={<ChartCandlestick size={17} />}
            label={configuration.name}
            meta={configuration.description ?? undefined}
          />
        ),
      },
      // Its one parent (connector ADR 0028): the account of a feed, or the portfolio of its own.
      {
        id: "account-uid",
        header: "Account",
        getValue: (configuration) => configuration.account_uid
          ? accountName(accounts, configuration.account_uid)
          : "—",
      },
      {
        id: "portfolio-configuration-uid",
        header: "Portfolio",
        getValue: (configuration) => portfolioName(configuration, portfolios),
      },
      {
        id: "asset-source",
        header: "Asset Source",
        getValue: (configuration) => formatAssetSource(configuration),
      },
      {
        id: "frequency-id",
        header: "Frequency",
        getValue: (configuration) => configuration.frequency_id,
        sortableKey: "frequency_id",
      },
      { id: "feed", header: "Feed", getValue: (configuration) => configuration.feed },
      {
        id: "adjustment",
        header: "Adjustment",
        getValue: (configuration) => configuration.adjustment,
      },
      {
        id: "enabled",
        header: "Status",
        getValue: (configuration) => configuration.enabled,
        renderCell: (configuration) => (
          <ResourceStatusCell
            label={configuration.enabled ? "Enabled" : "Disabled"}
            tone={configuration.enabled ? "success" : "neutral"}
          />
        ),
      },
      {
        id: "scheduled",
        header: "Daily Update",
        getValue: (configuration) => configuration.scheduled,
        renderCell: (configuration) => (
          <ResourceStatusCell
            label={configuration.scheduled ? "Included" : "On demand"}
            tone={configuration.scheduled ? "success" : "neutral"}
          />
        ),
      },
      {
        id: "updated-at",
        header: "Updated",
        getValue: (configuration) => configuration.updated_at,
      },
    ],
  });
}

function BarConfigurationList({
  transport,
  refreshKey,
  accounts,
  portfolios,
  onEdit,
  onDelete,
}: {
  transport: ApiTransport;
  refreshKey: number;
  accounts: ReadonlyMap<string, Account>;
  portfolios: ReadonlyMap<string, PortfolioConfiguration>;
  onEdit: (configuration: BarConfiguration) => void;
  onDelete: (configuration: BarConfiguration) => void;
}) {
  const definition = useMemo(
    () => buildBarConfigurationResource(transport, accounts, portfolios),
    [accounts, portfolios, transport],
  );
  const [parentFilter, setParentFilter] = useState("");
  const filterDefinitions = useMemo<readonly ResourceSelectFilterDefinition[]>(() => [{
    id: "portfolio_owned",
    label: "Belongs to",
    value: parentFilter,
    options: PARENT_FILTER_OPTIONS,
    onChange: setParentFilter,
  }], [parentFilter]);
  const rowActions = useMemo<readonly ResourceRowAction<BarConfiguration>[]>(() => [
    { id: "edit-bars-configuration", label: "Edit", onSelect: onEdit },
    {
      id: "delete-bars-configuration",
      label: "Delete",
      tone: "danger",
      // A portfolio's own configuration is deleted with its portfolio (connector ADR 0028).
      disabled: isPortfolioOwned,
      onSelect: onDelete,
    },
  ], [onDelete, onEdit]);

  return (
    <ResourceListPage
      definition={definition}
      embedded
      filterDefinitions={filterDefinitions}
      pageSize={25}
      refreshable
      refreshKey={refreshKey}
      rowActions={rowActions}
      searchPlaceholder="Search bars configurations"
    />
  );
}

function normalizeUidList(value: string): string[] {
  return Array.from(new Set(value.split(/[\s,]+/).map((uid) => uid.trim()).filter(Boolean)));
}

function profileParts(profile: string): [string, string, string] | null {
  const [frequencyId, feed, adjustment, ...extra] = profile.split("/");
  if (!frequencyId || !feed || !adjustment || extra.length > 0) return null;
  return [frequencyId, feed, adjustment];
}

function profilePickerOption(profile: string): ResourcePickerOption {
  const parts = profileParts(profile);
  if (!parts) {
    return {
      value: profile,
      label: profile,
      subtitle: "Existing migrated Bars profile.",
    };
  }

  const [frequencyId, feed, adjustment] = parts;
  const frequencyLabel = frequencyId === "1d" ? "Daily" : frequencyId;
  const frequencyDescription = frequencyId === "1d" ? "1-day bars" : `${frequencyId} bars`;
  const feedLabel = feed.toUpperCase();
  const feedDescription = feed === "sip"
    ? "the consolidated SIP feed"
    : feed === "iex"
      ? "the IEX exchange feed"
      : `the ${feedLabel} feed`;
  const adjustmentLabel = adjustment === "all"
    ? "Adjusted (all corporate actions)"
    : adjustment === "raw"
      ? "Raw (unadjusted)"
      : adjustment === "split"
        ? "Split-adjusted"
        : adjustment === "dividend"
          ? "Dividend-adjusted"
          : adjustment;
  const adjustmentDescription = adjustment === "all"
    ? "prices are adjusted for all corporate actions"
    : adjustment === "raw"
      ? "prices are not adjusted for corporate actions"
      : `prices use Alpaca's ${adjustment} adjustment`;

  return {
    value: profile,
    label: `${frequencyLabel} · ${feedLabel} · ${adjustmentLabel}`,
    subtitle: `${frequencyDescription} from ${feedDescription}; ${adjustmentDescription}.`,
    meta: profile,
    keywords: [frequencyId, feed, adjustment],
  };
}


export function BarsConfigurationsPage({
  transport,
  configuration,
}: {
  transport: ApiTransport;
  configuration: ProjectConfigurationResponse;
}) {
  const api = useMemo(() => createApiClient(transport), [transport]);
  const profiles = configuration.migrated_market_data_profiles;
  const [refreshKey, setRefreshKey] = useState(0);
  const accountLookup = useAccountLookup(transport);
  const portfolioLookup = usePortfolioLookup(transport);
  const accounts = accountLookup.items;
  const [editing, setEditing] = useState<BarConfiguration | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [scheduled, setScheduled] = useState(true);
  const [accountUid, setAccountUid] = useState("");
  const [assetSource, setAssetSource] = useState<BarFeedAssetSource>("account_holdings");
  const [assetUids, setAssetUids] = useState("");
  const [profile, setProfile] = useState(profiles[0] ?? "");
  const [mutation, setMutation] = useState<MutationState>({ state: "idle" });
  const [deleteTarget, setDeleteTarget] = useState<BarConfiguration | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setAccountUid((current) => current || accounts[0]?.uid || "");
  }, [accounts]);

  useEffect(() => {
    if (!profile && profiles[0]) setProfile(profiles[0]);
  }, [profile, profiles]);

  // A portfolio's own configuration takes its account and assets from its portfolio; a
  // `portfolios` feed keeps its source.
  const editingPortfolioOwned = editing !== null && isPortfolioOwned(editing);
  const editingPortfoliosFeed = editing !== null && isLegacyPortfoliosFeed(editing);
  const fixedSource = editingPortfolioOwned || editingPortfoliosFeed;
  const editingPortfolioName = editing?.portfolio_configuration_uid
    ? portfolioLookup.byUid.get(editing.portfolio_configuration_uid)?.name
      ?? shortUid(editing.portfolio_configuration_uid)
    : null;
  const profileOptions: readonly ResourcePickerOption[] = Array.from(new Set([
    ...profiles,
    ...(profile ? [profile] : []),
  ])).map(profilePickerOption);
  const busy = mutation.state === "loading";
  const sourceIsValid = fixedSource
    || assetSource === "account_holdings"
    || (assetSource === "assets" && normalizeUidList(assetUids).length > 0);
  const canSubmit = !busy
    && (editingPortfolioOwned || !accountLookup.loading)
    && Boolean(name.trim())
    && (editingPortfolioOwned || Boolean(accountUid))
    && Boolean(profileParts(profile))
    && sourceIsValid;

  function resetForm() {
    setEditing(null);
    setName("");
    setDescription("");
    setEnabled(true);
    setScheduled(true);
    setAccountUid(accounts[0]?.uid ?? "");
    setAssetSource("account_holdings");
    setAssetUids("");
    setProfile(profiles[0] ?? "");
  }

  function beginEdit(configurationToEdit: BarConfiguration) {
    setEditing(configurationToEdit);
    setName(configurationToEdit.name);
    setDescription(configurationToEdit.description ?? "");
    setEnabled(configurationToEdit.enabled);
    setScheduled(configurationToEdit.scheduled);
    setAccountUid(configurationToEdit.account_uid ?? "");
    setAssetSource(configurationToEdit.asset_source === "assets" ? "assets" : "account_holdings");
    setAssetUids(configurationToEdit.asset_uids.join("\n"));
    setProfile(`${configurationToEdit.frequency_id}/${configurationToEdit.feed}/${configurationToEdit.adjustment}`);
    setMutation({ state: "idle" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const selectedProfile = profileParts(profile);
    if (!selectedProfile) {
      setMutation({ state: "error", message: "Select one migrated bars profile." });
      return;
    }
    if (!canSubmit) {
      setMutation({ state: "error", message: "Complete the account, source, and profile fields required for this configuration." });
      return;
    }
    const [frequencyId, feed, adjustment] = selectedProfile;
    const common = {
      name: name.trim(),
      description: description.trim() || null,
      enabled,
      scheduled,
      frequency_id: frequencyId,
      feed,
      adjustment,
    };
    const request: BarFeedWriteRequest | PortfoliosFeedUpdateRequest | PortfolioBarsUpdateRequest =
      editingPortfolioOwned
        ? common
        : editingPortfoliosFeed
          ? { ...common, account_uid: accountUid }
          : {
            ...common,
            account_uid: accountUid,
            asset_source: assetSource,
            asset_uids: assetSource === "assets" ? normalizeUidList(assetUids) : [],
          };
    const actionLabel = editing ? "Updating bars configuration" : "Creating bars feed";
    setMutation({ state: "loading", label: actionLabel });
    try {
      if (editing) {
        await api.patch<BarConfiguration>(
          `${API_ENDPOINTS.barConfigurations}/${encodeURIComponent(editing.uid)}`,
          request,
        );
      } else {
        await api.post<BarConfiguration>(API_ENDPOINTS.barConfigurations, request);
      }
      const completedName = request.name;
      const completedAction = editing ? "Updated" : "Created";
      resetForm();
      setMutation({ state: "success", message: `${completedAction} ${completedName}.` });
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setMutation({ state: "error", message: formatError(error) });
    }
  }

  function requestDelete(configurationToDelete: BarConfiguration) {
    if (isPortfolioOwned(configurationToDelete)) return;
    setDeleteTarget(configurationToDelete);
    setDeleteConfirmation("");
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteConfirmation !== "DELETE") return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await api.delete<Record<string, unknown>>(
        `${API_ENDPOINTS.barConfigurations}/${encodeURIComponent(deleteTarget.uid)}`,
      );
      const deletedName = deleteTarget.name;
      if (editing?.uid === deleteTarget.uid) resetForm();
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setMutation({ state: "success", message: `Deleted ${deletedName}.` });
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setDeleteError(formatError(error));
    } finally {
      setDeletePending(false);
    }
  }

  const formTitle = editingPortfolioOwned
    ? "Edit a portfolio's bars configuration"
    : editing ? "Edit bars feed" : "Create bars feed";

  return (
    <ApplicationPage as="main" maxWidth="full">
      <ApplicationPageStack>
        <ApplicationPageHeader
          eyebrow="Market Data"
          title="Bars configurations"
          description="Create and maintain the bars feeds of your accounts, and adjust the bars configuration each portfolio owns. Every migrated bars profile writes one shared price table; a configuration only chooses which assets it prices, with its account's keys."
        />

        <ApplicationCard header={<h2>{formTitle}</h2>}>
          <form className="workflow-form" onSubmit={submit}>
            <div className="form-grid">
              <label className="field">Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Daily account holdings"
                  disabled={busy}
                />
              </label>
              {editingPortfolioOwned ? (
                <label className="field">Belongs to
                  <input readOnly value={`Portfolio · ${editingPortfolioName ?? ""}`} />
                  <span>Its runs use the portfolio&apos;s account&apos;s keys.</span>
                </label>
              ) : (
                <label className="field">Registered Alpaca account
                  <select
                    value={accountUid}
                    onChange={(event) => setAccountUid(event.target.value)}
                    disabled={busy || accountLookup.loading}
                  >
                    <option value="">{accounts.length ? "Select an account" : "No registered accounts"}</option>
                    {accounts.map((account) => (
                      <option key={account.uid} value={account.uid}>
                        {accountLabel(account)}
                      </option>
                    ))}
                  </select>
                  <span>The feed belongs to this account and is deleted with it.</span>
                </label>
              )}
              <label className="field field--wide">Description <span>Optional</span>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What this bars configuration updates"
                  disabled={busy}
                />
              </label>
              {fixedSource ? (
                <label className="field">Asset source
                  <input
                    readOnly
                    value={editingPortfolioOwned
                      ? "Every asset its portfolio's signal has published"
                      : "Every asset of the portfolios not yet adopted that name it"}
                  />
                </label>
              ) : (
                <div className="field resource-picker-field">
                  <label id="bars-asset-source-label">Asset source</label>
                  <ResourcePicker
                    ariaLabelledBy="bars-asset-source-label"
                    disabled={busy}
                    emptyMessage="No asset sources are available."
                    fullWidth
                    mode="single"
                    onValueChange={(value) => setAssetSource(value as BarFeedAssetSource)}
                    options={FEED_ASSET_SOURCE_OPTIONS}
                    placeholder="Select an asset source"
                    value={assetSource}
                  />
                </div>
              )}
              <div className="field resource-picker-field">
                <label id="bars-profile-label">Migrated Bars profile</label>
                <ResourcePicker
                  ariaLabelledBy="bars-profile-label"
                  disabled={busy}
                  emptyMessage="No migrated Bars profiles."
                  fullWidth
                  mode="single"
                  onValueChange={setProfile}
                  options={profileOptions}
                  placeholder="Select a migrated Bars profile"
                  value={profile || null}
                />
              </div>
              {!fixedSource && assetSource === "assets" ? (
                <label className="field field--wide">Registered Asset UIDs <span>Comma, space, or line separated</span>
                  <textarea
                    rows={4}
                    value={assetUids}
                    onChange={(event) => setAssetUids(event.target.value)}
                    placeholder="One or more Main Sequence Asset UIDs"
                    disabled={busy}
                  />
                </label>
              ) : null}
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                disabled={busy}
              />
              Enabled
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={scheduled}
                onChange={(event) => setScheduled(event.target.checked)}
                disabled={busy}
              />
              Include in the daily bars update
            </label>
            {accountLookup.error && !editingPortfolioOwned ? (
              <p className="form-error" role="alert">{accountLookup.error}</p>
            ) : null}
            {!accountLookup.loading && accounts.length === 0 && !editing ? (
              <p className="form-error" role="alert">Register an Alpaca account before creating a bars feed.</p>
            ) : null}
            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={!canSubmit}>
                {editing ? "Save changes" : "Create feed"}
              </button>
              {editing ? (
                <button className="button button--secondary" type="button" onClick={resetForm} disabled={busy}>
                  Cancel edit
                </button>
              ) : null}
            </div>
            <div className="workflow-guidance">
              <Info aria-hidden="true" size={18} />
              {editingPortfolioOwned ? (
                <p>
                  This is its portfolio&apos;s own bars configuration. It prices every asset the portfolio&apos;s signal has published, with the portfolio&apos;s account&apos;s keys, into the shared table of its bars profile. It is created and deleted with its portfolio, and only the portfolio&apos;s owner changes it. The selected profile must already be migrated.
                </p>
              ) : editingPortfoliosFeed ? (
                <p>
                  This feed prices every asset of the portfolios not yet adopted that name it, as before accounts owned portfolios, with its account&apos;s keys. It keeps its source, and it can&apos;t be deleted while those portfolios name it. A feed can&apos;t run with another owner&apos;s account. The selected profile must already be migrated.
                </p>
              ) : assetSource === "assets" ? (
                <p>
                  This stores configuration only. <strong>Explicit assets</strong> uses exactly the registered Main Sequence Asset UIDs entered above. A feed can&apos;t run with another owner&apos;s account. The selected profile must already be migrated.
                </p>
              ) : (
                <p>
                  This stores configuration only. <strong>Latest account holdings</strong> resolves the newest persisted snapshot from the trailing 30 days and never captures holdings as a side effect. A feed can&apos;t run with another owner&apos;s account. The selected profile must already be migrated.
                </p>
              )}
            </div>
          </form>
        </ApplicationCard>

        {mutation.state === "loading" ? (
          <RequestProgressDialog
            open
            title={mutation.label}
            message="Waiting for the Alpaca Connectors API."
          />
        ) : mutation.state === "error" ? (
          <RequestErrorDialog
            open
            title="Bars configuration request failed"
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

        <BarConfigurationList
          transport={transport}
          refreshKey={refreshKey}
          accounts={accountLookup.byUid}
          portfolios={portfolioLookup.byUid}
          onEdit={beginEdit}
          onDelete={requestDelete}
        />
      </ApplicationPageStack>

      <ResourceActionConfirmationDialog
        open={deleteTarget !== null}
        actionLabel="Delete"
        title="Delete bars feed"
        selectionLabel={deleteTarget?.name ?? "configuration"}
        description="Delete this bars feed of its account. The bars it published stay in the shared price table."
        warning="The feed will no longer be available for future market-data updates. A portfolio's own bars configuration is deleted only with its portfolio."
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
