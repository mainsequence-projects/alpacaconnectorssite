---
slug: /
---

# Application surfaces

The Alpaca Connectors command center currently has seven workflow pages. Portfolio functionality
is grouped into three sibling applications under **Portfolios**:

- **Assets** plans and executes provider-native Alpaca asset registration, with optional OpenFIGI enrichment.
- **Accounts** registers and maintains Alpaca accounts through Main Sequence Secret references.
- **Universes** creates explicit Asset Universe registrations and Runs their linked sources.
- **Bars** creates and maintains reusable Alpaca stock-bar configurations.
- **ETF Weight Signals** creates and operates one dedicated scheduled Job per Universe-backed ETF signal.
- **Rebalance Configurations** creates and maintains reusable portfolio rebalance policies.
- **ETF Portfolios** composes an existing signal, bars configuration, persistent interpolated
  prices, and an ImmediateSignal rebalance policy into a scheduled analytical portfolio.

Planning never changes platform state. Execution remains disabled until the exact current inputs
have produced a plan without blockers.

The root application route opens Assets. Project health, configuration, and the broader repository
capability catalog are reference information, so they live in [Project capabilities](project-capabilities.md)
instead of an application Overview page.
