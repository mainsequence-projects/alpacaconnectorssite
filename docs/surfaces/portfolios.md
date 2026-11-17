# ETF Portfolios

The **Portfolios** navigation group contains three sibling applications:

- **ETF Weight Signals** operates the remaining observed ETF-weight producers;
- **Rebalance Configurations** maintains reusable calendar-event rebalance policies; and
- **ETF Portfolios** lists, inspects, runs, and deletes analytical portfolios.

The ETF Portfolios application opens directly on the portfolio list. ETF portfolios are being
retired: the connector keeps only portfolios built from weights an application provides, and
creating those is the application's capability, so the page has no create or edit form. The
remaining ETF portfolios stay available until each Environment has been drained of them.

Each configuration composes:

- an ETF Weight Signal Configuration, or the weights an application provides (connector ADR 0024);
- one enabled Alpaca Bars Configuration;
- one reusable Rebalance Configuration;
- persistent daily `InterpolatedPrices` using forward-fill interpolation;
- the valuation column, maximum price staleness, missing-price policy, and commission fee; and
- whether the shared portfolio Job's daily scheduled run includes it.

The GUI does not expose an Environment selector. The CodeRepositoryBranch runtime resolves its
Organization Environment. Each run selects its configuration with `--configuration-uid <uid>`.

## Ownership

The Portfolio Configuration is the source of truth for calculation intent and for its scheduled
flag. It does not copy the selected Signal's Universe or Account, the Bars Configuration's source
table, or any Job schedule, compute, image, or deployment field.

The connector runs every portfolio on one shared portfolio Job, `Alpaca ETF Portfolio`. Its
workflow file declares the execution path, the daily schedule (02:00 UTC), CPU, memory, maximum
runtime, spot preference, and automatic deployment. A JobRun contains execution history only.

The details page shows the shared Job's schedule, timezone, resources, and image read-only, and
whether the portfolio is included in the scheduled run. **Pause** and **Resume** send
`PATCH {"scheduled": false}` or `{"scheduled": true}` for the portfolio. Until a push of the
connector has created the Job on the branch, the details page reports that the Job is not deployed
yet.

## Valuation alignment

Valuation uses the latest price at or before each real portfolio timestamp, a rebalance event or a
valuation-source observation:

- **Maximum price staleness** bounds how old that price may be; the details page shows it as a
  duration with its seconds (the connector's default, `86400`, is one day). Alignment never creates
  timestamps, extends the portfolio to the current time, or changes signal validity, so there is no
  option to extend prices to now.
- The **missing-price policy** decides what happens when a required asset, one the portfolio holds,
  enters, or exits, has no price within that bound: either the run stops and reports the asset, or
  the valuation is attempted without that price; no price is invented, and the run may still fail
  if no usable valuation remains.

Persistent `InterpolatedPrices` still forward-fills gaps in the source bars, and each asset carries
the rebalance calendar, so daily valuation observations follow the configured exchange session.

## Rebalance configurations

Open **Rebalance Configurations** directly from the **Portfolios** navigation group to create,
edit, or delete reusable policies. The only strategy is `CalendarEventSignal`: at each selected
persisted calendar event it executes the latest ETF weights observed at or before that event. A
signal observed after the event first becomes eligible at the next one, and early closes use their
actual persisted close times.

Alpaca trades US equities, so new policies use the persisted `NYSE` calendar's `regular` session;
the form shows the calendar read-only. Editing a policy keeps the calendar it already stores. The
form chooses:

- **Market event**: market close (the default) or market open;
- **Event offset (seconds)**: a whole number of seconds from the actual event; `0` is the event
  itself, `-900` is 15 minutes before it, and `1800` is 30 minutes after it;
- **Cadence**: every session (the default) or weekly; and
- **Weekday**, for weekly cadence only: Monday through Friday. Only sessions on that weekday
  rebalance, so a week whose session that day is a holiday has none. An every-session policy sends
  the default weekday, `0`.

A line under the fields describes the result, such as "Rebalances 15 min before market close of
each NYSE regular session that falls on a Wednesday." Create and **Save changes** send every field
of the connector's rebalance request model:

```json
{
  "name": "Wednesday pre-close",
  "description": null,
  "strategy": "calendar_event_signal",
  "calendar_identifier": "NYSE",
  "session_label": "regular",
  "rebalance_event": "market_close",
  "event_offset_seconds": -900,
  "rebalance_cadence": "weekly",
  "rebalance_weekday": 2
}
```

The list shows each policy's calendar, market event with its offset, and cadence.

This is a calendar-executed reconstruction. ETF Weight Signal timestamps record when holdings were
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
Universe, and runtime account of an ETF portfolio, or, for a portfolio built from provided weights,
how many assets its weights cover and when it was first and last given weights. It also resolves
the Bars scope and profile, Rebalance policy with its calendar, event, and cadence, the maximum
price staleness, the shared Job's settings, and the canonical portfolio calendar without exposing
their internal UIDs. It also queries up to the latest
2,500 canonical daily values and renders portfolio value and drawdown history. No observation query
is made for portfolios that the user has not opened.

The performance panel provides a quick, window-scoped review rather than a separate portfolio
analytics application. The API uses `empyrical-reloaded` to calculate total and annualized return,
annualized volatility, Sharpe, Sortino, maximum drawdown, Calmar, best/worst daily return, and the
positive-period ratio. The panel states the 252-period annualization and 0% risk-free-rate
assumptions, shows the exact statistics window, and marks a bounded result when more history exists.
Alpha and beta are omitted because no benchmark is configured. Delete removes only the durable
configuration; already-published portfolio observations and the shared Job's past runs remain.
