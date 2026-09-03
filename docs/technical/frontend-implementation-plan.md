# Frontend implementation plan

## Outcome

Build an embedded Command Center application for the Alpaca Connectors FastAPI service. The site
must expose its selected asset, account, universe, and bars-configuration workflows, using
the installed Command Center SDK for embedding, theme, layout, application feedback, resource
discovery, and action confirmation.

## Verified baseline

- The static-site repository is a root-level Vite and React application.
- `@dev-mainsequence/command-center-sdk` is current at `0.1.18`.
- Package-owned Command Center skills and authenticated platform skills were synchronized before
  implementation.
- The backend API tests for the current capability routes pass.
- The asset-registration operation, materialized-universe create/run, and stored bars-configuration
  contracts are the workflows selected for this frontend.
- Other project capabilities are documented but are not presented as application pages.

## Architecture decision

Application purpose:
: Provide one browser control surface for the selected asset, account, universe, and bars-configuration workflows.

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
: Assets, Accounts, Universes, and Bars. The root resolves to Assets. Project-wide capability and configuration
  reference belongs in the same-artifact documentation, not in an Overview application route.

Resource collections and details:
: The Accounts, Universes, and Bars routes embed SDK `ResourceListPage` collections backed by their canonical
  list and discovery endpoints. Other future resource pages must use their authoritative collection,
  pagination, discovery, and detail contracts. Do not manufacture adapters from capability
  summaries.

Action placement:
: Asset plan and execute actions live beside the asset form. Account registration and universe
  creation are distinct form actions. Account and bars edit/delete operations use row actions and
  SDK confirmation. Backend-discovered account and universe actions run through SDK preflight,
  confirmation when required, execution, and refresh.

Portable widgets and workspaces:
: None. These workflows are application routes, not reusable widgets or persisted workspaces.

Backend adapters and contracts:
: A single application transport selects the SDK delegated FastAPI client when embedded and a
  direct unauthenticated local fetch only during Vite development. Typed response guards keep
  malformed responses out of the UI. The Accounts route loads Secret names through a metadata-only
  endpoint and never accepts values. The Universes route accepts an explicit source URL when the
  universe is created and does not load provider configuration or infer a provider.

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
   Keep Assets, Accounts, Universes, Bars, and Documentation directly in that panel. The embedded
   child must not reproduce the host Command Center's application rail or application selector.

Exit gate: the app never handles a host session token, all deployed API paths are relative, direct
production links fail safely without an iframe bridge, and host theme updates remain live.

### Phase 3 — implemented API workflows

1. Load provider configuration for the workflow forms without rendering a project-state dashboard.
2. Add exact-symbol and ETF-seed asset-registration planning and execution, including an inline
   explanation of expansion, validation, execution, and the separate universe step.
3. Start asset registration through the persisted operation endpoint, poll its stable UID, and map
   all recorded backend steps to the SDK progress list without inventing percentages.
4. Add explicit universe creation that persists an empty universe plus its holdings source without
   performing extraction.
5. Keep universe execution out of the creation form; expose it as a discovered row action.
6. Render validation blockers, warnings, created identities, and operation results without exposing
   unbounded backend traces.

Exit gate: each screen calls only an existing canonical backend route, and universe creation is
visibly distinct from execution.

### Phase 4 — documentation and verification

1. Document the four application surfaces, the project-wide capability reference, transport/security
   boundary, configuration, and future resource expansion.
2. Run documentation checks, TypeScript/Vite build, SDK theme audit, and browser layout checks.
3. Exercise the production artifact at `/`, `/docs/`, and a nested documentation route.

Exit gate: the combined artifact contains `dist/index.html` and `dist/docs/index.html`; automated
checks pass at phone, tablet, and desktop widths.

### Phase 5 — registered-universe resources

1. Adapt the canonical universe collection and discovery routes with `createHttpResourceAdapter`.
2. Render server search, ordering, pagination, and refresh through SDK `ResourceListPage`.
3. Expose run, activate, deactivate, and delete as discovered actions with backend preflight.
4. Add a row context-menu shortcut that opens the same SDK confirmation flow.

Exit gate: the browser suite proves create, run, deactivate, activate, and delete from the
registered-universe flow; inactive universes remain registered but are rejected as market-data
scopes.

### Phase 6 — bars-configuration CRUD

1. Adapt `/v1/market-data/bar-configurations` and its discovery contract with the SDK HTTP resource adapter.
2. Create and edit configurations with a registered Alpaca account, exactly one asset source, and
   one already-migrated `frequency/feed/adjustment` profile.
3. List the stored configurations with server search, filtering, ordering, pagination, and refresh.
4. Delete through an SDK confirmation dialog without implying that published bars observations are removed.

Exit gate: browser coverage proves create, read, update, and delete; the form explains that account
holdings use the newest persisted snapshot from the inclusive trailing 30 days and never capture a
snapshot as a side effect.

### Phase 7 — account-registration CRUD

1. Adapt `/v1/accounts` and `/v1/accounts/discovery` with the SDK HTTP resource adapter.
2. Populate searchable Secret pickers from `/v1/accounts/secret-references`, whose payload contains
   names only and never Secret values.
3. Create paper or live account registrations, optionally capturing initial holdings.
4. Edit account names, Secret bindings, and active state while keeping the environment immutable.
5. Delete through an SDK confirmation dialog and explain that historical holdings remain stored.

Exit gate: browser coverage proves create, update, and delete using selected Secret names; no raw
credential field exists in the frontend contract, fixture, or rendered form.

## Runtime configuration

- `VITE_COMMAND_CENTER_ORIGIN`: exact trusted parent origin for the iframe protocol.
- `VITE_FASTAPI_RESOURCE_RELEASE_UID`: public target FastAPI ResourceRelease UID.
- `VITE_API_BASE_URL`: local Vite-development API URL only; it is ignored by production builds.

All three values are public routing configuration. None may contain an access token or Alpaca
credential.

## Verification matrix

| Concern | Proof |
| --- | --- |
| SDK guidance | SDK status is current and both skill sentinels record successful synchronization |
| API fidelity | Frontend endpoint constants match the current FastAPI routers; browser tests cover asset-registration polling, account CRUD, universe creation and lifecycle, and bars-configuration CRUD; backend API tests pass |
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
gating, account CRUD by Secret reference, registered-universe resource management,
bars-configuration CRUD, host theme updates, and production documentation routes.

Holdings snapshots, market-data datasets and observations, portfolios, and other SDK resource views are
not current site pages and require an explicit frontend scope plus verification against their
authoritative contracts.
