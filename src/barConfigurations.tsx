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
import { ChartCandlestick, Info } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  API_ENDPOINTS,
  createApiClient,
  type AccountSummary,
  type ApiTransport,
  type BarConfiguration,
  type BarConfigurationAssetSource,
  type BarConfigurationWriteRequest,
  type AssetUniverse,
  type ProjectConfigurationResponse,
  type ResourceCollection,
} from "./api";
import { RequestErrorDialog, RequestProgressDialog } from "./requestFeedback";

type MutationState =
  | { state: "idle" }
  | { state: "loading"; label: string }
  | { state: "error"; message: string }
  | { state: "success"; message: string };

const ASSET_SOURCE_OPTIONS: readonly ResourcePickerOption[] = [
  {
    value: "account_holdings",
    label: "Latest account holdings",
    subtitle: "Use the newest stored account holdings snapshot from the trailing 30 days.",
  },
  {
    value: "universe",
    label: "Universe assets",
    subtitle: "Resolve assets from the selected active Universe when the bars update runs.",
  },
  {
    value: "assets",
    label: "Explicit assets",
    subtitle: "Use an explicit set of registered Main Sequence Asset UIDs.",
  },
];

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

function formatAssetSource(source: BarConfigurationAssetSource): string {
  const labels: Record<BarConfigurationAssetSource, string> = {
    assets: "Explicit assets",
    universe: "Universe assets",
    account_holdings: "Latest account holdings",
  };
  return labels[source];
}

