# AGENTS.md

This repository is the Command Center static-site application for the Alpaca Connectors API.

## Application contract

- Build a full embedded Command Center application, not a portable widget.
- Use `@dev-mainsequence/command-center-sdk` for iframe transport, theme, application layout,
  navigation, feedback, and layout verification.
- Keep the iframe channel stable at `mainsequence.alpaca-connectors`.
- Use delegated `fetchFastApi` calls for a configured FastAPI ResourceRelease UID. Never accept,
  persist, log, or place access tokens or Alpaca credentials in URLs.
- Allow direct API access only in Vite development and automated end-to-end test builds. The API
  authenticates every caller (connector ADR 0014): in Vite development the dev server proxy
  (`vite.config.ts`) adds the developer's `mainsequence auth token` as `Authorization: Bearer`;
  browser code never holds or constructs a token.
- Apply every host theme context update. Use published SDK semantic variables in authored CSS and
  keep the SDK theme audit passing.
- Request delegated FastAPI access and platform requests only after the host's first context; the
  SDK refuses them before it, so `src/transport.ts` exposes the transport only then.
- The Alpaca Agent conversation uses `@dev-mainsequence/command-center-ai`'s public components
  (`ChatLauncher`, `ChatRail`, `ChatThread`, one `ChatEngineProvider` above the shell;
  `src/assistant.tsx`). Never hand-build a rail, thread, or composer. The Agent and its Environment
  come only from `GET /v1/project-state/configuration` (`agent_uid`,
  `organization_environment_uid`), read when the page loads; never put either in
  `build_environment`, a `VITE_` value, or code, and never take the Environment from Command Center.
  When the API names no Agent, hide the assistant and keep every page working. Platform requests go
  through the host bridge (`client.sendPlatformRequest`), or in Vite development through the SDK's
  `platformRequestProxy()`.
- The site-owned full local launch is `npm run dev:stack` (`scripts/dev-stack.mjs`), also used by
  `.vscode/launch.json` and `.claude/launch.json`. It starts Vite, the sibling connector API, a
  restricted TAU local Agent and local SQLite MetaTables. Never initialize or migrate automatically,
  replace occupied site/API/Agent ports, or stop a pre-existing shared MetaTables service.
- In standalone Vite development only, explicit `VITE_AGENT_MODE=local` selects the AI SDK's
  `createLocalAgentSource` and SDK `localAgentProxy`; local chat does not resolve a platform Agent,
  Environment or session. Keep the normal embedded/production contract unchanged. Unavailability
  is an error, never a deployed-service fallback. Do not add an adapter or enable generic tools to
  work around TAU's local application-MCP gap (ms-tau-sdk issue #102).

## Current API surfaces

- Assets: exact-symbol registration planning and execution, with polling of the API's
  persisted operation and ordered step status.
- Accounts: create, list, update, remove keys, and delete Alpaca accounts. Users type the Alpaca API
  key and secret key; the API validates them and stores them encrypted on the account row (connector
  ADR 0017, superseding the managed Secrets of ADR 0011). Responses carry `credential_source`,
  `credentials_stored` and `credentials_removed`, never a value or Secret name, and there is no
  Secret picker. Keep the values in component state only, clear them after use, and never put them
  in a URL, browser storage, persisted view state, or logs. Remove keys clears only the keys;
  Delete shows the connector's delete preflight and deletes the account with everything it owns,
  sending the exact `confirm=DELETE <account uid>` (connector ADR 0028).
- Agent key requests: the Accounts page lists the signed-in person's pending requests from the
  Alpaca Agent (`GET /v1/accounts/key-requests`, connector ADR 0015). Enter keys opens the
  registration or rotation form with the request's settings fixed and sends its `key_request_uid`
  with the keys; Dismiss cancels it. Command Center passes nothing from its URL into the site, so a
  request is never read from the URL.
- The workflow (`api_version: "2.3.0"`, `kind: static_site`) names the API release by repository
  and key (`alpaca-connectors` / `alpaca`) in `build_environment`, never by a pinned UID. Never
  rename the workflow file or the `alpaca-connectors-site` key: the site's UID, URL, and Command
  Center link depend on them, and the Alpaca Agent hands people that link for key entry.
- Bars: create, list, edit, and delete the bars feeds of accounts (`assets` or `account_holdings`)
  with an already-migrated market-data profile. A portfolio's own configuration (`portfolios`)
  comes and goes with its portfolio: edit it without its account or source, never delete it. A
  `portfolios` feed of an account keeps its source when edited. Never block what the connector
  allows; mirror its refusals only.
- Portfolios: the connector keeps only portfolios built from weights an application provides
  (decided 2026-11-17, connector ADR 0024); each belongs to one account and follows one of its
  signals (connector ADR 0028). Creating a portfolio or a signal and giving weights are the
  application's capabilities: the site never offers them and has no portfolio create or edit form.
  Signals lists, inspects, renames, and deletes signal definitions. List columns come only from
  the connector's discovery: add a column there first, then render it by its id.
  It lists, inspects, and runs portfolios, which the connector's workflow-declared portfolio Job runs
  (connector ADR 0013). Pause and resume (`PATCH {scheduled}`) and delete, which retires the
  portfolio, are the owner's: the connector names no owner and answers anyone else 403, which the
  site reads as "Only the portfolio's owner can do this." The details page shows the shared Job's
  schedule read-only and never writes schedule or compute settings.
- Rebalance configurations: `calendar_event_signal` policies (connector ADR 0009). New ones use the
  NYSE calendar's `regular` session; the form sends every calendar-event field (market event,
  signed offset in seconds, cadence, weekday); the connector rejects unknown fields with 422.
  Browser tests assert the exact create and edit bodies.
- Documentation: project-wide capability and configuration reference, plus workflow and technical
  guidance. Documentation is a footer application in the SDK navigation rail, not an application
  page or a custom link outside the rail.

The application root resolves to Assets. Do not add a catalog-style Overview page. Project
capabilities that do not have a site workflow belong in documentation and must not be presented as
interactive application features. Do not invent routes or resource adapters for them.

## Maintenance and verification

- Check and update the SDK with `npx command-center-sdk application ...`.
- Strictly synchronize package and platform agent skills before substantial SDK work.
- Keep user and technical documentation in `docs/` and publish it at `/docs/` in the same build.
- Run `npm run check`, `npm run test:launch`, `npm run build`, and `npm run test:e2e` before claiming completion.
