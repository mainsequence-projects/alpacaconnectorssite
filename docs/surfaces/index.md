---
slug: /
---

# Application surfaces

The Alpaca Connectors command center currently has seven workflow pages. Portfolio functionality
is grouped into three sibling applications under **Portfolios**:

- **Assets** plans and executes provider-native Alpaca asset registration, with optional OpenFIGI enrichment.
- **Accounts** registers and maintains Alpaca accounts from their API keys, which the API stores encrypted on the account.
- **Universes** creates explicit Asset Universe registrations and Runs their linked sources.
- **Bars** creates and maintains reusable Alpaca stock-bar configurations.
- **ETF Weight Signals** creates and operates Universe-backed ETF signals, which the connector's shared signal Job runs daily.
- **Rebalance Configurations** creates and maintains reusable calendar-event rebalance policies
  on the NYSE regular session.
- **ETF Portfolios** composes an existing signal, bars configuration, persistent interpolated
  prices, and a CalendarEventSignal rebalance policy into a scheduled analytical portfolio.

Planning never changes platform state. Execution remains disabled until the exact current inputs
have produced a plan without blockers.

The root application route opens Assets. Project health, configuration, and the broader repository
capability catalog are reference information, so they live in [Project capabilities](project-capabilities.md)
instead of an application Overview page.
