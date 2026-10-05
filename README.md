# Alpaca Connectors Command Center

Embedded React application for the Alpaca Connectors FastAPI surface. It provides project-state
visibility, asset-registration workflows, account registration, holdings-universe workflows, and
stored bars configurations without duplicating the backend business logic. Account forms accept
the Alpaca API key and secret key as write-only password fields; the API validates them with Alpaca
and stores them as Main Sequence Secrets, and the application never displays them again.

## Local development

Use Node 24 and start the Alpaca Connectors FastAPI process on `http://127.0.0.1:8321`. The
API authenticates every caller (connector ADR 0014); locally it needs a Main Sequence Bearer
token. Log in once with the Main Sequence CLI for the backend in the API's `MAINSEQUENCE_ENDPOINT`,
then run:

```bash
npm ci
npm run dev
```

The browser calls the Vite dev server, whose proxy forwards `/v1/` and `/health` to the API in
`VITE_API_BASE_URL` (tracked in `.env.development`) and adds `Authorization: Bearer` with a token
from `mainsequence auth token --json`, renewed before it expires. The token stays in the dev server
process. The proxy uses the CLI named by `MAINSEQUENCE_CLI`, else `mainsequence` on `PATH`; set
`MAINSEQUENCE_CLI` to the API checkout's `.venv/bin/mainsequence` when the CLI is not on `PATH`.
Without a session, API requests answer 401 with the reason. The proxy serves only the page it
serves itself, on this machine: requests from another site or computer get 403 and never carry
the token.

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
