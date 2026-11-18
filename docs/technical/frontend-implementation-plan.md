# Frontend implementation plan

## Outcome

Build an embedded Command Center application for the Alpaca Connectors FastAPI service. The site
must expose its selected asset, account, bars-configuration, and portfolio workflows, using
the installed Command Center SDK for embedding, theme, layout, application feedback, resource
discovery, and action confirmation.

## Verified baseline

- The static-site repository is a root-level Vite and React application.
- `@dev-mainsequence/command-center-sdk` was `0.1.18` when this plan was written; the application
  now uses `0.5.17`, with `@dev-mainsequence/command-center-ai` `0.0.13` for the Alpaca Agent
  conversation.
- Package-owned Command Center skills and authenticated platform skills were synchronized before
  implementation.
- The backend API tests for the current capability routes pass.
- The asset-registration operation, account registration, stored bars-configuration, and portfolio
  contracts are the workflows selected for this frontend.
- Other project capabilities are documented but are not presented as application pages.

## Architecture decision

Application purpose:
: Provide one browser control surface for the selected asset, account, bars-configuration, and
  portfolio workflows.

Main Command Center embedding:
: Use `createStaticSiteIframeClient` on the `mainsequence.alpaca-connectors` channel. Deployed API
  requests use `fetchFastApi` with a configured FastAPI ResourceRelease UID and relative paths.
  Local Vite development may use an explicitly configured local API base URL. No token or raw
  credential is accepted, stored, logged, or placed in a URL.

Theme integration:
: Import the SDK theme and component styles once, apply a known host theme preset on every context
  update, and use only published semantic variables in application CSS.

Application documentation:
: Ship user and technical documentation at `/docs/` in the same `dist/` artifact.

Application-owned routes:
: Assets, Accounts, Bars, Signals, Rebalance Configurations, and Portfolios. The three portfolio
  routes are sibling destinations under the **Portfolios** sub-application group. The root resolves to Assets. Project-wide capability and configuration
  reference belongs in the same-artifact documentation, not in an Overview application route.

Resource collections and details:
: The Accounts, Bars, Signals, Rebalance Configurations, and Portfolios routes embed SDK
  `ResourceListPage` collections backed by their canonical
  list and discovery endpoints. Other future resource pages must use their authoritative collection,
  pagination, discovery, and detail contracts. Do not manufacture adapters from capability
  summaries.

Action placement:
: Asset plan and execute actions live beside the asset form. Account registration is a distinct
  form action. Account and bars edit/delete operations and portfolio run and delete use row actions
  and SDK confirmation. Backend-discovered account actions run through SDK preflight, confirmation
  when required, execution, and refresh.

Portable widgets and workspaces:
: None. These workflows are application routes, not reusable widgets or persisted workspaces.

Backend adapters and contracts:
: A single application transport selects the SDK delegated FastAPI client when embedded and a
  direct local fetch only during Vite development and end-to-end builds. In Vite development that
  fetch goes to the dev server, whose proxy adds the developer's Main Sequence session token, so the
  browser never holds a token. Typed response guards keep
  malformed responses out of the UI. The Accounts route sends Alpaca keys only as write-only
  request fields that the API stores as Main Sequence Secrets, and never receives them back. The
  Portfolios route never creates a portfolio or gives one weights: those are the application's
  capabilities.

Selected focused skills:
: Use Command Center SDK, build Command Center application, integrate static-site iframe, theme
  Command Center app, compose Command Center page, build application loading flow, and document
  Command Center application.

Rejected alternatives:
: No Streamlit surface, custom iframe protocol, browser-held API token, duplicated Command Center
  global navigation, custom widget, workspace renderer, or fake resource collection.

## Implementation phases

### Phase 1 — toolchain and guidance

1. Check the declared, locked, installed, wanted, and latest SDK versions.
2. Preview and apply the supported SDK update workflow.
3. Strictly synchronize package-owned and backend-owned agent skills.
4. Initialize the official same-artifact documentation scaffold with Node 24 LTS.

Exit gate: SDK status is current, both skill sentinels exist, and the documentation scaffold is
owned by the root npm toolchain.

### Phase 2 — transport and application shell

1. Add the static-site iframe client and host-context theme application.
2. Add a development-only direct transport for the local FastAPI server.
3. Map transport startup and failures to SDK application feedback.
4. Add one SDK-owned internal navigation panel headed by the Alpaca Connectors logo and label.
   Keep Assets, Accounts, and Bars under **Workflows**; group Rebalance Configurations and
   Portfolios under **Portfolios**; and keep Documentation under **Reference**. The embedded
   child must not reproduce the host Command Center's application rail or application selector.

Exit gate: the app never handles a host session token, all deployed API paths are relative, direct
production links fail safely without an iframe bridge, and host theme updates remain live.

### Phase 3 — implemented API workflows

1. Load the project configuration for the workflow forms without rendering a project-state dashboard.
2. Add exact-symbol asset-registration planning and execution, including required
   registered-account selection and an inline explanation of validation and execution.
3. Start asset registration through the persisted operation endpoint, poll its stable UID, and map
   all recorded backend steps to the SDK progress list without inventing percentages.
4. Render validation blockers, warnings, created identities, and operation results without exposing
   unbounded backend traces.

Exit gate: each screen calls only an existing canonical backend route.

### Phase 4 — documentation and verification

1. Document the five application surfaces, the project-wide capability reference, transport/security
   boundary, configuration, and future resource expansion.
2. Run documentation checks, TypeScript/Vite build, SDK theme audit, and browser layout checks.
3. Exercise the production artifact at `/`, `/docs/`, and a nested documentation route.

Exit gate: the combined artifact contains `dist/index.html` and `dist/docs/index.html`; automated
checks pass at phone, tablet, and desktop widths.

