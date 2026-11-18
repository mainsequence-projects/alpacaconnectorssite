---
slug: /
---

# Application surfaces

The Alpaca Connectors command center currently has six workflow pages. Portfolio functionality
is grouped into three sibling applications under **Portfolios**:

- **Assets** plans and executes provider-native Alpaca asset registration, with optional OpenFIGI enrichment.
- **Accounts** registers and maintains Alpaca accounts from their API keys, which the API stores
  encrypted on the account; their owner can remove the keys, or delete an account with everything
  it owns.
- **Bars** creates and maintains the bars feeds of accounts, and adjusts each portfolio's own bars
  configuration.
- **Signals** inspects each account's signals and their latest weights; the account's owner can
  rename or delete them.
- **Rebalance Configurations** creates and maintains reusable calendar-event rebalance policies
  on the NYSE regular session.
- **Portfolios** lists, inspects, and runs each account's portfolios; a portfolio's owner can also
  pause, resume, or delete it.

The connector keeps only portfolios built from weights an application provides, and every portfolio
belongs to one account and follows one of its signals (connector ADR 0028). Creating portfolios and
signals and giving signals weights are the application's capabilities, so the site never offers
them.

Planning never changes platform state. Execution remains disabled until the exact current inputs
have produced a plan without blockers.

The root application route opens Assets. Project health, configuration, and the broader repository
capability catalog are reference information, so they live in [Project capabilities](project-capabilities.md)
instead of an application Overview page.
