import {
  createHttpResourceAdapter,
  defineResourceApplication,
  type ResourceHttpClient,
  type ResourceHttpRequest,
  type ResourceListResult,
} from "@dev-mainsequence/command-center-sdk/resource";
import {
  ResourceIconLabelCell,
  ResourceListPage,
  ResourceStatusCell,
  type ResourceDiscoveredRowAction,
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
  type ApiTransport,
  type MaterializedUniverse,
  type ResourceCollection,
} from "./api";

const ROW_ACTIONS: readonly ResourceDiscoveredRowAction<MaterializedUniverse>[] = [
  {
    id: "run-universe",
    actionId: "run",
    label: "Run",
    disabled: (universe) => !universe.is_active || !universe.source_uid,
  },
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
  universe: MaterializedUniverse;
  x: number;
  y: number;
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
    MaterializedUniverse,
    string,
    ResourceCollection<MaterializedUniverse>
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
    id: "materialized-universes",
    label: "Registered universes",
    itemLabel: "universe",
    description: "Right-click a row or use its Actions controls to run, activate, deactivate, or delete it.",
    getId: (universe: MaterializedUniverse) => universe.uid,
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

export function UniverseResourceList({
  transport,
  refreshKey,
}: {
  transport: ApiTransport;
  refreshKey: number;
}) {
  const definition = useMemo(() => buildUniverseResource(transport), [transport]);
  const [visibleUniverses, setVisibleUniverses] = useState<readonly MaterializedUniverse[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const handleResult = useCallback((result: ResourceListResult<MaterializedUniverse>) => {
    setVisibleUniverses(result.items);
  }, []);

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

  return (
    <div className="universe-resource-list" onContextMenu={openContextMenu}>
      <ResourceListPage
        definition={definition}
        discoveredRowActions={ROW_ACTIONS}
        embedded
        onResult={handleResult}
        pageSize={25}
        refreshable
        refreshKey={refreshKey}
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
            disabled={!contextMenu.universe.is_active || !contextMenu.universe.source_uid}
            onClick={() => invokeSdkRowAction("Run")}
            role="menuitem"
            type="button"
          >
            Run
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
    </div>
  );
}
