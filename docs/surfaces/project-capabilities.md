# Project capabilities

This page describes the Alpaca Connectors repository as a whole. It is reference documentation,
not a list of pages or actions available in the Command Center site.

The project can:

- report API health, its implemented capability catalog, and current provider configuration;
- resolve and register Alpaca US equities as Main Sequence public assets using strict Alpaca and
  OpenFIGI matching;
- expand provider-backed ETF seeds and build reusable holdings-backed asset universes;
- register and refresh Alpaca brokerage accounts and holdings snapshots;
- plan and publish Alpaca stock bars for an asset or a materialized universe;
- build analytical ETF-tracking ms-markets portfolios from holdings signals and interpolated bars;
- report plans, validation blockers, execution results, and operational outcomes.

## What the site exposes

The current site deliberately exposes four interactive workflows:

| Site page | Interactive behavior |
| --- | --- |
| Assets | Plan and execute exact-symbol or ETF-seed asset registration |
| Accounts | Create, inspect, update, and delete Alpaca registrations using Secret names |
| Universes | Plan and execute ETF holdings-backed universe synchronization |
| Bars | Create, inspect, edit, and delete stored Alpaca bars configurations |

Holdings snapshots, market-data execution and observations, portfolios, and other repository capabilities are not implied to
be site pages. They remain available through the repository surfaces that actually implement them,
such as the CLI, reusable Python modules, scheduled jobs, or canonical API routes. A future site
page must be built from its authoritative API contract before it appears in application navigation.

## Configuration used by the site

The site reads `/v1/project-state/configuration` to populate supported component providers in the
Assets form and migrated market-data profiles in the Bars form. API health and capability
availability remain documentation or operator concerns; they are not an Overview dashboard.
