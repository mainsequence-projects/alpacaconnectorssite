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
    source_uid: "source-ivv",
    asset_category_uid: "category-ivv",
    display_name: "S&P 500 holdings",
    symbol: "IVV",
    source_url: "https://example.com/ivv",
    description: "Published holdings assets for ETF IVV.",
    is_active: true,
    asset_count: 3,
    asset_category: {
      uid: "category-ivv",
      unique_identifier: "HOLDINGS__IVV",
      display_name: "S&P 500 holdings",
      description: "Published holdings assets for ETF IVV.",
    },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    uid: "universe-qqq",
    source_uid: "source-qqq",
    asset_category_uid: "category-qqq",
    display_name: "Nasdaq 100 holdings",
    symbol: "QQQ",
    source_url: "https://example.com/qqq",
    description: "Published holdings assets for ETF QQQ.",
    is_active: true,
    asset_count: 2,
    asset_category: {
      uid: "category-qqq",
      unique_identifier: "HOLDINGS__QQQ",
      display_name: "Nasdaq 100 holdings",
      description: "Published holdings assets for ETF QQQ.",
    },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    uid: "universe-iwm",
    source_uid: "source-iwm",
    asset_category_uid: "category-iwm",
    display_name: "Russell 2000 holdings",
    symbol: "IWM",
    source_url: "https://example.com/iwm",
    description: "Published holdings assets for ETF IWM.",
    is_active: true,
    asset_count: 0,
    asset_category: {
      uid: "category-iwm",
      unique_identifier: "HOLDINGS__IWM",
      display_name: "Russell 2000 holdings",
      description: "Published holdings assets for ETF IWM.",
    },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];
