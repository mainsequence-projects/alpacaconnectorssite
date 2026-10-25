# Testing and verification

Use Node 24, then run:

```bash
npm run check
npm run build
npm run test:e2e
```

`npm run check` audits authored CSS against the installed Command Center theme contract, validates
the generated documentation navigation, and type-checks the application.

`npm run build` produces the Vite application and Docusaurus documentation in the same `dist/`
directory.

`npm run test:e2e` builds in the explicit test mode and uses a cross-origin host fixture. The
browser suite checks the direct development transport, asset and universe flows, account review,
registration, credential rotation, and removal with keys stored encrypted by the API,
bars-configuration CRUD, signal CRUD and run actions, portfolio and rebalance create and edit, the
signal and portfolio scheduled-run toggles (signal pause and resume actions, portfolio
`PATCH {scheduled}`) with the shared Job's schedule shown read-only, the iframe handshake,
delegated request headers, live theme changes, documentation routes, and Command Center layout
geometry at phone, tablet, and desktop widths.

The asset fixture implements the observable registration-operation contract. Browser coverage
proves that both planning and execution poll to terminal success and display every producer step
through the SDK progress list before presenting the corresponding result.

Portfolio and rebalance tests assert each create and edit body exactly with
`request.postDataJSON()`. The fixture mirrors the connector's portfolio and rebalance request
models (connector ADR 0009): it rejects unknown fields with 422, including the retired
`portfolio_prices_frequency` and `forward_fill_to_now` and any strategy other than
`calendar_event_signal`, applies the connector's defaults, and serves the API's rebalance
discovery columns.

The authentication tests check both transports against the fixture's request log: every request
from the embedded application carries the delegated `Authorization: Bearer` and
`X-Resource-Release-UID`, and a Vite development server (port 4275) proxies every request with the
session token from `scripts/e2e-mainsequence-cli.mjs`, a stand-in for `mainsequence auth token`,
while its browser requests carry no token.

The Alpaca Agent tests run inside the host fixture, whose configuration answer names a synthetic
Agent and Environment and whose host page records every platform request the application sends
through the bridge (answering each with 404). They check that the launcher appears only when the API
names an Agent, that a visit that does not open the rail sends no write, that opening it gets or
creates the session of the API's Agent, as the host's person, with every platform read scoped to the
API's Environment, that the rail floats below 1400px and docks beside the narrowed page from 1400px,
and that with `agent_uid: null` the assistant is hidden and the pages keep working.

The browser fixture uses a fake ResourceRelease UID and synthetic delegated and session tokens. It
does not call Alpaca or Main Sequence.
