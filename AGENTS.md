# AGENTS.md

This repository is the Command Center static-site application for the Alpaca Connectors API.

## Application contract

- Build a full embedded Command Center application, not a portable widget.
- Use `@dev-mainsequence/command-center-sdk` for iframe transport, theme, application layout,
  navigation, feedback, and layout verification.
- Keep the iframe channel stable at `mainsequence.alpaca-connectors`.
- Use delegated `fetchFastApi` calls for a configured FastAPI ResourceRelease UID. Never accept,
  persist, log, or place access tokens or Alpaca credentials in URLs.
- Allow direct API access only in Vite development and automated end-to-end test builds.
- Apply every host theme context update. Use published SDK semantic variables in authored CSS and
  keep the SDK theme audit passing.

## Current API surfaces

- Assets: exact-symbol or ETF-seed registration planning and execution, with polling of the API's
  persisted operation and ordered step status.
- Accounts: create, list, update, and delete Alpaca registrations by selecting visible Main
  Sequence Secret names; never accept credential values.
- Universes: holdings-backed universe planning and execution.
- Bars: create, list, edit, and delete stored Alpaca bar configurations using registered accounts,
  exactly one asset source, and an already-migrated market-data profile.
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
- Run `npm run check`, `npm run build`, and `npm run test:e2e` before claiming completion.
