# Assets

The Assets page registers explicitly selected Alpaca symbols such as `AAPL`, `MSFT`, and `NVDA`.
It registers exactly those symbols and never expands one into others.

Asset registration requires an active registered Alpaca account. The page sends only its Account UID; the
API opens that account's stored, encrypted keys in its own process (connector ADR 0017) and never
receives key values from the browser.

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

The registered-assets table shows the internal Main Sequence UID, immutable Alpaca asset UUID,
current Alpaca symbol and exchange, tradability, and optional FIGI. The canonical
`ALPACA::<uuid>` value remains an API/storage identity and is not mislabeled as a human-facing
generic identifier.

Both planning and execution start with `POST /v1/assets/registration/operations`. The page polls
`GET /v1/assets/registration/operations/{operation_uid}` until the stored status is `succeeded` or
`failed`. Execution can create missing Main Sequence assets. If you edit any input after planning,
build a new plan before execution.
