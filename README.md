# Alpaca Connectors Command Center

Embedded React application for the Alpaca Connectors FastAPI surface. It provides project-state
visibility, asset-registration workflows, account registration, holdings-universe workflows, and
stored bars configurations without duplicating the backend business logic. Account forms select
existing Main Sequence Secret names and never accept Alpaca credential values.

## Local development

Use Node 24 and start the Alpaca Connectors FastAPI process on `http://127.0.0.1:8321`. The
tracked `.env.development` points standalone Vite development at that API, so then run:

```bash
npm ci
npm run dev
```

The direct API transport is deliberately limited to development and end-to-end builds. A normal
production build requires the Command Center iframe bridge. Its FastAPI ResourceRelease UID is
provided separately by `.mainsequence/workflows/alpaca-connectors-site.yaml` as public build-time
configuration; production does not use `VITE_API_BASE_URL`.

## Verification

```bash
npm run check
npm run build
npm run test:e2e
```

The implementation plan is in `docs/technical/frontend-implementation-plan.md`; the same-artifact
documentation is built beneath `/docs/`. Automatic Static Site deployment, the linked FastAPI
ResourceRelease, and the managed Command Center application icon are declared in
`.mainsequence/workflows/alpaca-connectors-site.yaml` and documented in
`docs/technical/deployment.md`.
