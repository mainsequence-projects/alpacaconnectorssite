# Architecture

## Browser boundary

The production application is an embedded Command Center static site. It uses the SDK's
`mainsequence.alpaca-connectors` version-one iframe channel and applies every theme context update.
The public user UID supplied by the host is not used as authorization evidence.

API requests use `fetchFastApi` with a public FastAPI ResourceRelease UID and relative paths. The
SDK obtains and refreshes narrow delegated credentials in memory. Application code does not read,
decode, persist, log, or construct authorization headers.

A direct fetch transport is available only in Vite development and end-to-end builds. A direct
production visit fails closed with an application status screen.

## Runtime configuration

| Variable | Purpose |
| --- | --- |
| `VITE_COMMAND_CENTER_ORIGIN` | Exact trusted parent origin for the iframe protocol |
| `VITE_FASTAPI_RESOURCE_RELEASE_UID` | Public target FastAPI ResourceRelease UID |
| `VITE_API_BASE_URL` | Local development API origin (`http://127.0.0.1:8321`); ignored by normal production builds |

These are routing values, not secrets. Alpaca API keys and Main Sequence tokens must never be added
to static-site environment variables.

The tracked `.env.development` owns the direct local URL used by `npm run dev`. Production owns the
FastAPI release UID through the Static Site workflow's `build_environment`; the two modes therefore
cannot accidentally route to the Main Sequence Django development backend on port `8000`.

## Backend contract

Endpoint constants and response types live in `src/api.ts`. Transport selection and iframe
lifecycle live in `src/transport.ts`. The page code orchestrates these contracts but does not
duplicate registration, holdings extraction, Asset Universe Run behavior, or platform logic. An
`AssetUniverse.uid` is the action and bars-configuration identity; `source_uid` and
`asset_category_uid` remain explicit linked identities.
Account credential fields contain Secret names only. The read-only Secret-reference endpoint
returns names and never serializes values into the browser.

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
supported interpolation and portfolio parameters. Schedule, compute, image, and deployment state
are read from and written to the dedicated Main Sequence Job. The page does not duplicate those
operational fields in the Portfolio Configuration.
