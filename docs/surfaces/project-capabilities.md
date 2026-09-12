# Project capabilities

This page describes the Alpaca Connectors repository as a whole. It is reference documentation,
not a list of pages or actions available in the Command Center site.

The project can:

- report API health, its implemented capability catalog, and current provider configuration;
- resolve and register Alpaca US equities as Main Sequence public assets using strict Alpaca and
  OpenFIGI matching;
- register exact Alpaca symbols and build reusable source-backed asset universes whose Run owns constituent registration;
- register and refresh Alpaca brokerage accounts and holdings snapshots;
- plan and publish Alpaca stock bars for an asset or registered Asset Universe;
- build and schedule durable analytical ETF-tracking ms-markets portfolios from holdings signals,
  persistent interpolated bars, and reusable rebalance configurations;
- create and operate scheduled Universe-backed ETF signals with one dedicated Job per configuration;
- report plans, validation blockers, execution results, and operational outcomes.

## What the site exposes

The current site deliberately exposes seven interactive workflows. ETF Weight Signals, Rebalance
Configurations, and ETF Portfolios are grouped together under **Portfolios**:

| Site page | Interactive behavior |
| --- | --- |
| Assets | Plan and execute exact-symbol asset registration |
| Accounts | Create, inspect, update, and delete Alpaca registrations using Secret names |
| Universes | Create explicit Asset Universe registrations and Run extraction, constituent registration, and membership refresh |
| Bars | Create, inspect, edit, and delete stored Alpaca bars configurations |
| ETF Weight Signals | Create, inspect, edit, run, enable or disable scheduling, and delete dedicated signal Job configurations |
| Rebalance Configurations | Create, inspect, edit, and delete reusable rebalance policies; Phase 1 offers ImmediateSignal |
| ETF Portfolios | Create, inspect, edit, run, and delete durable portfolio configurations and their dedicated Jobs |

Holdings snapshots, market-data observations, and other repository capabilities are not implied to
be site pages. They remain available through the repository surfaces that actually implement them,
such as the CLI, reusable Python modules, scheduled jobs, or canonical API routes. A future site
page must be built from its authoritative API contract before it appears in application navigation.

## Configuration used by the site

The site reads `/v1/project-state/configuration` for migrated market-data profiles used by the Bars
form. Signal and Portfolio Jobs resolve the Organization Environment internally; the browser never
selects one. API health and capability
availability remain documentation or operator concerns; they are not an Overview dashboard.
