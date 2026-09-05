import {
  createHttpResourceAdapter,
  defineResourceApplication,
  type ResourceHttpClient,
  type ResourceHttpRequest,
  type ResourceListResult,
} from "@dev-mainsequence/command-center-sdk/resource";
import {
  EntitySummary,
  ResourceActionConfirmationDialog,
  ResourceDetailShell,
  ResourceIconLabelCell,
  ResourceListPage,
  ResourcePicker,
  ResourceStatusCell,
  type ResourceDiscoveredRowAction,
  type ResourcePickerOption,
  type ResourceRowAction,
} from "@dev-mainsequence/command-center-sdk/views";
import { Layers3 } from "lucide-react";
import {
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  API_ENDPOINTS,
  createApiClient,
  type Account,
  type ApiTransport,
  type AssetUniverse,
  type AssetUniverseDetail,
  type ResourceCollection,
} from "./api";
import { buildAssetResource } from "./assetResource";

const ROW_ACTIONS: readonly ResourceDiscoveredRowAction<AssetUniverse>[] = [
  {
    id: "activate-universe",
    actionId: "activate",
    label: "Activate",
    disabled: (universe) => universe.is_active,
  },
  {
    id: "deactivate-universe",
    actionId: "deactivate",
    label: "Deactivate",
    disabled: (universe) => !universe.is_active,
    tone: "danger",
  },
  {
    id: "delete-universe",
    actionId: "remove",
    label: "Delete",
    tone: "danger",
  },
];

interface ContextMenuState {
  universe: AssetUniverse;
  x: number;
  y: number;
}

interface UniverseRunPreflight {
  allowed: boolean;
  detail: string;
  blockers: string[];
  warnings: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The component extraction request failed.";
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

function buildUniverseResource(transport: ApiTransport) {
  const adapter = createHttpResourceAdapter<
    AssetUniverse,
    string,
    ResourceCollection<AssetUniverse>
  >({
    client: createResourceHttpClient(transport),
    endpoints: {
      list: API_ENDPOINTS.universes,
      detail: (uid) => `${API_ENDPOINTS.universes}/${encodeURIComponent(uid)}`,
      discovery: API_ENDPOINTS.universeDiscovery,
      update: (uid) => `${API_ENDPOINTS.universes}/${encodeURIComponent(uid)}`,
    },
    serializeListQuery: ({ pageIndex, pageSize, search, sort }) => ({
      limit: pageSize,
      offset: pageIndex * pageSize,
      search,
      ordering: sort?.[0]
        ? `${sort[0].direction === "descending" ? "-" : ""}${sort[0].key}`
        : "display_name",
    }),
    normalizeList: (response) => ({
      items: response.items,
      pageInfo: response.pageInfo,
    }),
  });

  return defineResourceApplication({
    id: "asset-universes",
    label: "Registered universes",
    itemLabel: "universe",
    description: "Each universe extracts ETF holdings components into its linked Asset Category. An Alpaca account is selected only when missing components need provider-backed registration.",
    getId: (universe: AssetUniverse) => universe.uid,
    adapter,
    columns: [
      {
        id: "display-name",
        header: "Universe",
        getValue: (universe) => universe.display_name,
        sortableKey: "display_name",
        renderCell: (universe) => (
          <ResourceIconLabelCell
            icon={<Layers3 size={17} />}
            label={universe.display_name}
          />
        ),
      },
      {
        id: "symbol",
        header: "Symbol",
        getValue: (universe) => universe.symbol,
        sortableKey: "symbol",
      },
      {
        id: "uid",
        header: "UID",
        getValue: (universe) => universe.uid,
      },
      {
        id: "asset-count",
        header: "Assets",
        getValue: (universe) => universe.asset_count,
      },
      {
        id: "is-active",
        header: "Status",
        getValue: (universe) => universe.is_active,
        renderCell: (universe) => (
          <ResourceStatusCell
            label={universe.is_active ? "Active" : "Inactive"}
            tone={universe.is_active ? "success" : "neutral"}
          />
        ),
      },
    ],
  });
}

function UniverseDetail({
  universeUid,
  transport,
  onBack,
}: {
  universeUid: string;
  transport: ApiTransport;
  onBack: () => void;
}) {
  const api = useMemo(() => createApiClient(transport), [transport]);
  const [universe, setUniverse] = useState<AssetUniverseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.get<AssetUniverseDetail>(
      `${API_ENDPOINTS.universes}/${encodeURIComponent(universeUid)}`,
      controller.signal,
    )
      .then(setUniverse)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, universeUid]);

  const assetsDefinition = useMemo(() => buildAssetResource(transport, {
    id: `universe-${universeUid}-assets`,
    label: "Assets in linked category",
    description: "Registered Assets belonging to this Universe's linked Asset Category. Universe extraction currently stores membership, not constituent weights.",
    listPath: `${API_ENDPOINTS.universes}/${encodeURIComponent(universeUid)}/assets`,
  }), [transport, universeUid]);

  return (
    <ResourceDetailShell<AssetUniverseDetail>
      embedded
      breadcrumbs={[
        { id: "universes", label: "Universes", onSelect: onBack },
        { id: universeUid, label: universe?.display_name ?? universeUid },
      ]}
      error={error ?? undefined}
      loading={loading}
      loadingDescription="Loading the linked Asset Category and its Asset collection."
      loadingTitle="Loading Universe details…"
      headerActions={(
        <button className="button button--secondary" type="button" onClick={onBack}>
          Back to universes
        </button>
      )}
      summary={universe ? (
        <EntitySummary
          summary={{
            entity: {
              id: universe.uid,
              type: "Asset Universe",
              title: universe.display_name,
            },
            badges: [{
              key: "status",
              label: universe.is_active ? "Active" : "Inactive",
              tone: universe.is_active ? "success" : "default",
            }],
            inline_fields: [
              { key: "symbol", label: "Source symbol", value: universe.symbol },
              {
                key: "category",
                label: "Linked Asset Category",
                value: universe.asset_category.unique_identifier,
              },
              {
                key: "category-uid",
                label: "Asset Category UID",
                value: universe.asset_category.uid,
              },
              {
                key: "weights",
                label: "Constituent weights",
                value: "Not stored by Universe extraction",
              },
            ],
            highlight_fields: [],
            stats: [{
              key: "assets",
              label: "Assets",
              value: universe.asset_count,
              display: String(universe.asset_count),
            }],
          }}
        />
      ) : undefined}
    >
      {universe ? (
        <ResourceListPage
          definition={assetsDefinition}
          embedded
          emptyContent="The linked Asset Category has no members. Extract components to populate it."
          pageSize={25}
          refreshable
          searchPlaceholder="Search assets in this category"
        />
      ) : null}
    </ResourceDetailShell>
  );
}

