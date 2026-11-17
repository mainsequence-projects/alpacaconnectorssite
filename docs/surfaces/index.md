---
slug: /
---

# Application surfaces

The Alpaca Connectors command center currently has seven workflow pages. Portfolio functionality
is grouped into three sibling applications under **Portfolios**:

- **Assets** plans and executes provider-native Alpaca asset registration, with optional OpenFIGI enrichment.
- **Accounts** registers and maintains Alpaca accounts from their API keys, which the API stores encrypted on the account.
- **Universes** inspects, Runs, and deletes the registered Asset Universes, which can no longer be created.
- **Bars** creates and maintains reusable Alpaca stock-bar configurations.
- **ETF Weight Signals** inspects, runs, pauses or resumes, and deletes the remaining
  Universe-backed ETF signals, which can no longer be created or edited.
- **Rebalance Configurations** creates and maintains reusable calendar-event rebalance policies
  on the NYSE regular session.
- **ETF Portfolios** inspects, runs, pauses or resumes, and deletes scheduled analytical
  portfolios; new ETF portfolios can no longer be created or edited.

Universes, ETF signals, and ETF portfolios are being retired: the connector keeps only portfolios
built from weights an application provides, and creating those is the application's capability.

Planning never changes platform state. Execution remains disabled until the exact current inputs
have produced a plan without blockers.

The root application route opens Assets. Project health, configuration, and the broader repository
capability catalog are reference information, so they live in [Project capabilities](project-capabilities.md)
instead of an application Overview page.
