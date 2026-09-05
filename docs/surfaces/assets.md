# Assets

The Assets page registers explicitly selected Alpaca symbols such as `AAPL`, `MSFT`, and `NVDA`.
It does not expand ETF seeds. Constituent discovery belongs to a registered universe and happens
when that universe is run.

Asset registration requires an active registered Alpaca account. The page sends only its Account UID; the
API resolves the Main Sequence Secret names stored on that account and never receives credential
values from the browser.

Build a plan first. The API accepts the work as an observable operation and the page follows its
stable operation UID. An ordered progress list reports the actual backend boundaries: exact-symbol
scope preparation, registered-account resolution, Alpaca asset-catalog loading, Alpaca UUID resolution, optional
OpenFIGI enrichment, existing Main Sequence asset checks, and plan finalization. Execution adds asset registration and result
finalization steps. Each step remains visibly waiting, running, complete, failed, or skipped
according to the recorded API state. Failures name the dependency and explain whether a later
provider was reached. OpenFIGI outages and unmatched identifiers are returned as non-blocking
warnings.

The completed plan reports resolution summaries, missing Alpaca symbols, optional OpenFIGI
warnings, and the symbols that would be registered. **Execute approved plan** becomes available
only when `can_register` is true and the form has not changed since planning.

To manage an ETF or another provider-derived collection, create an account-independent Universe
with its source. Universe Run asks for an Alpaca account as execution context, discovers
constituents, and registers missing assets before refreshing the linked category membership.

The registered-assets table shows the internal Main Sequence UID, immutable Alpaca asset UUID,
current Alpaca symbol and exchange, tradability, and optional FIGI. The canonical
`ALPACA::<uuid>` value remains an API/storage identity and is not mislabeled as a human-facing
generic identifier.

Both planning and execution start with `POST /v1/assets/registration/operations`. The page polls
`GET /v1/assets/registration/operations/{operation_uid}` until the stored status is `succeeded` or
`failed`. Execution can create missing Main Sequence assets. If you edit any input after planning,
build a new plan before execution.
