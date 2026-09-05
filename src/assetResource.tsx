import {
  createHttpResourceAdapter,
  defineResourceApplication,
  type ResourceHttpClient,
  type ResourceHttpRequest,
} from "@dev-mainsequence/command-center-sdk/resource";
import {
  ResourceIconLabelCell,
  ResourceListPage,
  ResourceStatusCell,
} from "@dev-mainsequence/command-center-sdk/views";
import { PackageSearch } from "lucide-react";
import { useMemo } from "react";

import {
  API_ENDPOINTS,
  type ApiTransport,
  type Asset,
  type ResourceCollection,
} from "./api";

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

interface AssetResourceScope {
  id?: string;
  label?: string;
  description?: string;
  listPath?: string;
}

export function buildAssetResource(
  transport: ApiTransport,
  scope: AssetResourceScope = {},
) {
  const adapter = createHttpResourceAdapter<Asset, string, ResourceCollection<Asset>>({
    client: createResourceHttpClient(transport),
    endpoints: {
      list: scope.listPath ?? API_ENDPOINTS.assets,
      detail: (uid) => `${API_ENDPOINTS.assets}/${encodeURIComponent(uid)}`,
      discovery: API_ENDPOINTS.assetDiscovery,
    },
    serializeListQuery: ({ pageIndex, pageSize, search, sort }) => ({
      limit: pageSize,
      offset: pageIndex * pageSize,
      search,
      ordering: sort?.[0]
        ? `${sort[0].direction === "descending" ? "-" : ""}${sort[0].key}`
        : "ticker",
    }),
    normalizeList: (response) => ({ items: response.items, pageInfo: response.pageInfo }),
  });

  return defineResourceApplication({
    id: scope.id ?? "alpaca-assets",
    label: scope.label ?? "Registered Alpaca assets",
    itemLabel: "asset",
    description: scope.description
      ?? "Alpaca UUID is the canonical provider identity. FIGI is optional enrichment.",
    getId: (asset: Asset) => asset.uid,
    adapter,
    columns: [
      {
        id: "ticker",
        header: "Asset",
        getValue: (asset) => asset.ticker,
        sortableKey: "ticker",
        renderCell: (asset) => (
          <ResourceIconLabelCell
            icon={<PackageSearch size={17} />}
            label={asset.ticker}
            meta={asset.name ?? undefined}
          />
        ),
      },
      { id: "uid", header: "UID", getValue: (asset) => asset.uid },
      {
        id: "alpaca-asset-id",
        header: "Alpaca Asset ID",
        getValue: (asset) => asset.alpaca_asset_id,
        sortableKey: "alpaca_asset_id",
      },
      { id: "exchange", header: "Exchange", getValue: (asset) => asset.exchange },
      { id: "figi", header: "FIGI (optional)", getValue: (asset) => asset.figi },
      {
        id: "tradable",
        header: "Trading",
        getValue: (asset) => asset.tradable,
        renderCell: (asset) => (
          <ResourceStatusCell
            label={asset.tradable ? "Tradable" : "Not tradable"}
            tone={asset.tradable ? "success" : "neutral"}
          />
        ),
      },
    ],
  });
}

export function AssetResourceList({
  transport,
  refreshKey,
}: {
  transport: ApiTransport;
  refreshKey: number;
}) {
  const definition = useMemo(() => buildAssetResource(transport), [transport]);
  return (
    <ResourceListPage
      definition={definition}
      embedded
      pageSize={25}
      refreshable
      refreshKey={refreshKey}
      searchPlaceholder="Search Alpaca assets"
    />
  );
}
