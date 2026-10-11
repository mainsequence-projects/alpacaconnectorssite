# Architecture

## Browser boundary

The production application is an embedded Command Center static site. It uses the SDK's
`mainsequence.alpaca-connectors` version-one iframe channel and applies every theme context update.
The public user UID supplied by the host is not used as authorization evidence.

API requests use `fetchFastApi` with a public FastAPI ResourceRelease UID and relative paths. The
SDK obtains and refreshes narrow delegated credentials in memory. Application code does not read,
decode, persist, log, or construct authorization headers. The SDK refuses delegated and platform
requests until the host's first context, so the application receives its transport only then; a
host that sends no context within 15 seconds ends in an error screen.

A direct fetch transport is available only in Vite development and end-to-end builds. A direct
production visit fails closed with an application status screen.

The API authenticates every caller (connector ADR 0014). Inside Command Center the SDK's
`fetchFastApi` sends `Authorization: Bearer` with the delegated credential and
`X-Resource-Release-UID` on every request, and the platform gateway turns it into the caller
assertion the API verifies. A local API instead needs the developer's Main Sequence token as a
Bearer. In Vite development the browser therefore calls its own dev server, and the dev server
(`vite.config.ts`) proxies `/v1/` and `/health` to `VITE_API_BASE_URL`, adding
`Authorization: Bearer` with a token from `mainsequence auth token --json`. It reuses the token
until a minute before it expires, asks again after the API answers 401, and answers 401 with the
reason when the CLI has no session. The token never reaches the browser, a URL, a file, or a log.
The proxy refuses, with 403, any request that does not come from this machine or that the
browser marks as coming from another site (`Sec-Fetch-Site`, `Origin`), so no other site open
in the developer's browser can use it.
The CLI is `MAINSEQUENCE_CLI`, else `mainsequence` on `PATH`, and its session must be for the
backend in the API's `MAINSEQUENCE_ENDPOINT`. End-to-end builds call their fixture API directly.

## Alpaca Agent conversation

Every page offers a conversation with the Alpaca Agent through Command Center AI's public
components: **Ask Alpaca Agent** (`ChatLauncher`) opens `ChatRail` with `ChatThread`
(`src/assistant.tsx`). The rail docks as the shell's last column from 1400px wide, so the page
narrows beside it, and floats over the page below that. One `ChatEngineProvider` sits above the
shell from the first render, so neither the shell nor its pages remount when the Agent becomes
known, and closing the rail keeps the page as it was.

- **Which Agent.** The site reads `GET /v1/project-state/configuration` once when the page loads
  and takes `agent_uid` and `organization_environment_uid` from that one answer (connector
  `docs/api.md`, "Project State And The Site's Agent"). The API finds the Agent when the request
  arrives, so a re-created Agent reaches the site in its next answer. Neither UID is a build value
  or comes from the person's Command Center Environment.
- **When it is hidden.** The launcher is hidden, and every page keeps working, when the API answers
  `agent_uid: null`, the configuration cannot be read, the API answered for another person than the
  one the platform requests go out as (`request_user_uid`), or the mode has no platform session
  (a direct production visit, or an end-to-end build opened directly).
- **Platform requests.** The conversation's platform requests go out as the person: embedded,
  through the host bridge (`client.sendPlatformRequest`); in Vite development, through the SDK's
  `platformRequestProxy()` on the dev server (`/__mainsequence__`), as the developer signed in with
  `npx command-center-sdk login` for the backend in `MAINSEQUENCE_ENDPOINT`. The page never holds a
  platform token.
- **Session.** One default session per person and Agent behind the handle
  `alpaca_connectors_site`. A visit that does not open the rail creates none: while the rail is
  closed the engine reads only the Agent's icon for the launcher.
- The expanded rail, a session explorer, and model provider settings are not part of the site;
  people manage their model providers in Command Center.

## Runtime configuration