const universeMemberAssetUids = new Map([
  ["universe-ivv", ["asset-aapl", "asset-msft", "asset-nvda"]],
  ["universe-qqq", ["asset-aapl", "asset-msft"]],
  ["universe-iwm", []],
]);
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
    status: "ACTIVE",
    currency: "USD",
    snapshot_time: "2026-01-03T14:30:00Z",
    equity: "125000",
    cash: "25000",
    buying_power: "50000",
  },
];
const accountHoldings = {
  "account-paper": [
    {
      time_index: "2026-01-03T14:30:00Z",
      account_uid: "account-paper",
      asset_identifier: "ALPACA::11111111-1111-4111-8111-111111111111",
      asset_uid: "asset-aapl",
      holdings_set_uid: "holdings-set-paper-latest",
      is_trade_snapshot: false,
      quantity: 125,
      direction: 1,
      target_trade_time: null,
      extra_details: { symbol: "AAPL", asset_class: "us_equity", exchange: "NASDAQ" },
    },
    {
      time_index: "2026-01-03T14:30:00Z",
      account_uid: "account-paper",
      asset_identifier: "USD",
      asset_uid: "asset-usd",
      holdings_set_uid: "holdings-set-paper-latest",
      is_trade_snapshot: false,
      quantity: 25000,
      direction: 1,
      target_trade_time: null,
      extra_details: { kind: "cash" },
    },
  ],
};
const assets = [
  {
    uid: "asset-aapl",
    unique_identifier: "ALPACA::11111111-1111-4111-8111-111111111111",
    alpaca_asset_id: "11111111-1111-4111-8111-111111111111",
    ticker: "AAPL",
    name: "Apple Inc.",
    asset_type: "equity",
    exchange: "NASDAQ",
    status: "active",
    tradable: true,
    figi: "BBG000B9XRY4",
    composite_figi: "BBG000B9XRY4",
  },
  {
    uid: "asset-msft",
    unique_identifier: "ALPACA::22222222-2222-4222-8222-222222222222",
    alpaca_asset_id: "22222222-2222-4222-8222-222222222222",
    ticker: "MSFT",
    name: "Microsoft Corporation",
    asset_type: "equity",
    exchange: "NASDAQ",
    status: "active",
    tradable: true,
    figi: null,
    composite_figi: null,
  },
  {
    uid: "asset-nvda",
    unique_identifier: "ALPACA::33333333-3333-4333-8333-333333333333",
    alpaca_asset_id: "33333333-3333-4333-8333-333333333333",
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    asset_type: "equity",
    exchange: "NASDAQ",
    status: "active",
    tradable: true,
    figi: null,
    composite_figi: null,
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
let signalJobs = [
  {
    uid: "signal-existing",
    name: "Daily IVV observation",
    description: "Observe the registered S&P 500 Universe.",
    signal_uid: "signal-universe-ivv",
    universe_uid: "universe-ivv",
    account_uid: "account-paper",
    job_uid: "job-signal-existing",
    enabled: true,
    schedule_type: "interval",
    schedule_every: 1,
    schedule_period: "days",
    schedule_expression: null,
    schedule_timezone: null,
    schedule_start_time: null,
    cpu_request: "0.25",
    memory_request: "0.5",
    max_runtime_seconds: 3600,
    spot: false,
    lifecycle_state: "ready",
    last_error: null,
    job_image_status: "ready",
    job_automatic_deployment: true,
    latest_run_status: null,
    latest_run_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];
let portfolioRebalanceConfigurations = [
  {
    uid: "rebalance-immediate",
    name: "Immediate observed weights",
    description: "Apply every observed ETF weight frame immediately.",
    strategy: "immediate_signal",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];
let portfolioConfigurations = [
  {
    uid: "portfolio-config-existing",
    name: "Daily IVV analytical portfolio",
    description: "Track observed IVV weights using daily Alpaca bars.",
    signal_configuration_uid: "signal-existing",
    signal_uid: "signal-universe-ivv",
    bars_configuration_uid: "bars-existing",
    rebalance_configuration_uid: "rebalance-immediate",
    rebalance_strategy: "immediate_signal",
    portfolio_uid: "portfolio-existing",
    job_uid: "job-portfolio-existing",
    upsample_frequency_id: "1d",
    intraday_bar_interpolation_rule: "ffill",
    valuation_column: "close",
    portfolio_prices_frequency: "1d",
    forward_fill_to_now: false,
    fail_on_missing_prices: true,
    commission_fee: 0.00018,
    job: {
      uid: "job-portfolio-existing",
      schedule_type: "interval",
      schedule_every: 1,
      schedule_period: "days",
      schedule_expression: null,
      schedule_timezone: null,
      schedule_timezone_explicit: null,
      schedule_start_time: null,
      cpu_request: "0.25",
      memory_request: "0.5",
      max_runtime_seconds: 3600,
      spot: false,
      image_status: "ready",
      automatic_deployment: true,
    },
    latest_run_status: "SUCCEEDED",
    latest_run_at: "2026-01-03T15:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-03T15:00:00Z",
  },
];

function portfolioConfigurationDetail(configuration) {
  const materialized = configuration.portfolio_uid !== null;
  const observations = materialized ? [
    {
      time_index: "2026-01-01T15:00:00Z",
      close: 100,
      period_return: null,
      calculated_close: 100,
      close_time: "2026-01-01T21:00:00Z",
      cumulative_return: 0,
      drawdown: 0,
    },
    {
      time_index: "2026-01-02T15:00:00Z",
      close: 100.82,
      period_return: 0.0082,
      calculated_close: 100.82,
      close_time: "2026-01-02T21:00:00Z",
      cumulative_return: 0.0082,
      drawdown: 0,
    },
    {
      time_index: "2026-01-03T15:00:00Z",
      close: 101.4,
      period_return: 0.0057528,
      calculated_close: 101.4,
      close_time: "2026-01-03T21:00:00Z",
      cumulative_return: 0.014,
      drawdown: 0,
    },
  ] : [];
  return {
    ...configuration,
    linked_signal: {
      name: "Daily IVV observation",
      description: "Observe current IVV constituents and weights.",
      enabled: true,
      universe_name: "iShares Core S&P 500 ETF",
      universe_symbol: "IVV",
      account_name: "Paper brokerage",
      account_environment: "paper",
    },
    linked_bars: {
      name: "Daily paper holdings",
      description: "Daily SIP bars for the configured universe.",
      enabled: true,
      account_name: "Paper brokerage",
      account_environment: "paper",
      asset_source: "universe",
      asset_source_name: "iShares Core S&P 500 ETF (IVV)",
      asset_count: 504,
      frequency_id: "1d",
      feed: "sip",
      adjustment: "all",
    },
    linked_rebalance: portfolioRebalanceConfigurations[0],
    canonical_portfolio: {
      materialized,
      description: configuration.description,
      calendar_name: materialized ? "NYSE trading calendar" : null,
      calendar_type: materialized ? "exchange_calendar" : null,
      calendar_timezone: materialized ? "America/New_York" : null,
      calendar_valid_from: materialized ? "2026-01-01" : null,
      calendar_valid_to: materialized ? "2026-12-31" : null,
      backtest_price_column: materialized ? "close" : null,
      observation_count: observations.length,
      total_observation_count: observations.length,
      history_window_truncated: false,
      latest_observation_at: observations.at(-1)?.time_index ?? null,
      latest_close: observations.at(-1)?.close ?? null,
      latest_period_return: observations.at(-1)?.period_return ?? null,
      performance: {
        methodology: "empyrical-reloaded",
        frequency: "daily",
        annualization_factor: 252,
        risk_free_rate: 0,
        observation_count: observations.length,
        return_observation_count: materialized ? 2 : 0,
        period_start: observations.at(0)?.time_index ?? null,
        period_end: observations.at(-1)?.time_index ?? null,
        total_return: materialized ? 0.014 : null,
        annualized_return: materialized ? 4.74 : null,
        annualized_volatility: materialized ? 0.0275 : null,
        sharpe_ratio: materialized ? 49.8 : null,
        sortino_ratio: null,
        max_drawdown: materialized ? 0 : null,
        calmar_ratio: null,
        best_period_return: materialized ? 0.0082 : null,
        worst_period_return: materialized ? 0.0057528 : null,
        positive_period_ratio: materialized ? 1 : null,
      },
      observations,
    },
  };
}
const signalObservations = {
  "signal-existing": {
    configuration_uid: "signal-existing",
    signal_uid: "signal-universe-ivv",
    observation_count: 3,
    asset_count: 3,
    time_indexes: [
      "2026-01-01T14:30:00Z",
      "2026-01-02T14:30:00Z",
      "2026-01-03T14:30:00Z",
    ],
    assets: [
      {
        asset_identifier: "ALPACA::11111111-1111-4111-8111-111111111111",
        symbol: "AAPL",
        name: "Apple Inc.",
        weights: [0.07, 0.075, 0.08],
      },
      {
        asset_identifier: "ALPACA::22222222-2222-4222-8222-222222222222",
        symbol: "MSFT",
        name: "Microsoft Corporation",
        weights: [0.06, 0.055, 0.05],
      },
      {
        asset_identifier: "ALPACA::33333333-3333-4333-8333-333333333333",
        symbol: "NVDA",
        name: "NVIDIA Corporation",
        weights: [0, null, 0.04],
      },
    ],
  },
};

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
  const symbols = body.symbols ?? [];
  if (action === "plan") {
    return {
      request: body,
      plan_summary: { requested_symbols: symbols.length },
      resolution_summary: { resolved: symbols.length },
      can_register: true,
      missing_symbols_from_alpaca: [],
      missing_symbols_to_register: symbols,
      openfigi_unmatched_symbols: symbols.includes("NVDA") ? ["NVDA"] : [],
      warnings_by_symbol: symbols.includes("NVDA")
        ? { NVDA: "OpenFIGI returned no unambiguous match; Alpaca registration remains available." }
        : {},
    };
  }
  return {
    request: body,
    plan_summary: { requested_symbols: symbols.length },
    resolution_summary: { resolved: symbols.length },
    assets_by_symbol: Object.fromEntries(symbols.map((symbol) => [symbol, `asset-${symbol}`])),
    existing_asset_uids_by_symbol: {},
    created_asset_uids_by_symbol: Object.fromEntries(symbols.map((symbol) => [symbol, `asset-${symbol}`])),
    not_registered_missing_alpaca_symbols: [],
    openfigi_unmatched_symbols: [],
    warnings_by_symbol: {},
  };
}

function registrationSteps(action) {
  const common = [
    ["prepare_scope", "Prepare registration scope"],
    ["resolve_account", "Resolve registered Alpaca account"],
    ["load_alpaca_assets", "Load Alpaca asset catalog"],
    ["resolve_alpaca_identities", "Resolve Alpaca asset identities"],
    ["enrich_openfigi_details", "Enrich optional OpenFIGI details"],
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
      organization_environment_uid: "environment-local",
      organization_environment_name: "Local development",
      registered_account_count: accounts.length,
      has_registered_account: accounts.length > 0,
    });
  }
  if (request.method === "GET" && url.pathname === "/v1/assets/discovery") {
    return sendJson(response, 200, {
      contract: "command-center.resource_discovery@v1",
      resource: {
        id: "alpaca-assets",
        label: "Registered Alpaca assets",
        item_label: "asset",
        identity: { fields: ["uid"] },
      },
      list: {
        controls: {
          search: {
            placeholder: "Search registered assets",
            fields: ["ticker", "name", "alpaca_asset_id", "unique_identifier"],
          },
          filters: [],
          ordering: ["ticker", "alpaca_asset_id"],
        },
        columns: [
          { id: "uid", header: "UID", value_path: "uid", data_type: "text", default_visible: true, hideable: false },
          { id: "ticker", header: "Ticker", value_path: "ticker", data_type: "text", default_visible: true, hideable: false, sortable_key: "ticker" },
          { id: "name", header: "Name", value_path: "name", data_type: "text", default_visible: true, hideable: true },
          { id: "alpaca-asset-id", header: "Alpaca Asset ID", value_path: "alpaca_asset_id", data_type: "text", default_visible: true, hideable: true, sortable_key: "alpaca_asset_id" },
          { id: "exchange", header: "Exchange", value_path: "exchange", data_type: "text", default_visible: true, hideable: true },
          { id: "figi", header: "FIGI (optional)", value_path: "figi", data_type: "text", default_visible: true, hideable: true },
          { id: "tradable", header: "Trading", value_path: "tradable", data_type: "boolean", default_visible: true, hideable: true },
          { id: "asset-type", header: "Asset Type", value_path: "asset_type", data_type: "text", default_visible: true, hideable: true },
        ],
      },
      bulk_actions: [],
    });
  }
  if (request.method === "GET" && url.pathname === "/v1/assets") {
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const matched = assets.filter((asset) => (
      !search
      || asset.ticker.toLowerCase().includes(search)
      || asset.name.toLowerCase().includes(search)
      || asset.alpaca_asset_id.includes(search)
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
        message: "Resolving the selected registered Alpaca account.",
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
    const symbols = body.symbols ?? [];
    return sendJson(response, 200, {
      request: body,
      plan_summary: { requested_symbols: symbols.length },
      resolution_summary: { resolved: symbols.length },
      can_register: true,
      missing_symbols_from_alpaca: [],
      missing_symbols_to_register: symbols,
      openfigi_unmatched_symbols: symbols.includes("NVDA") ? ["NVDA"] : [],
      warnings_by_symbol: symbols.includes("NVDA")
        ? { NVDA: "OpenFIGI returned no unambiguous match; Alpaca registration remains available." }
        : {},
    });
  }
  if (request.method === "POST" && url.pathname === "/v1/assets/registration/execute") {
    const body = await readJson(request);
    const symbols = body.symbols ?? [];
    return sendJson(response, 200, {
      request: body,
      plan_summary: { requested_symbols: symbols.length },
      resolution_summary: { resolved: symbols.length },
      assets_by_symbol: Object.fromEntries(symbols.map((symbol) => [symbol, `asset-${symbol}`])),
      existing_asset_uids_by_symbol: {},
      created_asset_uids_by_symbol: Object.fromEntries(symbols.map((symbol) => [symbol, `asset-${symbol}`])),
      not_registered_missing_alpaca_symbols: [],
      openfigi_unmatched_symbols: [],
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
      snapshot_time: now,
      equity: "100000",
      cash: "50000",
      buying_power: "200000",
    };
    accounts.push(created);
    return sendJson(response, 201, created);
  }
  const accountHoldingsDiscoveryMatch = url.pathname.match(
    /^\/v1\/accounts\/([^/]+)\/holdings\/latest\/discovery$/,
  );
  if (request.method === "GET" && accountHoldingsDiscoveryMatch) {
    return sendJson(response, 200, {
      contract: "command-center.resource_discovery@v1",
      resource: {
        id: "alpaca-account-latest-holdings",
        label: "Latest holdings",
        item_label: "holding",
        identity: { fields: ["time_index", "account_uid", "asset_identifier"] },
      },
      list: {
        controls: {
          search: null,
          filters: [{ key: "asset_identifier", label: "Asset Identifier", type: "text" }],
          ordering: ["time_index", "asset_identifier"],
        },
        columns: [
          { id: "time-index", header: "Time", value_path: "time_index", data_type: "datetime", default_visible: true, hideable: false, sortable_key: "time_index" },
          { id: "asset-identifier", header: "Asset", value_path: "asset_identifier", data_type: "text", default_visible: true, hideable: true, sortable_key: "asset_identifier", filter_key: "asset_identifier" },
          { id: "quantity", header: "Quantity", value_path: "quantity", data_type: "number", default_visible: true, hideable: true },
          { id: "direction", header: "Direction", value_path: "direction", data_type: "number", default_visible: true, hideable: true },
          { id: "holdings-set-uid", header: "Snapshot UID", value_path: "holdings_set_uid", data_type: "text", default_visible: true, hideable: true },
        ],
      },
      bulk_actions: [],
    });
  }
  const accountHoldingsMatch = url.pathname.match(
    /^\/v1\/accounts\/([^/]+)\/holdings\/latest$/,
  );
  if (request.method === "GET" && accountHoldingsMatch) {
    const accountUid = decodeURIComponent(accountHoldingsMatch[1]);
    const items = accountHoldings[accountUid] ?? [];
    const limit = Number(url.searchParams.get("limit") ?? 25);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return sendJson(response, 200, {
      items: items.slice(offset, offset + limit),
      pageInfo: {
        pageIndex: offset / limit,
        pageSize: limit,
        totalItems: items.length,
        hasNextPage: offset + limit < items.length,
        hasPreviousPage: offset > 0,
      },
    });
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
  if (request.method === "GET" && url.pathname === "/v1/universes/discovery") {
    return sendJson(response, 200, {
      contract: "command-center.resource_discovery@v1",
      resource: {
        id: "asset-universes",
        label: "Registered universes",
        item_label: "universe",
        identity: { fields: ["uid"] },
      },
      list: {
        controls: {
          search: {
            placeholder: "Search registered universes",
            fields: ["display_name", "symbol"],
          },
          filters: [],
          ordering: ["display_name", "symbol", "updated_at"],
        },
        columns: [
          { id: "display-name", header: "Universe", default_visible: true, hideable: false, sortable_key: "display_name" },
          { id: "symbol", header: "Symbol", value_path: "symbol", data_type: "text", default_visible: true, hideable: true, sortable_key: "symbol" },
          { id: "uid", header: "UID", value_path: "uid", data_type: "text", default_visible: true, hideable: true },
          { id: "asset-count", header: "Assets", value_path: "asset_count", data_type: "number", default_visible: true, hideable: true },
          { id: "is-active", header: "Status", value_path: "is_active", data_type: "boolean", default_visible: true, hideable: true },
        ],
      },
      bulk_actions: [
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
      || universe.symbol.toLowerCase().includes(search)
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
  const universeAssetsMatch = url.pathname.match(/^\/v1\/universes\/([^/]+)\/assets$/);
  if (request.method === "GET" && universeAssetsMatch) {
    const universeUid = decodeURIComponent(universeAssetsMatch[1]);
    const universe = universes.find((candidate) => candidate.uid === universeUid);
    if (!universe) return sendJson(response, 404, { detail: "Universe not found." });
    const memberUids = new Set(universeMemberAssetUids.get(universeUid) ?? []);
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const matched = assets.filter((asset) => (
      memberUids.has(asset.uid)
      && (
        !search
        || asset.ticker.toLowerCase().includes(search)
        || asset.name.toLowerCase().includes(search)
        || asset.alpaca_asset_id.includes(search)
      )
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
  const universeDetailMatch = url.pathname.match(/^\/v1\/universes\/([^/]+)$/);
  if (request.method === "GET" && universeDetailMatch) {
    const universeUid = decodeURIComponent(universeDetailMatch[1]);
    const universe = universes.find((candidate) => candidate.uid === universeUid);
    return universe
      ? sendJson(response, 200, universe)
      : sendJson(response, 404, { detail: "Universe not found." });
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
      source_uid: sourceUid,
      asset_category_uid: `category-${normalizedSymbol.toLowerCase()}`,
      display_name: body.name,
      symbol: normalizedSymbol,
      source_url: body.source_url,
      description: `Configured holdings universe for ETF ${normalizedSymbol}.`,
      is_active: true,
      asset_count: 0,
      asset_category: {
        uid: `category-${normalizedSymbol.toLowerCase()}`,
        unique_identifier: `HOLDINGS__${normalizedSymbol}`,
        display_name: body.name,
        description: `Configured holdings universe for ETF ${normalizedSymbol}.`,
      },
      created_at: now,
      updated_at: now,
    };
    universes.push(universe);
    universeMemberAssetUids.set(universe.uid, []);
    return sendJson(response, 201, universe);
  }
  const universeActionMatch = url.pathname.match(
    /^\/v1\/universes\/actions\/(run|activate|deactivate|remove)(\/preflight)?$/,
  );
  if (request.method === "POST" && universeActionMatch) {
    const body = await readJson(request);
    const action = universeActionMatch[1];
    if (action === "run" && !accounts.some((account) => account.uid === body.options?.account_uid)) {
      return sendJson(response, 400, { detail: "options.account_uid must select a registered Alpaca account." });
    }
    const selectedUids = body.selection?.uids ?? [];
    const selected = universes.filter((universe) => selectedUids.includes(universe.uid));
    const missing = selectedUids.filter((uid) => !selected.some((universe) => universe.uid === uid));
    if (universeActionMatch[2]) {
      const runWarnings = action === "run"
        ? selected.map((universe) => `${universe.display_name}: missing Alpaca-backed constituents will be registered automatically through the account selected for this Run.`)
        : [];
      return sendJson(response, 200, {
        contract: "command-center.bulk_action_preflight@v1",
        allowed: missing.length === 0,
        detail: missing.length === 0
          ? (action === "run"
              ? "Selected universes are ready to run. Run extracts constituents, registers missing Alpaca-backed assets, and refreshes category membership."
              : "The selected action is ready.")
          : "A universe is missing.",
        matched_count: selected.length,
        blockers: missing.map((uid) => `Missing universe: ${uid}`),
        warnings: action === "remove"
          ? [`${selected.reduce((count, universe) => count + universe.asset_count, 0)} memberships will be deleted.`]
          : runWarnings,
        results: action === "run" ? selected.map((universe) => ({
          universe,
          plan_summary: { constituents: 3, registered_assets: universe.asset_count, assets_to_register: Math.max(0, 3 - universe.asset_count) },
          has_blockers: false,
        })) : undefined,
      });
    }
    if (missing.length > 0) return sendJson(response, 409, { detail: "A universe is missing." });
    if (action === "remove") {
      universes = universes.filter((universe) => !selectedUids.includes(universe.uid));
      selectedUids.forEach((uid) => universeMemberAssetUids.delete(uid));
      return sendJson(response, 200, {
        results: selected.map((universe) => ({
          universe_uid: universe.uid,
          asset_category_uid: universe.asset_category_uid,
          deleted: true,
        })),
      });
    }
    if (action === "run") {
      selectedUids.forEach((uid) => {
        universeMemberAssetUids.set(uid, ["asset-aapl", "asset-msft", "asset-nvda"]);
      });
      universes = universes.map((universe) => (
        selectedUids.includes(universe.uid)
          ? {
              ...universe,
              asset_count: 3,
            }
          : universe
      ));
      return sendJson(response, 200, {
        results: universes.filter((universe) => selectedUids.includes(universe.uid)).map((universe) => ({
          universe,
          account_uid: body.options.account_uid,
          existing_asset_uids_by_symbol: {
            AAPL: "asset-aapl",
            MSFT: "asset-msft",
          },
          created_asset_uids_by_symbol: {
            NVDA: "asset-nvda",
          },
          missing_symbols_from_alpaca: [],
          openfigi_unmatched_symbols: [],
          warnings_by_symbol: {},
        })),
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
                { value: "universe", label: "Universe assets" },
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
  if (request.method === "GET" && url.pathname === "/v1/signal-jobs/discovery") {
    return sendJson(response, 200, {
      contract: "command-center.resource_discovery@v1",
      resource: {
        id: "alpaca-etf-signal-jobs",
        label: "ETF Weight Signals",
        item_label: "signal Job",
        identity: { fields: ["uid"] },
      },
      list: {
        controls: {
          search: { placeholder: "Search etf signals", fields: ["name", "description"] },
          filters: [
            { key: "enabled", label: "Enabled", type: "boolean" },
            {
              key: "lifecycle_state",
              label: "Lifecycle State",
              type: "select",
              options: [
                { value: "ready", label: "Ready" },
                { value: "paused", label: "Paused" },
                { value: "provisioning", label: "Provisioning" },
                { value: "error", label: "Error" },
              ],
            },
          ],
          ordering: ["name", "updated_at", "lifecycle_state"],
        },
        columns: [
          { id: "name", header: "Signal", value_path: "name", data_type: "text", default_visible: true, hideable: false, sortable_key: "name" },
          { id: "signal-uid", header: "Signal UID", value_path: "signal_uid", data_type: "text", default_visible: true, hideable: true },
          { id: "lifecycle-state", header: "State", value_path: "lifecycle_state", data_type: "text", default_visible: true, hideable: true },
          { id: "schedule-type", header: "Schedule", value_path: "schedule_type", data_type: "text", default_visible: true, hideable: true },
          { id: "job-image-status", header: "Image", value_path: "job_image_status", data_type: "text", default_visible: true, hideable: true },
          { id: "latest-run-status", header: "Last Run", value_path: "latest_run_status", data_type: "text", default_visible: true, hideable: true },
          { id: "latest-run-at", header: "Last Run At", value_path: "latest_run_at", data_type: "datetime", default_visible: true, hideable: true },
          { id: "enabled", header: "Enabled", value_path: "enabled", data_type: "boolean", default_visible: true, hideable: true },
        ],
      },
      bulk_actions: [],
    });
  }
  if (request.method === "GET" && url.pathname === "/v1/signal-jobs") {
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const matched = signalJobs.filter((configuration) => (
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
  if (request.method === "POST" && url.pathname === "/v1/signal-jobs") {
    const body = await readJson(request);
    const now = new Date().toISOString();
    const created = {
      ...body,
      uid: `signal-${signalJobs.length + 1}`,
      signal_uid: `signal-${body.universe_uid}`,
      job_uid: `job-signal-${signalJobs.length + 1}`,
      lifecycle_state: body.enabled ? "ready" : "paused",
      last_error: null,
      job_image_status: "ready",
      job_automatic_deployment: true,
      latest_run_status: null,
      latest_run_at: null,
      created_at: now,
      updated_at: now,
    };
    signalJobs.push(created);
    return sendJson(response, 201, created);
  }
  const signalActionMatch = url.pathname.match(/^\/v1\/signal-jobs\/([^/]+)\/actions\/(run|pause|resume|reconcile)$/);
  if (request.method === "POST" && signalActionMatch) {
    const uid = decodeURIComponent(signalActionMatch[1]);
    const action = signalActionMatch[2];
    const index = signalJobs.findIndex((configuration) => configuration.uid === uid);
    if (index < 0) return sendJson(response, 404, { detail: "Signal Job configuration not found." });
    await readJson(request);
    if (action === "run") {
      const now = new Date().toISOString();
      signalJobs[index] = { ...signalJobs[index], latest_run_status: "PENDING", latest_run_at: now };
      return sendJson(response, 202, {
        configuration_uid: uid,
        job_uid: signalJobs[index].job_uid,
        job_run_uid: `job-run-${uid}`,
        status: "PENDING",
        status_url: `/v1/operations/job-runs/job-run-${uid}`,
        poll_after_ms: 1000,
      });
    }
    const enabled = action === "resume" ? true : action === "pause" ? false : signalJobs[index].enabled;
    signalJobs[index] = {
      ...signalJobs[index],
      enabled,
      lifecycle_state: enabled ? "ready" : "paused",
      updated_at: new Date().toISOString(),
    };
    return sendJson(response, 200, signalJobs[index]);
  }
  const signalRunsMatch = url.pathname.match(/^\/v1\/signal-jobs\/([^/]+)\/runs$/);
  if (request.method === "GET" && signalRunsMatch) return sendJson(response, 200, []);
  const signalObservationsMatch = url.pathname.match(/^\/v1\/signal-jobs\/([^/]+)\/observations$/);
  if (request.method === "GET" && signalObservationsMatch) {
    const uid = decodeURIComponent(signalObservationsMatch[1]);
    const configuration = signalJobs.find((item) => item.uid === uid);
    if (!configuration) return sendJson(response, 404, { detail: "Signal Job configuration not found." });
    return sendJson(response, 200, signalObservations[uid] ?? {
      configuration_uid: uid,
      signal_uid: configuration.signal_uid,
      observation_count: 0,
      asset_count: 0,
      time_indexes: [],
      assets: [],
    });
  }
  const signalConfigurationMatch = url.pathname.match(/^\/v1\/signal-jobs\/([^/]+)$/);
  if (signalConfigurationMatch) {
    const uid = decodeURIComponent(signalConfigurationMatch[1]);
    const index = signalJobs.findIndex((configuration) => configuration.uid === uid);
    if (index < 0) return sendJson(response, 404, { detail: "Signal Job configuration not found." });
    if (request.method === "GET") return sendJson(response, 200, signalJobs[index]);
    if (request.method === "PATCH") {
      const body = await readJson(request);
      signalJobs[index] = {
        ...signalJobs[index],
        ...body,
        lifecycle_state: body.enabled === false ? "paused" : "ready",
        updated_at: new Date().toISOString(),
      };
      return sendJson(response, 200, signalJobs[index]);
    }
    if (request.method === "DELETE") {
      const [deleted] = signalJobs.splice(index, 1);
      return sendJson(response, 200, {
        configuration_uid: deleted.uid,
        job_uid: deleted.job_uid,
        deleted: true,
      });
    }
  }
  if (request.method === "GET" && url.pathname === "/v1/portfolio-configurations/discovery") {
    return sendJson(response, 200, {
      contract: "command-center.resource_discovery@v1",
      resource: {
        id: "alpaca-etf-portfolio-configurations",
        label: "ETF Portfolios",
        item_label: "portfolio configuration",
        identity: { fields: ["uid"] },
      },
      list: {
        controls: {
          search: { placeholder: "Search ETF Portfolios", fields: ["name", "description"] },
          filters: [],
          ordering: ["name", "updated_at"],
        },
        columns: [
          { id: "name", header: "Portfolio", value_path: "name", data_type: "text", default_visible: true, hideable: false, sortable_key: "name" },
          { id: "rebalance-strategy", header: "Rebalance", value_path: "rebalance_strategy", data_type: "text", default_visible: true, hideable: true },
          { id: "job-image-status", header: "Image", value_path: "job.image_status", data_type: "text", default_visible: true, hideable: true },
          { id: "latest-run-status", header: "Last Run", value_path: "latest_run_status", data_type: "text", default_visible: true, hideable: true },
          { id: "latest-run-at", header: "Last Run At", value_path: "latest_run_at", data_type: "datetime", default_visible: true, hideable: true },
          { id: "updated-at", header: "Updated", value_path: "updated_at", data_type: "datetime", default_visible: true, hideable: true, sortable_key: "updated_at" },
        ],
      },
      bulk_actions: [],
    });
  }
  if (request.method === "GET" && url.pathname === "/v1/portfolio-configurations") {
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const matched = portfolioConfigurations.filter((configuration) => (
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
  if (request.method === "POST" && url.pathname === "/v1/portfolio-configurations") {
    const body = await readJson(request);
    const now = new Date().toISOString();
    const ordinal = portfolioConfigurations.length + 1;
    const signal = signalJobs.find((candidate) => candidate.uid === body.signal_configuration_uid);
    const rebalance = portfolioRebalanceConfigurations.find((candidate) => candidate.uid === body.rebalance_configuration_uid);
    const created = {
      uid: `portfolio-config-${ordinal}`,
      name: body.name,
      description: body.description,
      signal_configuration_uid: body.signal_configuration_uid,
      signal_uid: signal?.signal_uid ?? "signal-unresolved",
      bars_configuration_uid: body.bars_configuration_uid,
      rebalance_configuration_uid: body.rebalance_configuration_uid,
      rebalance_strategy: rebalance?.strategy ?? "immediate_signal",
      portfolio_uid: null,
      job_uid: `job-portfolio-${ordinal}`,
      upsample_frequency_id: body.upsample_frequency_id,
      intraday_bar_interpolation_rule: body.intraday_bar_interpolation_rule,
      valuation_column: body.valuation_column,
      portfolio_prices_frequency: body.portfolio_prices_frequency,
      forward_fill_to_now: body.forward_fill_to_now,
      fail_on_missing_prices: body.fail_on_missing_prices,
      commission_fee: body.commission_fee,
      job: {
        uid: `job-portfolio-${ordinal}`,
        ...body.job,
        schedule_timezone_explicit: body.job.schedule_timezone !== null,
        image_status: "ready",
        automatic_deployment: true,
      },
      latest_run_status: null,
      latest_run_at: null,
      created_at: now,
      updated_at: now,
    };
    portfolioConfigurations.push(created);
    return sendJson(response, 201, created);
  }
  const portfolioActionMatch = url.pathname.match(/^\/v1\/portfolio-configurations\/([^/]+)\/actions\/run$/);
  if (request.method === "POST" && portfolioActionMatch) {
    const uid = decodeURIComponent(portfolioActionMatch[1]);
    const index = portfolioConfigurations.findIndex((configuration) => configuration.uid === uid);
    if (index < 0) return sendJson(response, 404, { detail: "Portfolio configuration not found." });
    const now = new Date().toISOString();
    portfolioConfigurations[index] = {
      ...portfolioConfigurations[index],
      latest_run_status: "PENDING",
      latest_run_at: now,
    };
    return sendJson(response, 202, {
      configuration_uid: uid,
      job_uid: portfolioConfigurations[index].job_uid,
      job_run_uid: `job-run-${uid}`,
      status: "PENDING",
      status_url: `/v1/operations/job-runs/job-run-${uid}`,
    });
  }
  const portfolioRunsMatch = url.pathname.match(/^\/v1\/portfolio-configurations\/([^/]+)\/runs$/);
  if (request.method === "GET" && portfolioRunsMatch) return sendJson(response, 200, []);
  const portfolioConfigurationMatch = url.pathname.match(/^\/v1\/portfolio-configurations\/([^/]+)$/);
  if (portfolioConfigurationMatch) {
    const uid = decodeURIComponent(portfolioConfigurationMatch[1]);
    const index = portfolioConfigurations.findIndex((configuration) => configuration.uid === uid);
    if (index < 0) return sendJson(response, 404, { detail: "Portfolio configuration not found." });
    if (request.method === "GET") return sendJson(response, 200, portfolioConfigurationDetail(portfolioConfigurations[index]));
    if (request.method === "PATCH") {
      const body = await readJson(request);
      const { job: jobSettings, ...configurationFields } = body;
      portfolioConfigurations[index] = {
        ...portfolioConfigurations[index],
        ...configurationFields,
        job: jobSettings
          ? { ...portfolioConfigurations[index].job, ...jobSettings }
          : portfolioConfigurations[index].job,
        updated_at: new Date().toISOString(),
      };
      return sendJson(response, 200, portfolioConfigurations[index]);
    }
    if (request.method === "DELETE") {
      const [deleted] = portfolioConfigurations.splice(index, 1);
      return sendJson(response, 200, {
        configuration_uid: deleted.uid,
        job_uid: deleted.job_uid,
        deleted: true,
      });
    }
  }
  if (request.method === "GET" && url.pathname === "/v1/portfolio-rebalance-configurations/discovery") {
    return sendJson(response, 200, {
      contract: "command-center.resource_discovery@v1",
      resource: {
        id: "portfolio-rebalance-configurations",
        label: "Rebalance Configurations",
        item_label: "rebalance configuration",
        identity: { fields: ["uid"] },
      },
      list: {
        controls: {
          search: { placeholder: "Search Rebalance Configurations", fields: ["name", "description"] },
          filters: [],
          ordering: ["name", "updated_at"],
        },
        columns: [
          { id: "name", header: "Configuration", value_path: "name", data_type: "text", default_visible: true, hideable: false, sortable_key: "name" },
          { id: "strategy", header: "Strategy", value_path: "strategy", data_type: "text", default_visible: true, hideable: true },
          { id: "updated-at", header: "Updated", value_path: "updated_at", data_type: "datetime", default_visible: true, hideable: true, sortable_key: "updated_at" },
        ],
      },
      bulk_actions: [],
    });
  }
  if (request.method === "GET" && url.pathname === "/v1/portfolio-rebalance-configurations") {
    const search = (url.searchParams.get("search") ?? "").toLowerCase();
    const matched = portfolioRebalanceConfigurations.filter((configuration) => (
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
  if (request.method === "POST" && url.pathname === "/v1/portfolio-rebalance-configurations") {
    const body = await readJson(request);
    const now = new Date().toISOString();
    const created = {
      uid: `rebalance-${portfolioRebalanceConfigurations.length + 1}`,
      ...body,
      created_at: now,
      updated_at: now,
    };
    portfolioRebalanceConfigurations.push(created);
    return sendJson(response, 201, created);
  }
  const rebalanceConfigurationMatch = url.pathname.match(/^\/v1\/portfolio-rebalance-configurations\/([^/]+)$/);
  if (rebalanceConfigurationMatch) {
    const uid = decodeURIComponent(rebalanceConfigurationMatch[1]);
    const index = portfolioRebalanceConfigurations.findIndex((configuration) => configuration.uid === uid);
    if (index < 0) return sendJson(response, 404, { detail: "Rebalance configuration not found." });
    if (request.method === "GET") return sendJson(response, 200, portfolioRebalanceConfigurations[index]);
    if (request.method === "PATCH") {
      const body = await readJson(request);
      portfolioRebalanceConfigurations[index] = {
        ...portfolioRebalanceConfigurations[index],
        ...body,
        updated_at: new Date().toISOString(),
      };
      return sendJson(response, 200, portfolioRebalanceConfigurations[index]);
    }
    if (request.method === "DELETE") {
      const [deleted] = portfolioRebalanceConfigurations.splice(index, 1);
      return sendJson(response, 200, { uid: deleted.uid, deleted: true });
    }
  }
  return sendJson(response, 404, { detail: "Fixture route not found." });
}).listen(PORT, HOST, () => {
  process.stdout.write(`E2E host fixture listening at http://${HOST}:${PORT}\n`);
});
