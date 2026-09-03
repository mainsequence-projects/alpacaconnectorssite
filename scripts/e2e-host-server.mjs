import { createServer } from "node:http";

const HOST = "127.0.0.1";
const PORT = 4274;
const APP_ORIGIN = "http://127.0.0.1:4273";
const CHANNEL = "mainsequence.alpaca-connectors";
const RELEASE_UID = "11111111-1111-4111-8111-111111111111";
const requestLog = [];
const registrationOperations = new Map();
const universeSources = [
  {
    uid: "source-ivv",
    name: "S&P 500 source",
    symbol: "IVV",
    source_url: "https://example.com/ivv",
    enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    uid: "source-qqq",
    name: "Nasdaq 100 holdings",
    symbol: "QQQ",
    source_url: "https://example.com/qqq",
    enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];
let universes = [
  {
    uid: "universe-ivv",
    unique_identifier: "HOLDINGS__IVV",
    display_name: "S&P 500 holdings",
    description: "Published holdings assets for ETF IVV.",
    is_active: true,
    source_uid: "source-ivv",
    asset_uids: ["asset-aapl", "asset-msft", "asset-nvda"],
    asset_identifiers: ["AAPL", "MSFT", "NVDA"],
    asset_count: 3,
  },
  {
    uid: "universe-qqq",
    unique_identifier: "HOLDINGS__QQQ",
    display_name: "Nasdaq 100 holdings",
    description: "Published holdings assets for ETF QQQ.",
    is_active: true,
    source_uid: "source-qqq",
    asset_uids: ["asset-aapl", "asset-msft"],
    asset_identifiers: ["AAPL", "MSFT"],
    asset_count: 2,
  },
];
let accounts = [
  {
    uid: "account-paper",
    account_uid: "account-paper",
    account_name: "Paper account",
    is_paper: true,
    account_is_active: true,
    unique_identifier: "PAPER__ALPACA",
    api_key_secret_name: "ALPACA_PAPER_API_KEY",
    secret_key_secret_name: "ALPACA_PAPER_SECRET_KEY",
  },
];
const secretReferences = [
  "ALPACA_LIVE_API_KEY",
  "ALPACA_LIVE_SECRET_KEY",
  "ALPACA_PAPER_API_KEY",
  "ALPACA_PAPER_SECRET_KEY",
];
let barConfigurations = [
  {
    uid: "bars-existing",
    name: "Daily paper holdings",
    description: "Refresh the latest persisted paper-account holdings.",
    enabled: true,
    account_uid: "account-paper",
    asset_source: "account_holdings",
    asset_uids: [],
    universe_uid: null,
    frequency_id: "1d",
    feed: "sip",
    adjustment: "all",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const capabilities = [
  ["project_state", "Project State", "Expose API health and current configuration.", "partial", ["api"]],
  ["assets", "Assets", "Resolve and register canonical Alpaca-backed market instruments.", "available", ["cli", "api", "python"]],
  ["universes", "Universes", "Build reusable collections of registered assets.", "available", ["cli", "api", "python"]],
  ["market_data", "Market Data", "Publish and update Alpaca OHLCV observations.", "partial", ["cli", "python"]],
  ["accounts", "Accounts", "Represent and refresh an Alpaca brokerage account.", "partial", ["cli", "python"]],
  ["holdings", "Holdings", "Represent asset exposure from brokerage or fund holdings.", "partial", ["cli", "python"]],
  ["portfolios", "Portfolios", "Construct analytical portfolios from weights and market data.", "partial", ["python"]],
  ["operations", "Operations", "Expose plans, executions, validation failures, and outcomes.", "partial", ["cli", "api", "python"]],
].map(([key, name, purpose, availability, surfaces]) => ({
  key,
  name,
  purpose,
  availability,
  surfaces,
  contents: ["Verified project behavior"],
  actions: ["inspect", "plan", "execute"],
}));

const hostHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8"><title>Command Center host fixture</title></head>
  <body style="margin:0">
    <iframe id="application" title="Alpaca Connectors" src="${APP_ORIGIN}/" style="width:100%;height:900px;border:0"></iframe>
    <script>
      const frame = document.getElementById("application");
      const channel = ${JSON.stringify(CHANNEL)};
      const releaseUid = ${JSON.stringify(RELEASE_UID)};
      function sendContext(themeId, theme) {
        frame.contentWindow.postMessage({
          channel,
          version: 1,
          type: "initialize",
          payload: { theme, themeId, user: { id: "fixture-user", uid: "fixture-user", user_uid: "fixture-user" } },
        }, ${JSON.stringify(APP_ORIGIN)});
      }
      window.switchTheme = () => sendContext("quartz-light", "light");
      window.addEventListener("message", (event) => {
        if (event.origin !== ${JSON.stringify(APP_ORIGIN)} || event.source !== frame.contentWindow) return;
        if (event.data?.channel !== channel || event.data?.version !== 1) return;
        if (event.data.type === "ready") sendContext("main-sequence-space", "dark");
        if (event.data.type === "fastapi-credential-request") {
          frame.contentWindow.postMessage({
            channel,
            version: 1,
            type: "fastapi-credential-response",
            payload: {
              requestId: event.data.payload.requestId,
              resourceReleaseUid: releaseUid,
              rpcUrl: "http://${HOST}:${PORT}/",
              token: "synthetic-delegated-token",
              expiresAt: "2099-01-01T00:00:00Z",
            },
          }, ${JSON.stringify(APP_ORIGIN)});
        }
      });
    </script>
  </body>
</html>`;

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": APP_ORIGIN,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Resource-Release-UID",
    "Access-Control-Allow-Methods": "DELETE, GET, PATCH, POST, OPTIONS",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function assetRegistrationResult(action, body) {
  const symbols = body.symbols ?? body.seed_tickers ?? [];
  if (action === "plan") {
    return {
      request: body,
      plan_summary: { requested_symbols: symbols.length, provider: body.component_provider ?? "exact" },
      resolution_summary: { resolved: symbols.length },
      can_register: true,
      unresolved_symbols: [],
      missing_symbols_from_alpaca: [],
      missing_symbols_to_register: symbols,
      warnings_by_symbol: {},
    };
  }
  return {
    request: body,
    plan_summary: { requested_symbols: symbols.length },
    resolution_summary: { resolved: symbols.length },
    assets_by_symbol: Object.fromEntries(symbols.map((symbol) => [symbol, `asset-${symbol}`])),
    existing_asset_uids_by_symbol: {},
    created_asset_uids_by_symbol: Object.fromEntries(symbols.map((symbol) => [symbol, `asset-${symbol}`])),
    unresolved_symbols: [],
    not_registered_missing_figi_symbols: [],
    not_registered_missing_alpaca_symbols: [],
    warnings_by_symbol: {},
  };
}

function registrationSteps(action) {
  const common = [
    ["prepare_scope", "Prepare registration scope"],
    ["load_alpaca_assets", "Load Alpaca credentials and asset catalog"],
    ["resolve_openfigi_identities", "Resolve OpenFIGI identities"],
    ["check_existing_assets", "Check existing Main Sequence assets"],
  ];
  const final = action === "plan"
    ? [["finalize_plan", "Finalize registration plan"]]
    : [["register_assets", "Register missing assets"], ["finalize_result", "Finalize registration result"]];
  return [...common, ...final].map(([key, label]) => ({
    key,
    label,
    status: "pending",
    message: null,
    started_at: null,
    completed_at: null,
  }));
}

function operationResponse(operation) {
  return {
    operation_uid: operation.uid,
    action: operation.action,
    status: operation.status,
    current_step: operation.currentStep,
    steps: operation.steps,
    request: operation.request,
    result: operation.result,
    error: null,
    created_at: operation.createdAt,
    started_at: operation.startedAt,
    updated_at: new Date().toISOString(),
    completed_at: operation.completedAt,
    poll_after_ms: 10,
  };
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": APP_ORIGIN,
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Resource-Release-UID",
      "Access-Control-Allow-Methods": "DELETE, GET, PATCH, POST, OPTIONS",
    });
    response.end();
    return;
  }
  if (url.pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(hostHtml);
    return;
  }
  if (url.pathname === "/__health") return sendJson(response, 200, { status: "ok" });
  if (url.pathname === "/__requests") return sendJson(response, 200, { requests: requestLog });

  requestLog.push({
    path: url.pathname,
    authorization: request.headers.authorization ?? null,
    resourceReleaseUid: request.headers["x-resource-release-uid"] ?? null,
  });

  if (request.method === "GET" && url.pathname === "/health") return sendJson(response, 200, { status: "ok" });
  if (request.method === "GET" && url.pathname === "/v1/project-state/capabilities") {
    return sendJson(response, 200, { capabilities });
  }
  if (request.method === "GET" && url.pathname === "/v1/project-state/configuration") {
    return sendJson(response, 200, {
      supported_component_providers: ["ishares"],
      migrated_market_data_profiles: ["1d/iex/raw", "1d/sip/all"],
      universe_sources_are_user_managed: true,
      registered_account_count: accounts.length,
      has_registered_account: accounts.length > 0,
    });
  }
  if (request.method === "POST" && url.pathname === "/v1/assets/registration/operations") {
    const body = await readJson(request);
    const uid = `11111111-1111-4111-8111-${String(registrationOperations.size + 1).padStart(12, "0")}`;
    const createdAt = new Date().toISOString();
    const operation = {
      uid,
      action: body.action,
      request: body.request,
      status: "queued",
      currentStep: null,
      steps: registrationSteps(body.action),
      result: null,
      createdAt,
      startedAt: null,
      completedAt: null,
      polls: 0,
    };
    registrationOperations.set(uid, operation);
    return sendJson(response, 202, operationResponse(operation));
  }
  if (request.method === "GET" && url.pathname.startsWith("/v1/assets/registration/operations/")) {
    const uid = decodeURIComponent(url.pathname.split("/").at(-1));
    const operation = registrationOperations.get(uid);
    if (!operation) return sendJson(response, 404, { detail: "Operation not found." });
    operation.polls += 1;
    if (operation.polls === 1) {
      operation.status = "running";
      operation.currentStep = operation.steps[1].key;
      operation.startedAt = new Date().toISOString();
      operation.steps[0] = {
        ...operation.steps[0],
        status: "succeeded",
        message: "Prepared 2 exact symbols.",
        started_at: operation.startedAt,
        completed_at: operation.startedAt,
      };
      operation.steps[1] = {
        ...operation.steps[1],
        status: "running",
        message: "Checking Alpaca availability and resolving OpenFIGI identities.",
        started_at: operation.startedAt,
      };
    } else {
      const completedAt = new Date().toISOString();
      operation.status = "succeeded";
      operation.currentStep = null;
      operation.completedAt = completedAt;
      operation.result = assetRegistrationResult(operation.action, operation.request);
      operation.steps = operation.steps.map((step) => ({
        ...step,
        status: "succeeded",
        message: `${step.label} completed.`,
        started_at: step.started_at ?? operation.startedAt,
        completed_at: completedAt,
      }));
    }
    return sendJson(response, 200, operationResponse(operation));
  }
  if (request.method === "POST" && url.pathname === "/v1/assets/registration/plan") {
    const body = await readJson(request);
    const symbols = body.symbols ?? body.seed_tickers ?? [];
    return sendJson(response, 200, {
      request: body,
      plan_summary: { requested_symbols: symbols.length, provider: body.component_provider ?? "exact" },
      resolution_summary: { resolved: symbols.length },
      can_register: true,
      unresolved_symbols: [],
      missing_symbols_from_alpaca: [],
      missing_symbols_to_register: symbols,
      warnings_by_symbol: {},
    });
  }
  if (request.method === "POST" && url.pathname === "/v1/assets/registration/execute") {
    const body = await readJson(request);
    const symbols = body.symbols ?? body.seed_tickers ?? [];
    return sendJson(response, 200, {
      request: body,
      plan_summary: { requested_symbols: symbols.length },
      resolution_summary: { resolved: symbols.length },
      assets_by_symbol: Object.fromEntries(symbols.map((symbol) => [symbol, `asset-${symbol}`])),
      existing_asset_uids_by_symbol: {},
      created_asset_uids_by_symbol: Object.fromEntries(symbols.map((symbol) => [symbol, `asset-${symbol}`])),
      unresolved_symbols: [],
      not_registered_missing_figi_symbols: [],
      not_registered_missing_alpaca_symbols: [],
      warnings_by_symbol: {},
    });
  }
  if (request.method === "GET" && url.pathname === "/v1/accounts/secret-references") {
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const matched = secretReferences.filter((name) => !search || name.toLowerCase().includes(search));
    return sendJson(response, 200, {
      items: matched.map((name) => ({ name })),
      pageInfo: {
        pageIndex: 0,
        pageSize: Number(url.searchParams.get("limit") ?? 100),
        totalItems: matched.length,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  }
  if (request.method === "GET" && url.pathname === "/v1/accounts/discovery") {
    return sendJson(response, 200, {
      contract: "command-center.resource_discovery@v1",
      resource: {
        id: "alpaca-accounts",
        label: "Alpaca Accounts",
        item_label: "account",
        identity: { fields: ["uid"] },
      },
      list: {
        controls: {
          search: {
            placeholder: "Search Alpaca accounts",
            fields: ["account_name", "unique_identifier"],
          },
          filters: [
            { key: "account_is_active", label: "Active", type: "boolean" },
            { key: "is_paper", label: "Paper", type: "boolean" },
          ],
          ordering: ["account_name", "unique_identifier"],
        },
        columns: [
          { id: "account-name", header: "Account", value_path: "account_name", data_type: "text", default_visible: true, hideable: false, sortable_key: "account_name" },
          { id: "unique-identifier", header: "Identifier", value_path: "unique_identifier", data_type: "text", default_visible: true, hideable: true, sortable_key: "unique_identifier" },
          { id: "is-paper", header: "Paper", value_path: "is_paper", data_type: "boolean", default_visible: true, hideable: true, filter_key: "is_paper" },
          { id: "account-is-active", header: "Active", value_path: "account_is_active", data_type: "boolean", default_visible: true, hideable: true, filter_key: "account_is_active" },
          { id: "snapshot-time", header: "Last Refresh", value_path: "snapshot_time", data_type: "datetime", default_visible: true, hideable: true },
        ],
      },
      bulk_actions: [],
    });
  }
  if (request.method === "GET" && url.pathname === "/v1/accounts") {
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const active = url.searchParams.get("active");
    const isPaper = url.searchParams.get("is_paper");
    const matched = accounts.filter((account) => (
      (!search
        || account.account_name.toLowerCase().includes(search)
        || account.unique_identifier.toLowerCase().includes(search))
      && (active === null || account.account_is_active === (active === "true"))
      && (isPaper === null || account.is_paper === (isPaper === "true"))
    ));
    return sendJson(response, 200, {
      items: matched,
      pageInfo: {
        pageIndex: 0,
        pageSize: Number(url.searchParams.get("limit") ?? 25),
        totalItems: matched.length,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  }
  if (request.method === "POST" && url.pathname === "/v1/accounts") {
    const body = await readJson(request);
    const now = new Date().toISOString();
    const uid = `account-${accounts.length + 1}`;
    const created = {
      uid,
      account_uid: uid,
      unique_identifier: `${uid.toUpperCase()}__ALPACA_${body.environment.toUpperCase()}`,
      account_name: body.account_name,
      is_paper: body.environment === "paper",
      account_is_active: true,
      api_key_secret_name: body.api_key_secret_name,
      secret_key_secret_name: body.secret_key_secret_name,
      status: "ACTIVE",
      currency: "USD",
      snapshot_time: body.capture_initial_holdings ? now : null,
      equity: "100000",
      cash: "50000",
      buying_power: "200000",
    };
    accounts.push(created);
    return sendJson(response, 201, created);
  }
  const accountMatch = url.pathname.match(/^\/v1\/accounts\/([^/]+)$/);
  if (accountMatch) {
    const uid = decodeURIComponent(accountMatch[1]);
    const index = accounts.findIndex((account) => account.uid === uid);
    if (index < 0) return sendJson(response, 404, { detail: "Account registration not found." });
    if (request.method === "GET") return sendJson(response, 200, accounts[index]);
    if (request.method === "PATCH") {
      const body = await readJson(request);
      accounts[index] = { ...accounts[index], ...body };
      return sendJson(response, 200, accounts[index]);
    }
    if (request.method === "DELETE") {
      const [deleted] = accounts.splice(index, 1);
      return sendJson(response, 200, { account_uid: deleted.uid, deleted: true });
    }
  }
  if (request.method === "GET" && url.pathname === "/v1/universe-sources") {
    return sendJson(response, 200, {
      items: universeSources.filter((source) => source.enabled),
      pageInfo: {
        pageIndex: 0,
        pageSize: 100,
        totalItems: universeSources.length,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  }
  if (
    request.method === "POST"
    && /^\/v1\/universe-sources\/[^/]+\/actions\/preview$/.test(url.pathname)
  ) {
    const sourceUid = decodeURIComponent(url.pathname.split("/")[3]);
    const source = universeSources.find((candidate) => candidate.uid === sourceUid);
    if (!source) return sendJson(response, 404, { detail: "Universe source not found." });
    return sendJson(response, 200, {
      source,
      plan_summary: { etf_ticker: source.symbol, constituents: 3, registered_assets: 3 },
      has_blockers: false,
    });
  }
  if (request.method === "POST" && url.pathname === "/v1/universe-sources/actions/sync") {
    const body = await readJson(request);
    const source = universeSources.find((candidate) => candidate.uid === body.selection?.uids?.[0]);
    if (!source) return sendJson(response, 404, { detail: "Universe source not found." });
    const materialized = universes.find((universe) => universe.unique_identifier === `HOLDINGS__${source.symbol}`);
    return sendJson(response, 200, {
      results: [{
        source_uid: source.uid,
        unique_identifier: materialized.unique_identifier,
        display_name: materialized.display_name,
        asset_uids: materialized.asset_uids,
        asset_count: materialized.asset_count,
      }],
    });
  }
  if (request.method === "GET" && url.pathname === "/v1/universes/discovery") {
    return sendJson(response, 200, {
      contract: "command-center.resource_discovery@v1",
      resource: {
        id: "materialized-universes",
        label: "Registered universes",
        item_label: "universe",
        identity: { fields: ["uid"] },
      },
      list: {
        controls: {
          search: {
            placeholder: "Search registered universes",
            fields: ["display_name", "unique_identifier"],
          },
          filters: [],
          ordering: ["display_name", "unique_identifier"],
        },
        columns: [
          { id: "display-name", header: "Universe", default_visible: true, hideable: false, sortable_key: "display_name" },
          { id: "uid", header: "UID", value_path: "uid", data_type: "text", default_visible: true, hideable: true },
          { id: "asset-count", header: "Assets", value_path: "asset_count", data_type: "number", default_visible: true, hideable: true },
          { id: "is-active", header: "Status", value_path: "is_active", data_type: "boolean", default_visible: true, hideable: true },
        ],
      },
      bulk_actions: [
        {
          id: "run",
          label: "Run",
          endpoint: "/v1/universes/actions/run",
          preflight_endpoint: "/v1/universes/actions/run/preflight",
          method: "POST",
          selection_modes: ["explicit"],
          options: [],
        },
        {
          id: "activate",
          label: "Activate",
          endpoint: "/v1/universes/actions/activate",
          preflight_endpoint: "/v1/universes/actions/activate/preflight",
          method: "POST",
          selection_modes: ["explicit"],
          options: [],
        },
        {
          id: "deactivate",
          label: "Deactivate",
          endpoint: "/v1/universes/actions/deactivate",
          preflight_endpoint: "/v1/universes/actions/deactivate/preflight",
          method: "POST",
          tone: "danger",
          selection_modes: ["explicit"],
          confirmation: {
            title: "Deactivate universes",
            word: "DEACTIVATE",
            button_label: "Deactivate",
            warning: "Inactive universes cannot be used for new market-data updates.",
          },
          options: [],
        },
        {
          id: "remove",
          label: "Delete",
          endpoint: "/v1/universes/actions/remove",
          preflight_endpoint: "/v1/universes/actions/remove/preflight",
          method: "POST",
          tone: "danger",
          selection_modes: ["explicit"],
          confirmation: {
            title: "Delete universes",
            word: "DELETE",
            button_label: "Delete",
            warning: "The category and all of its memberships will be permanently deleted.",
          },
          options: [],
        },
      ],
    });
  }
  if (request.method === "GET" && url.pathname === "/v1/universes") {
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const matched = universes.filter((universe) => (
      !search
      || universe.display_name.toLowerCase().includes(search)
      || universe.unique_identifier.toLowerCase().includes(search)
    ));
    return sendJson(response, 200, {
      items: matched,
      pageInfo: {
        pageIndex: 0,
        pageSize: Number(url.searchParams.get("limit") ?? 25),
        totalItems: matched.length,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  }
  if (request.method === "POST" && url.pathname === "/v1/universes") {
    const body = await readJson(request);
    const normalizedSymbol = String(body.symbol ?? "").trim().toUpperCase();
    const sourceUid = `source-${normalizedSymbol.toLowerCase()}`;
    const now = new Date().toISOString();
    if (!universeSources.some((source) => source.uid === sourceUid)) {
      universeSources.push({
        uid: sourceUid,
        name: body.name,
        symbol: normalizedSymbol,
        source_url: body.source_url,
        enabled: true,
        created_at: now,
        updated_at: now,
      });
    }
    const universe = {
      uid: `universe-${normalizedSymbol.toLowerCase()}`,
      unique_identifier: `HOLDINGS__${normalizedSymbol}`,
      display_name: body.name,
      description: `Configured holdings universe for ETF ${normalizedSymbol}.`,
      is_active: true,
      source_uid: sourceUid,
      asset_uids: [],
      asset_identifiers: [],
      asset_count: 0,
    };
    universes.push(universe);
    return sendJson(response, 201, universe);
  }
  const universeActionMatch = url.pathname.match(
    /^\/v1\/universes\/actions\/(run|activate|deactivate|remove)(\/preflight)?$/,
  );
  if (request.method === "POST" && universeActionMatch) {
    const body = await readJson(request);
    const action = universeActionMatch[1];
    const selectedUids = body.selection?.uids ?? [];
    const selected = universes.filter((universe) => selectedUids.includes(universe.uid));
    const missing = selectedUids.filter((uid) => !selected.some((universe) => universe.uid === uid));
    if (universeActionMatch[2]) {
      return sendJson(response, 200, {
        contract: "command-center.bulk_action_preflight@v1",
        allowed: missing.length === 0,
        detail: missing.length === 0 ? "The selected action is ready." : "A universe is missing.",
        matched_count: selected.length,
        blockers: missing.map((uid) => `Missing universe: ${uid}`),
        warnings: action === "remove" ? [`${selected.reduce((count, universe) => count + universe.asset_count, 0)} memberships will be deleted.`] : [],
        results: action === "run" ? selected.map((universe) => ({
          universe,
          plan_summary: { constituents: 3, registered_assets: 3 },
          has_blockers: false,
        })) : undefined,
      });
    }
    if (missing.length > 0) return sendJson(response, 409, { detail: "A universe is missing." });
    if (action === "remove") {
      universes = universes.filter((universe) => !selectedUids.includes(universe.uid));
      return sendJson(response, 200, { results: selected.map((universe) => ({ category_uid: universe.uid, deleted: true })) });
    }
    if (action === "run") {
      universes = universes.map((universe) => (
        selectedUids.includes(universe.uid)
          ? {
              ...universe,
              asset_uids: ["asset-aapl", "asset-msft", "asset-nvda"],
              asset_identifiers: ["AAPL", "MSFT", "NVDA"],
              asset_count: 3,
            }
          : universe
      ));
      return sendJson(response, 200, {
        results: universes.filter((universe) => selectedUids.includes(universe.uid)),
      });
    }
    const isActive = action === "activate";
    universes = universes.map((universe) => (
      selectedUids.includes(universe.uid) ? { ...universe, is_active: isActive } : universe
    ));
    return sendJson(response, 200, {
      results: universes.filter((universe) => selectedUids.includes(universe.uid)),
    });
  }
  if (request.method === "GET" && url.pathname === "/v1/market-data/bar-configurations/discovery") {
    return sendJson(response, 200, {
      contract: "command-center.resource_discovery@v1",
      resource: {
        id: "alpaca-bar-configurations",
        label: "Alpaca Bar Configurations",
        item_label: "configuration",
        identity: { fields: ["uid"] },
      },
      list: {
        controls: {
          search: {
            placeholder: "Search alpaca bar configurations",
            fields: ["name", "description"],
          },
          filters: [
            { key: "enabled", label: "Enabled", type: "boolean" },
            {
              key: "asset_source",
              label: "Asset Source",
              type: "select",
              options: [
                { value: "account_holdings", label: "Latest account holdings" },
                { value: "universe", label: "Registered universe" },
                { value: "assets", label: "Explicit assets" },
              ],
            },
          ],
          ordering: ["name", "updated_at", "frequency_id"],
        },
        columns: [
          { id: "name", header: "Configuration", default_visible: true, hideable: false, sortable_key: "name" },
          { id: "asset-source", header: "Asset Source", value_path: "asset_source", data_type: "text", default_visible: true, hideable: true, filter_key: "asset_source" },
          { id: "frequency-id", header: "Frequency", value_path: "frequency_id", data_type: "text", default_visible: true, hideable: true, sortable_key: "frequency_id" },
          { id: "feed", header: "Feed", default_visible: true, hideable: true },
          { id: "adjustment", header: "Adjustment", default_visible: true, hideable: true },
          { id: "enabled", header: "Enabled", value_path: "enabled", data_type: "boolean", default_visible: true, hideable: true, filter_key: "enabled" },
          { id: "updated-at", header: "Updated", value_path: "updated_at", data_type: "datetime", default_visible: true, hideable: true, sortable_key: "updated_at" },
        ],
      },
      bulk_actions: [],
    });
  }
  if (request.method === "GET" && url.pathname === "/v1/market-data/bar-configurations") {
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const matched = barConfigurations.filter((configuration) => (
      !search
      || configuration.name.toLowerCase().includes(search)
      || configuration.description?.toLowerCase().includes(search)
    ));
    return sendJson(response, 200, {
      items: matched,
      pageInfo: {
        pageIndex: 0,
        pageSize: Number(url.searchParams.get("limit") ?? 25),
        totalItems: matched.length,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  }
  if (request.method === "POST" && url.pathname === "/v1/market-data/bar-configurations") {
    const body = await readJson(request);
    const now = new Date().toISOString();
    const created = {
      ...body,
      uid: `bars-${barConfigurations.length + 1}`,
      created_at: now,
      updated_at: now,
    };
    barConfigurations.push(created);
    return sendJson(response, 201, created);
  }
  const barConfigurationMatch = url.pathname.match(/^\/v1\/market-data\/bar-configurations\/([^/]+)$/);
  if (barConfigurationMatch) {
    const uid = decodeURIComponent(barConfigurationMatch[1]);
    const index = barConfigurations.findIndex((configuration) => configuration.uid === uid);
    if (index < 0) return sendJson(response, 404, { detail: "Bar configuration not found." });
    if (request.method === "GET") return sendJson(response, 200, barConfigurations[index]);
    if (request.method === "PATCH") {
      const body = await readJson(request);
      barConfigurations[index] = {
        ...barConfigurations[index],
        ...body,
        updated_at: new Date().toISOString(),
      };
      return sendJson(response, 200, barConfigurations[index]);
    }
    if (request.method === "DELETE") {
      const [deleted] = barConfigurations.splice(index, 1);
      return sendJson(response, 200, { uid: deleted.uid, deleted: true });
    }
  }
  return sendJson(response, 404, { detail: "Fixture route not found." });
}).listen(PORT, HOST, () => {
  process.stdout.write(`E2E host fixture listening at http://${HOST}:${PORT}\n`);
});