### Phase 5 — bars-configuration CRUD

1. Adapt `/v1/market-data/bar-configurations` and its discovery contract with the SDK HTTP resource adapter.
2. Create and edit bars feeds with a registered Alpaca account, explicit assets or the account's
   latest holdings, and one already-migrated `frequency/feed/adjustment` profile (Phase 8 adds
   each portfolio's own configuration).
3. List the stored configurations with server search, filtering, ordering, pagination, and refresh.
4. Delete through an SDK confirmation dialog without implying that published bars observations are removed.

Exit gate: browser coverage proves create, read, update, and delete; the form explains that account
holdings use the newest persisted snapshot from the inclusive trailing 30 days and never capture a
snapshot as a side effect.

### Phase 6 — account-registration CRUD

1. Adapt `/v1/accounts` and `/v1/accounts/discovery` with the SDK HTTP resource adapter.
2. Collect the Alpaca API key and secret key in password fields with autocomplete off; keep them
   only in component state (ADR 0011, API-managed credential Secrets).
3. Review paper or live registrations through the read-only preflight, then register; registration
   always registers missing held assets and creates the initial holdings snapshot in the same flow.
4. Edit account names and active state without sending credentials, and rotate credentials only
   when both new keys are entered, while keeping the environment immutable.
5. Delete through an SDK confirmation dialog that explains which credential Secrets are deleted and
   that historical holdings remain stored.

Exit gate: browser coverage proves review, create, update, rotation, and delete with the exact
request bodies; no request URL carries a key value and no request reaches the Secret-reference
endpoint.

### Phase 7 — portfolios built from provided weights

1. Adapt `/v1/portfolio-configurations` and its discovery contract with the SDK HTTP resource
   adapter, and keep rebalance configurations as a sibling route.
2. List and inspect portfolios, with their weights summary, valuation source, rebalance policy,
   shared Job, and value history; run them from a row action.
3. Offer the owner's actions, pause and resume (`PATCH {scheduled}`) and delete, which retires the
   portfolio, and read the connector's `403` as "Only the portfolio's owner can do this."
4. Never create a portfolio or give one weights: those are the application's capabilities.

Exit gate: browser coverage proves inspection, run, pause and resume, delete, and the owner-only
refusal, and that the portfolio pages send no create or edit request.

### Phase 8 — every portfolio belongs to one account (connector ADR 0028)

1. Accounts: **Remove keys** (one account, and the discovered bulk action) clears only the keys;
   **Delete** shows the connector's delete preflight and deletes the account and everything it
   owns with the exact confirmation `confirm=DELETE <account uid>`. Show whether keys are stored,
   removed, or awaiting migration.
2. Portfolios: show each portfolio's account and signal, filter by them, show a portfolio not yet
   adopted and never run it.
3. Signals: list, inspect with the latest weights and the portfolios that follow it, rename, and
   delete one no portfolio follows. Never create a signal or publish weights.
4. Bars: create feeds only; edit a portfolio's own configuration without its account or source,
   and never delete it.

Exit gate: browser coverage proves each of these against a fixture that mirrors the connector's
discovery columns, its owner refusals, and its delete preflight.

## Runtime configuration

- `VITE_COMMAND_CENTER_ORIGIN`: exact trusted parent origin for the iframe protocol.
- `VITE_FASTAPI_RESOURCE_RELEASE_UID`: public target FastAPI ResourceRelease UID.
- `VITE_API_BASE_URL`: the local API URL the Vite dev server proxies to, and the end-to-end
  fixture API; it is ignored by production builds.

All three values are public routing configuration. None may contain an access token or Alpaca
credential.

## Verification matrix

| Concern | Proof |
| --- | --- |
| SDK guidance | SDK status is current and both skill sentinels record successful synchronization |
| API fidelity | Frontend endpoint constants match the current FastAPI routers; browser tests cover asset-registration polling, account CRUD, bars-configuration CRUD, rebalance CRUD, and portfolio inspection, runs, and owner actions, and that the pages call only those routes; backend API tests pass |
| Embed security | SDK client owns credential acquisition; only relative deployed paths are accepted |
| Theme | SDK theme audit passes and host theme updates reach rendered controls and surfaces |
| Layout | SDK browser geometry verifier passes at 375, 768, and 1280 pixel widths |
| Documentation | `docs:check` and combined application/documentation build pass |
| Browser artifact | `/`, `/docs/`, and a nested documentation route load from the production artifact |

## Deployment boundary

The reviewed Static Site workflow now declares automatic deployment, the exact FastAPI
ResourceRelease UID, and the managed Command Center link with its repository-backed Alpaca image.
See [Deployment](deployment.md) for the release contract and verification boundary.

## Implementation result

Phases 1 through 7 are complete in this repository. The SDK remained current at `0.1.18`; package
and authenticated platform skills were synchronized; the application and same-artifact
documentation were built; and automated checks covered theme conformance, TypeScript,
documentation, responsive layout, direct development requests, delegated iframe requests, plan
gating, account CRUD by Secret reference, bars-configuration CRUD, Rebalance Configuration CRUD,
portfolio inspection, runs, and owner actions, host theme updates, and production documentation
routes.

On 2026-11-17 the connector kept only portfolios built from weights an application provides and
stopped building portfolios from holdings sources. The site removed the pages, navigation, and API
calls of those holdings-sourced workflows and the bars configurations' holdings-collection source,
and its Portfolios page lists, inspects, and runs portfolios built from provided weights.

Holdings snapshots, market-data datasets and observations, portfolio output observations, and other SDK resource views are
not current site pages and require an explicit frontend scope plus verification against their
authoritative contracts.
