# ETF Portfolios

The ETF Portfolios page creates and operates durable analytical portfolio configurations. The
default view is the portfolio list; select **Create portfolio** to open the form.

Each configuration composes:

- one existing ETF Weight Signal Configuration;
- one enabled Alpaca Bars Configuration;
- one reusable Rebalance Configuration;
- persistent daily `InterpolatedPrices` using forward-fill interpolation;
- valuation, missing-price, and commission assumptions; and
- one dedicated Main Sequence Job.

The GUI does not expose an Environment selector. The CodeRepositoryBranch runtime resolves its
Organization Environment. Manual and scheduled runs pass no business arguments; the launcher
resolves the durable configuration through `JOB_RUN_UID -> Job.uid -> Portfolio Configuration`.

## Ownership

The Portfolio Configuration is the source of truth for calculation intent. It does not copy the
selected Signal's Universe or Account, the Bars Configuration's source table, or the Job's
schedule, compute, image, and deployment fields.

The dedicated Job is the source of truth for the execution path, schedule, CPU, memory, maximum
runtime, spot preference, image, and automatic deployment. A JobRun contains execution history
only. The create and edit forms present these values together, but submit Job fields under the
nested `job` object so the backend writes every field to its authoritative owner.

## Rebalance scope

Select **Rebalance configurations** to create, edit, or delete reusable policies. Phase 1 supports
only `ImmediateSignal`. Each observed ETF weight frame is applied immediately in the analytical
backtest.

This is an observation-time reconstruction. ETF Weight Signal timestamps record when holdings were
observed; they do not guarantee exact economic effective time. The backtest does not model
execution latency, partial fills, volume participation, market impact, or slippage beyond the
configured commission fee.

## Running and inspecting

Use **Run now** only after the dedicated Job image is ready. A run requires an existing signal
observation, source bars for the signal Assets, and the migrated persistent interpolation storage.
The portfolio Job updates interpolation and calculates the ms-markets portfolio without rerunning
the signal or raw-bars producers.

Select a row to inspect the linked Signal, Bars, Rebalance, and materialized Portfolio identities,
the calculation contract, and current Job schedule. Delete removes the durable configuration and
its dedicated Job while retaining already-published portfolio observations.