export function UniverseResourceList({
  transport,
  refreshKey,
}: {
  transport: ApiTransport;
  refreshKey: number;
}) {
  const definition = useMemo(() => buildUniverseResource(transport), [transport]);
  const api = useMemo(() => createApiClient(transport), [transport]);
  const [visibleUniverses, setVisibleUniverses] = useState<readonly AssetUniverse[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [detailUniverseUid, setDetailUniverseUid] = useState<string | null>(null);
  const [runTarget, setRunTarget] = useState<AssetUniverse | null>(null);
  const [runAccounts, setRunAccounts] = useState<Account[]>([]);
  const [runAccountUid, setRunAccountUid] = useState("");
  const [runAccountsLoading, setRunAccountsLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runPending, setRunPending] = useState(false);
  const [runRefreshKey, setRunRefreshKey] = useState(0);
  const combinedRefreshKey = `${refreshKey}:${runRefreshKey}`;
  const handleResult = useCallback((result: ResourceListResult<AssetUniverse>) => {
    setVisibleUniverses(result.items);
  }, []);

  useEffect(() => {
    if (!runTarget) return;
    const controller = new AbortController();
    setRunAccountsLoading(true);
    setRunError(null);
    api.get<ResourceCollection<Account>>(
      `${API_ENDPOINTS.accounts}?limit=100&offset=0&active=true&ordering=account_name`,
      controller.signal,
    )
      .then((response) => setRunAccounts(response.items))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setRunError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setRunAccountsLoading(false);
      });
    return () => controller.abort();
  }, [api, runTarget]);

  const runAccountOptions = useMemo<ResourcePickerOption[]>(() => runAccounts.map((account) => ({
    value: account.uid,
    label: account.account_name,
    subtitle: `${account.is_paper ? "Paper" : "Live"} · ${account.unique_identifier}`,
    keywords: [account.unique_identifier, account.is_paper ? "paper" : "live"],
  })), [runAccounts]);

  const rowActions = useMemo<readonly ResourceRowAction<AssetUniverse>[]>(() => [{
    id: "run-universe",
    label: "Extract components",
    disabled: (universe) => !universe.is_active,
    onSelect: (universe) => {
      setRunTarget(universe);
      setRunAccountUid("");
      setRunAccounts([]);
      setRunError(null);
    },
  }], []);

  async function confirmRun() {
    if (!runTarget || !runAccountUid) return;
    setRunPending(true);
    setRunError(null);
    const body = {
      selection: { mode: "explicit", uids: [runTarget.uid] },
      options: { account_uid: runAccountUid },
    };
    try {
      const preflight = await api.post<UniverseRunPreflight>(
        `${API_ENDPOINTS.universes}/actions/run/preflight`,
        body,
      );
      if (!preflight.allowed) {
        throw new Error([preflight.detail, ...preflight.blockers].filter(Boolean).join(" "));
      }
      await api.post(`${API_ENDPOINTS.universes}/actions/run`, body);
      setRunTarget(null);
      setRunAccountUid("");
      setRunRefreshKey((current) => current + 1);
    } catch (error) {
      setRunError(errorMessage(error));
    } finally {
      setRunPending(false);
    }
  }

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  function openContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    const row = (event.target as HTMLElement).closest("tbody tr");
    const body = row?.closest("tbody");
    if (!row || !body) return;
    const rowIndex = Array.from(body.children).indexOf(row);
    const universe = visibleUniverses[rowIndex];
    if (!universe) return;
    event.preventDefault();
    setContextMenu({
      universe,
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 190),
    });
  }

  function invokeSdkRowAction(label: string) {
    if (!contextMenu) return;
    const index = visibleUniverses.findIndex((item) => item.uid === contextMenu.universe.uid);
    const row = document.querySelectorAll(".universe-resource-list tbody tr").item(index);
    const button = Array.from(row?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((candidate) => candidate.textContent?.trim() === label);
    button?.click();
    window.setTimeout(() => setContextMenu(null), 0);
  }

  if (detailUniverseUid) {
    return (
      <UniverseDetail
        universeUid={detailUniverseUid}
        transport={transport}
        onBack={() => setDetailUniverseUid(null)}
      />
    );
  }

  return (
    <div className="universe-resource-list" onContextMenu={openContextMenu}>
      <ResourceListPage
        definition={definition}
        discoveredRowActions={ROW_ACTIONS}
        embedded
        onResult={handleResult}
        onRowActivate={(universe) => setDetailUniverseUid(universe.uid)}
        pageSize={25}
        refreshable
        refreshKey={combinedRefreshKey}
        rowActions={rowActions}
        searchPlaceholder="Search registered universes"
      />
      {contextMenu ? (
        <div
          aria-label={`Actions for ${contextMenu.universe.display_name}`}
          className="universe-context-menu"
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            disabled={!contextMenu.universe.is_active}
            onClick={() => invokeSdkRowAction("Extract components")}
            role="menuitem"
            type="button"
          >
            Extract components
          </button>
          <button
            disabled={contextMenu.universe.is_active}
            onClick={() => invokeSdkRowAction("Activate")}
            role="menuitem"
            type="button"
          >
            Activate
          </button>
          <button
            disabled={!contextMenu.universe.is_active}
            onClick={() => invokeSdkRowAction("Deactivate")}
            role="menuitem"
            type="button"
          >
            Deactivate
          </button>
          <button
            className="universe-context-menu__danger"
            onClick={() => invokeSdkRowAction("Delete")}
            role="menuitem"
            type="button"
          >
            Delete
          </button>
        </div>
      ) : null}
      <ResourceActionConfirmationDialog
        open={runTarget !== null}
        actionLabel="Extract components"
        title="Extract universe components"
        selectionLabel={runTarget?.display_name ?? "universe"}
        description="Read the universe's ETF holdings source, register missing constituent assets through the selected Alpaca account, and replace the linked Asset Category membership. This action does not update market-data bars."
        warning="Category membership changes only after every extracted component is available."
        confirmationValue=""
        confirmButtonLabel="Extract components"
        confirmDisabled={!runAccountUid || runAccountsLoading || runPending}
        pending={runPending}
        error={runError ?? undefined}
        onConfirmationValueChange={() => undefined}
        onClose={() => {
          if (runPending) return;
          setRunTarget(null);
          setRunAccountUid("");
          setRunError(null);
        }}
        onConfirm={confirmRun}
      >
        <div className="field resource-picker-field">
          <label id="universe-run-account-label">Alpaca account for component extraction</label>
          <ResourcePicker
            ariaLabelledBy="universe-run-account-label"
            disabled={runAccountsLoading || runPending}
            emptyMessage="No active registered Alpaca accounts."
            fullWidth
            loading={runAccountsLoading}
            mode="single"
            onValueChange={setRunAccountUid}
            options={runAccountOptions}
            placeholder="Select an account"
            searchable
            searchPlaceholder="Search registered accounts"
            value={runAccountUid || null}
          />
        </div>
      </ResourceActionConfirmationDialog>
    </div>
  );
}
