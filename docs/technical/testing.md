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
browser suite checks the direct development transport, asset and universe flows, account CRUD by
Secret reference, bars-configuration CRUD, signal Job CRUD and lifecycle actions, the iframe
handshake, delegated request headers, live theme changes, documentation routes, and Command Center
layout geometry at phone, tablet, and desktop widths.

The asset fixture implements the observable registration-operation contract. Browser coverage
proves that both planning and execution poll to terminal success and display every producer step
through the SDK progress list before presenting the corresponding result.

The browser fixture uses a fake ResourceRelease UID and synthetic delegated token. It does not call
Alpaca or Main Sequence.
