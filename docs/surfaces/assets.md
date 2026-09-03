# Assets

The Assets page supports two registration inputs:

- exact Alpaca symbols such as `AAPL`, `MSFT`, and `NVDA`;
- ETF seed tickers expanded with a configured component provider such as `ishares`.

## What ETF seed registration does

ETF seed mode is a registration workflow, not universe creation. It:

1. expands each ETF seed into its current constituent symbols using the selected provider;
2. checks every constituent against Alpaca and resolves its OpenFIGI and Main Sequence identity;
3. builds a read-only plan listing missing, unresolved, and warning cases;
4. registers only fully resolved missing assets when the approved plan is executed.

After registration, use the Universes page to create or refresh holdings-backed `AssetCategory`
membership. Changing the seed, provider, timeout, or tradability option invalidates the existing
plan and requires a new one.

Build a plan first. The API accepts the work as an observable operation and the page follows its
stable operation UID. An ordered progress list reports the actual backend boundaries: input or ETF
scope preparation, Alpaca credential and asset-catalog loading, OpenFIGI resolution, existing Main
Sequence asset checks, and plan finalization. Execution adds asset registration and result
finalization steps. Each step remains visibly waiting, running, complete, failed, or skipped
according to the recorded API state. Failures name the dependency and explain whether a later
provider—such as OpenFIGI—was reached.

The completed plan reports resolution summaries, missing Alpaca symbols, unresolved symbols,
warnings, and the symbols that would be registered. **Execute approved plan** becomes available
only when `can_register` is true and the form has not changed since planning.

Both planning and execution start with `POST /v1/assets/registration/operations`. The page polls
`GET /v1/assets/registration/operations/{operation_uid}` until the stored status is `succeeded` or
`failed`. Execution can create missing Main Sequence assets. If you edit any input after planning,
build a new plan before execution.
