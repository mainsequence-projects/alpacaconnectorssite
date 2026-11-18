---
slug: /
---

# Application surfaces

The Alpaca Connectors command center currently has five workflow pages. Portfolio functionality
is grouped into two sibling applications under **Portfolios**:

- **Assets** plans and executes provider-native Alpaca asset registration, with optional OpenFIGI enrichment.
- **Accounts** registers and maintains Alpaca accounts from their API keys, which the API stores encrypted on the account.
- **Bars** creates and maintains reusable Alpaca stock-bar configurations.
- **Rebalance Configurations** creates and maintains reusable calendar-event rebalance policies
  on the NYSE regular session.
- **Portfolios** lists, inspects, and runs the portfolios built from weights an application
  provides; a portfolio's owner can also pause, resume, or delete it.

The connector keeps only portfolios built from weights an application provides. Creating one and
giving it weights are the application's capabilities, so the site never offers them.

Planning never changes platform state. Execution remains disabled until the exact current inputs
have produced a plan without blockers.

The root application route opens Assets. Project health, configuration, and the broader repository
capability catalog are reference information, so they live in [Project capabilities](project-capabilities.md)
instead of an application Overview page.
