# ETF Portfolios

The **Portfolios** navigation group contains three sibling applications:

- **ETF Weight Signals** maintains the observed ETF-weight producers;
- **Rebalance Configurations** maintains reusable rebalance policies; and
- **ETF Portfolios** composes those resources into analytical portfolios.

The ETF Portfolios application opens directly on the portfolio list. Select **Create portfolio**
to open the form.

Each configuration composes:

- one existing ETF Weight Signal Configuration;
- one enabled Alpaca Bars Configuration;
- one reusable Rebalance Configuration;
- persistent daily `InterpolatedPrices` using forward-fill interpolation;
- valuation, missing-price, and commission assumptions; and
- whether the shared portfolio Job's daily scheduled run includes it (**Include in the shared
  portfolio Job's daily scheduled run**, on by default).

The GUI does not expose an Environment selector. The CodeRepositoryBranch runtime resolves its
Organization Environment. Each run selects its configuration with `--configuration-uid <uid>`.

## Ownership

The Portfolio Configuration is the source of truth for calculation intent and for its scheduled
flag. It does not copy the selected Signal's Universe or Account, the Bars Configuration's source
table, or any Job schedule, compute, image, or deployment field.

The connector runs every portfolio on one shared portfolio Job, `Alpaca ETF Portfolio`. Its
workflow file declares the execution path, the daily schedule (02:00 UTC), CPU, memory, maximum
runtime, spot preference, and automatic deployment, so the form has no schedule or compute fields;
the connector rejects a request that still sends them. A JobRun contains execution history only.

The details page shows the shared Job's schedule, timezone, resources, and image read-only, and
whether the portfolio is included in the scheduled run. **Pause** and **Resume** send
`PATCH {"scheduled": false}` or `{"scheduled": true}` for the portfolio. Until a push of the
connector has created the Job on the branch, the details page reports that the Job is not deployed
yet.

## Price availability policies

The two price options are independent checkboxes because they control complementary behavior:

- **Extend latest valuation prices to now** assumes each Asset's last known price remains unchanged
  through the current UTC time. For example, if an Asset's last price is `$100` on January 1 and
  the portfolio runs daily through September 1, the calculation uses `$100` for every daily
  timestamp through September 1 unless a newer price exists. This alignment exists only in memory;
  it does not write synthetic rows into persistent `InterpolatedPrices` storage and does not extend
  signal validity.
- **Stop when a required asset has no price** handles the case that forward-fill cannot solve.
  Forward-fill needs at least one existing price. If a signal requires AAPL and XYZ but the
  valuation source has never contained a usable price for XYZ, there is nothing to carry forward.
  When enabled, the run stops immediately and reports XYZ. When disabled, it logs the missing Asset
  and attempts the calculation without inventing a price; the run may still fail if it cannot
  produce a usable portfolio frame.

Enable either option independently or enable both. Forward-fill can cover later dates only after
an Asset has a known price; it cannot manufacture the first usable observation. Strict
missing-price validation therefore remains meaningful when forward-fill is enabled.

## Rebalance scope

Open **Rebalance Configurations** directly from the **Portfolios** navigation group to create,
edit, or delete reusable policies. The strategy is selected with a picker so future strategies can
extend the same form; Phase 1 offers only `ImmediateSignal`. Configuration names and descriptions
remain user-defined. Each observed ETF weight frame is applied immediately in the analytical
backtest.

This is an observation-time reconstruction. ETF Weight Signal timestamps record when holdings were
observed; they do not guarantee exact economic effective time. The backtest does not model
execution latency, partial fills, volume participation, market impact, or slippage beyond the
configured commission fee.

## Running and inspecting

Use **Run now** only after the shared Job image is ready; it works whether or not the portfolio is
paused. The connector refuses a run while the portfolio's previous run is still pending or running,
or while its preflight is blocked: a run requires existing, enabled linked configurations and a
signal with published observations, plus source bars for the signal Assets and the migrated
persistent interpolation storage. The portfolio run updates interpolation and calculates the
ms-markets portfolio without rerunning the signal or raw-bars producers.

Select a row to load its business-facing detail on demand. The detail resolves the linked Signal,
Universe, Alpaca accounts, Bars scope and profile, Rebalance policy, the shared Job's settings, and
canonical portfolio calendar without exposing their internal UIDs. It also queries up to the latest
2,500 canonical daily values and renders portfolio value and drawdown history. No observation query
is made for portfolios that the user has not opened.

The performance panel provides a quick, window-scoped review rather than a separate portfolio
analytics application. The API uses `empyrical-reloaded` to calculate total and annualized return,
annualized volatility, Sharpe, Sortino, maximum drawdown, Calmar, best/worst daily return, and the
positive-period ratio. The panel states the 252-period annualization and 0% risk-free-rate
assumptions, shows the exact statistics window, and marks a bounded result when more history exists.
Alpha and beta are omitted because no benchmark is configured. Delete removes only the durable
configuration; already-published portfolio observations and the shared Job's past runs remain.
