# Project capabilities

This page describes the Alpaca Connectors repository as a whole. It is reference documentation,
not a list of pages or actions available in the Command Center site.

The project can:

- report API health, its implemented capability catalog, and current provider configuration;
- resolve and register Alpaca US equities as Main Sequence public assets using strict Alpaca and
  OpenFIGI matching;
- register and refresh Alpaca brokerage accounts and holdings snapshots;
- plan and publish Alpaca stock bars for explicit assets, an account's latest holdings, or the
  assets of the live portfolios that use them;
- build and schedule durable analytical ms-markets portfolios from weights an application provides,
  persistent interpolated bars, and reusable rebalance configurations, run by one shared,
  workflow-declared portfolio Job;
- report plans, validation blockers, execution results, and operational outcomes.

## What the site exposes

The current site deliberately exposes five interactive workflows. Rebalance Configurations and
Portfolios are grouped together under **Portfolios**:

| Site page | Interactive behavior |
| --- | --- |
| Assets | Plan and execute exact-symbol asset registration |
| Accounts | Create, inspect, update, rotate credentials for, and delete Alpaca registrations from their API keys |
| Bars | Create, inspect, edit, and delete stored Alpaca bars configurations |
| Rebalance Configurations | Create, inspect, edit, and delete reusable CalendarEventSignal policies on the NYSE regular session |
| Portfolios | Inspect and run portfolios; their owner can also pause or resume the scheduled run of, and delete, them |

Creating a portfolio from provided weights and giving it weights are application capabilities; the
site never offers them.

Holdings snapshots, market-data observations, and other repository capabilities are not implied to
be site pages. They remain available through the repository surfaces that actually implement them,
such as the CLI, reusable Python modules, scheduled jobs, or canonical API routes. A future site
page must be built from its authoritative API contract before it appears in application navigation.

## Configuration used by the site

The site reads `/v1/project-state/configuration` for migrated market-data profiles used by the Bars
form. The shared portfolio Job resolves the Organization Environment internally; the browser never
selects one. API health and capability
availability remain documentation or operator concerns; they are not an Overview dashboard.
