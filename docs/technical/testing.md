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
registration, credential rotation, and removal with API-managed credential Secrets,
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

The browser fixture uses a fake ResourceRelease UID and synthetic delegated token. It does not call
Alpaca or Main Sequence.