function buildBarConfigurationResource(transport: ApiTransport) {
  const adapter = createHttpResourceAdapter<
    BarConfiguration,
    string,
    ResourceCollection<BarConfiguration>,
    BarConfiguration,
    BarConfigurationWriteRequest,
    BarConfigurationWriteRequest
  >({
    client: createResourceHttpClient(transport),
    endpoints: {
      list: API_ENDPOINTS.barConfigurations,
      detail: (uid) => `${API_ENDPOINTS.barConfigurations}/${encodeURIComponent(uid)}`,
      discovery: API_ENDPOINTS.barConfigurationDiscovery,
      create: API_ENDPOINTS.barConfigurations,
      update: (uid) => `${API_ENDPOINTS.barConfigurations}/${encodeURIComponent(uid)}`,
    },
    serializeListQuery: ({ pageIndex, pageSize, search, sort, filters }) => ({
      limit: pageSize,
      offset: pageIndex * pageSize,
      search,
      enabled: filters?.enabled,
      asset_source: filters?.asset_source,
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
    description: "Stored definitions that select an account, one asset source, and one migrated Alpaca bars profile.",
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
      {
        id: "asset-source",
        header: "Asset Source",
        getValue: (configuration) => formatAssetSource(configuration.asset_source),
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
  onEdit,
  onDelete,
}: {
  transport: ApiTransport;
  refreshKey: number;
  onEdit: (configuration: BarConfiguration) => void;
  onDelete: (configuration: BarConfiguration) => void;
}) {
  const definition = useMemo(() => buildBarConfigurationResource(transport), [transport]);
  const rowActions = useMemo<readonly ResourceRowAction<BarConfiguration>[]>(() => [
    { id: "edit-bars-configuration", label: "Edit", onSelect: onEdit },
    { id: "delete-bars-configuration", label: "Delete", tone: "danger", onSelect: onDelete },
  ], [onDelete, onEdit]);

  return (
    <ResourceListPage
      definition={definition}
      embedded
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
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [universes, setUniverses] = useState<AssetUniverse[]>([]);
  const [dependenciesLoading, setDependenciesLoading] = useState(true);
  const [dependenciesError, setDependenciesError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BarConfiguration | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [accountUid, setAccountUid] = useState("");
  const [assetSource, setAssetSource] = useState<BarConfigurationAssetSource>("account_holdings");
  const [assetUids, setAssetUids] = useState("");
  const [universeUid, setUniverseUid] = useState("");
  const [profile, setProfile] = useState(profiles[0] ?? "");
  const [mutation, setMutation] = useState<MutationState>({ state: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<BarConfiguration | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDependenciesLoading(true);
    setDependenciesError(null);
    Promise.all([
      api.get<ResourceCollection<AccountSummary>>(
        `${API_ENDPOINTS.accounts}?limit=100&offset=0&ordering=account_name`,
        controller.signal,
      ),
      api.get<ResourceCollection<AssetUniverse>>(
        `${API_ENDPOINTS.universes}?limit=100&offset=0&ordering=display_name`,
        controller.signal,
      ),
    ])
      .then(([accountResponse, universeResponse]) => {
        setAccounts(accountResponse.items);
        setUniverses(universeResponse.items);
        setAccountUid((current) => current || accountResponse.items[0]?.uid || "");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDependenciesError(formatError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDependenciesLoading(false);
      });
    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    if (!profile && profiles[0]) setProfile(profiles[0]);
  }, [profile, profiles]);

  const activeUniverses = universes.filter((universe) => universe.is_active);
  const activeUniverseOptions: readonly ResourcePickerOption[] = activeUniverses.map((universe) => ({
    value: universe.uid,
    label: universe.display_name,
    subtitle: universe.symbol,
    meta: universe.uid,
  }));
  const profileOptions: readonly ResourcePickerOption[] = Array.from(new Set([
    ...profiles,
    ...(profile ? [profile] : []),
  ])).map(profilePickerOption);
  const busy = mutation.state === "loading";
  const sourceIsValid = assetSource === "account_holdings"
    || (assetSource === "universe" && Boolean(universeUid))
    || (assetSource === "assets" && normalizeUidList(assetUids).length > 0);
  const canSubmit = !busy
    && !dependenciesLoading
    && Boolean(name.trim())
    && Boolean(accountUid)
    && Boolean(profileParts(profile))
    && sourceIsValid;

  function resetForm() {
    setEditing(null);
    setName("");
    setDescription("");
    setEnabled(true);
    setAccountUid(accounts[0]?.uid ?? "");
    setAssetSource("account_holdings");
    setAssetUids("");
    setUniverseUid("");
    setProfile(profiles[0] ?? "");
  }

  function beginEdit(configurationToEdit: BarConfiguration) {
    setEditing(configurationToEdit);
    setName(configurationToEdit.name);
    setDescription(configurationToEdit.description ?? "");
    setEnabled(configurationToEdit.enabled);
    setAccountUid(configurationToEdit.account_uid);
    setAssetSource(configurationToEdit.asset_source);
    setAssetUids(configurationToEdit.asset_uids.join("\n"));
    setUniverseUid(configurationToEdit.universe_uid ?? "");
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
    const request: BarConfigurationWriteRequest = {
      name: name.trim(),
      description: description.trim() || null,
      enabled,
      account_uid: accountUid,
      asset_source: assetSource,
      asset_uids: assetSource === "assets" ? normalizeUidList(assetUids) : [],
      universe_uid: assetSource === "universe" ? universeUid : null,
      frequency_id: frequencyId,
      feed,
      adjustment,
    };
    const actionLabel = editing ? "Updating bars configuration" : "Creating bars configuration";
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

  return (
    <ApplicationPage as="main" maxWidth="full">
      <ApplicationPageStack>
        <ApplicationPageHeader
          eyebrow="Market Data"
          title="Bars configurations"
          description="Create and maintain the stored definitions used to resolve and run Alpaca stock-bar updates."
        />

        <ApplicationCard header={<h2>{editing ? "Edit bars configuration" : "Create bars configuration"}</h2>}>
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
              <label className="field">Registered Alpaca account
                <select
                  value={accountUid}
                  onChange={(event) => setAccountUid(event.target.value)}
                  disabled={busy || dependenciesLoading}
                >
                  <option value="">{accounts.length ? "Select an account" : "No registered accounts"}</option>
                  {accounts.map((account) => (
                    <option key={account.uid} value={account.uid}>
                      {account.account_name} ({account.is_paper ? "paper" : "live"})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field field--wide">Description <span>Optional</span>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What this reusable bars configuration updates"
                  disabled={busy}
                />
              </label>
              <div className="field resource-picker-field">
                <label id="bars-asset-source-label">Asset source</label>
                <ResourcePicker
                  ariaLabelledBy="bars-asset-source-label"
                  disabled={busy}
                  emptyMessage="No asset sources are available."
                  fullWidth
                  mode="single"
                  onValueChange={(value) => setAssetSource(value as BarConfigurationAssetSource)}
                  options={ASSET_SOURCE_OPTIONS}
                  placeholder="Select an asset source"
                  value={assetSource}
                />
              </div>
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
              {assetSource === "universe" ? (
                <div className="field field--wide resource-picker-field">
                  <label id="bars-universe-label">Active Universe</label>
                  <ResourcePicker
                    ariaLabelledBy="bars-universe-label"
                    disabled={busy || dependenciesLoading}
                    emptyMessage="No active Universes."
                    fullWidth
                    loading={dependenciesLoading}
                    mode="single"
                    onValueChange={setUniverseUid}
                    options={activeUniverseOptions}
                    placeholder="Select the Universe whose assets will be updated"
                    searchable
                    searchPlaceholder="Search active Universes"
                    value={universeUid || null}
                  />
                </div>
              ) : null}
              {assetSource === "assets" ? (
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
            {dependenciesError ? <p className="form-error" role="alert">{dependenciesError}</p> : null}
            {!dependenciesLoading && accounts.length === 0 ? (
              <p className="form-error" role="alert">Register an Alpaca account before creating a bars configuration.</p>
            ) : null}
            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={!canSubmit}>
                {editing ? "Save changes" : "Create configuration"}
              </button>
              {editing ? (
                <button className="button button--secondary" type="button" onClick={resetForm} disabled={busy}>
                  Cancel edit
                </button>
              ) : null}
            </div>
            <div className="workflow-guidance">
              <Info aria-hidden="true" size={18} />
              {assetSource === "universe" ? (
                <p>
                  This stores configuration only. <strong>Universe assets</strong> resolves the selected Universe&apos;s current materialized Asset Category members when the bars update runs. It does not extract or refresh the Universe. The selected profile must already be migrated.
                </p>
              ) : assetSource === "assets" ? (
                <p>
                  This stores configuration only. <strong>Explicit assets</strong> uses exactly the registered Main Sequence Asset UIDs entered above. The selected profile must already be migrated.
                </p>
              ) : (
                <p>
                  This stores configuration only. <strong>Latest account holdings</strong> resolves the newest persisted snapshot from the trailing 30 days and never captures holdings as a side effect. The selected profile must already be migrated.
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
          onEdit={beginEdit}
          onDelete={requestDelete}
        />
      </ApplicationPageStack>

      <ResourceActionConfirmationDialog
        open={deleteTarget !== null}
        actionLabel="Delete"
        title="Delete bars configuration"
        selectionLabel={deleteTarget?.name ?? "configuration"}
        description="Delete this stored configuration. Published bars data is not deleted."
        warning="This configuration will no longer be available for future market-data updates."
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