| Variable | Purpose |
| --- | --- |
| `VITE_COMMAND_CENTER_ORIGIN` | Exact trusted parent origin for the iframe protocol |
| `VITE_FASTAPI_RESOURCE_RELEASE_UID` | Public target FastAPI ResourceRelease UID |
| `VITE_API_BASE_URL` | Local API origin (`http://127.0.0.1:8321`) the dev server proxies to, and the end-to-end fixture API; ignored by normal production builds |
| `MAINSEQUENCE_CLI` | Dev server only, not a `VITE_` value: the Main Sequence CLI whose `auth token` authenticates local API requests; defaults to `mainsequence` on `PATH` |
| `MAINSEQUENCE_ENDPOINT` | Dev server only: the platform whose saved session `platformRequestProxy()` uses for the Agent conversation |

These are routing values, not secrets. Alpaca API keys and Main Sequence tokens must never be added
to static-site environment variables, and neither may the Alpaca Agent or its Environment.

The tracked `.env.development` owns the local API URL that `npm run dev` proxies to. Production owns the
FastAPI release UID through the Static Site workflow's `build_environment`; the two modes therefore
cannot accidentally route to the Main Sequence Django development backend on port `8000`.

## Backend contract

Endpoint constants and response types live in `src/api.ts`. Transport selection and iframe
lifecycle live in `src/transport.ts`. The page code orchestrates these contracts but does not
duplicate registration, holdings extraction, Asset Universe Run behavior, or platform logic. An
`AssetUniverse.uid` is the action and bars-configuration identity; `source_uid` and
`asset_category_uid` remain explicit linked identities.
Account registration and credential rotation send the Alpaca API key and secret key once, as
write-only request fields (`credentials.source = "managed"`). The API validates them with Alpaca and
stores them as Main Sequence Secrets it owns; account responses carry only the credential source,
Secret names and UIDs, and the last update time, never values. The values live only in the open
form's component state and are never placed in a URL, browser storage, persisted view state, or
console output. The site does not call the Secret-reference endpoint.

Asset registration uses the API's persisted operation contract. The initial `POST` returns `202`
with an operation UID and ordered step states. The application polls the operation-specific `GET`
route using the server-provided interval, cancels obsolete polling when the page unmounts, and maps
the backend's step states into the SDK progress component. Results and sanitized terminal errors
come from the same operation record; the browser does not infer completion from elapsed time or a
synthetic percentage. Polling stops after the application-owned ten-minute limit instead of
retrying forever when a worker disappears.

Resource lists and detail pages are added only where the backend exposes authoritative pagination
and discovery contracts. Accounts, Universes, Bars, ETF Weight Signals, Rebalance Configurations,
and ETF Portfolios currently satisfy that boundary. The three portfolio-related routes are sibling
destinations in the **Portfolios** navigation group. Signal and Portfolio routes never ask the
browser to invent an Environment or pass JobRun business arguments.

Short create, update, run, and delete requests use one application-owned modal with the SDK
`ActivityIndicator`, so pending work does not insert a large status region into the page layout.
Application startup continues to use `ApplicationStatusScreen`; resource lists, details, pickers,
and confirmation dialogs retain their own SDK-controlled loading states. Terminal request errors
remain in the owning route and use capability-specific titles such as **Rebalance configuration
request failed** rather than a broader portfolio label.

The ETF Portfolios page stores only calculation intent in the Portfolio Configuration: references
to an existing Signal Configuration, Bars Configuration, and Rebalance Configuration plus the
supported interpolation and valuation parameters (valuation column, maximum price staleness,
missing-price policy, commission fee), and its `scheduled` flag. Schedule, compute, image, and
deployment state belong to the shared portfolio Job that the connector declares in its workflow
file; the signal and portfolio pages show that Job read-only and never write it.

Rebalance Configurations own execution timing (connector ADR 0009): the `calendar_event_signal`
strategy, calendar, session, market event, signed offset, cadence, and weekly weekday. New
policies use `US_EQUITY_REBALANCE_CALENDAR` from `src/api.ts`, the NYSE `regular` session. The
portfolio and rebalance forms build their bodies from the request types in `src/api.ts`, which
mirror the connector's request models field for field; an edit sends the same whole body as
`PATCH`.
