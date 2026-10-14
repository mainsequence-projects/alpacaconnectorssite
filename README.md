# Alpaca Connectors Command Center

Embedded React application for the Alpaca Connectors FastAPI surface. It provides project-state
visibility, asset-registration workflows, account registration, holdings-universe workflows, and
stored bars configurations without duplicating the backend business logic. Account forms accept
the Alpaca API key and secret key as write-only password fields; the API validates them with Alpaca
and stores them as Main Sequence Secrets, and the application never displays them again.

## Architecture decisions

- [ADR 0001: Alpaca Agent rail using Command Center AI](adrs/0001-alpaca-agent-command-center-ai-rail.md)
  records the implemented site integration using published SDK and AI components. Engineering ADRs live
  outside the published `/docs/` user guide.

## Local development

Use Node 24 and prepare the sibling Alpaca Connectors checkout's `.venv` and saved Main Sequence
CLI login. The launch reads that checkout's `.env`; authentication stays in the operating-system
credential store. Install site dependencies, then start the complete stack:

```bash
npm ci
npm run dev:stack
```

The VS Code launch **Alpaca: full local stack** and `.claude/launch.json` use the same supervisor.
It starts the site (`http://127.0.0.1:5421`), API (`http://127.0.0.1:8321`), TAU Agent
(`http://127.0.0.1:8787`) and laptop-wide local MetaTables API. An already-running local MetaTables
service is reused, never replaced. MetaTables must report an initialized SQLite runtime; there is
no hosted database fallback and no automatic initialization or migration. For first-time database
setup, follow the backend's `metatables-local-development` skill and apply the ms-markets and
connector migration providers explicitly in local mode.

By default the backend is the sibling `alpacaconnectors-945bfddd-5f1f-4541-a87a-faea3af6271f`.
Set `ALPACA_BACKEND_DIR` to use another prepared checkout. Vite uses Node 24 from the current
executable, the bundled Codex runtime, or Homebrew; `ALPACA_NODE_EXECUTABLE` selects an explicit
Node 24 executable. The VS Code configuration launches the supervisor and attaches to Node
children; it does not set Python breakpoints.

Run `npm run dev:stack:check` to recheck all four services without starting or changing them.
Occupied site/API/Agent ports stop startup instead of replacing another process. Ctrl-C stops
only services owned by this launch, preserving a pre-existing MetaTables service and its database.
Local Agent state is kept in ignored `.local/agent-state/`.

Chat is explicitly local in this launch: `VITE_AGENT_MODE=local` selects the AI SDK's
`createLocalAgentSource()` and the SDK's `localAgentProxy()` forwards same-origin `/__agent__/`
requests to the local runtime. No deployed Agent, Environment UID or platform session is resolved
for local chat. If the runtime is unavailable the rail reports that error; it never falls back.
TAU uses the developer's existing provider login (default `openai-codex / gpt-5.6-luna`), so model
inference still requires network access. Generic shell/platform tools remain disabled. **Alpaca
application tools and MCP-published skills are not yet available in TAU local mode**; this SDK gap
is tracked in [TAU issue #102](https://github.com/mainsequence-sdk/ms-tau-sdk/issues/102). No custom
adapter, skill copy or deployed-service workaround is installed.

`npm run dev` remains the site-only launcher; it does not start the API, Agent or MetaTables.
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
npm run test:launch
npm run build
npm run test:e2e
```

The implementation plan is in `docs/technical/frontend-implementation-plan.md`; the same-artifact
documentation is built beneath `/docs/`. Automatic Static Site deployment, the linked FastAPI
ResourceRelease, and the managed Command Center application icon are declared in
`.mainsequence/workflows/alpaca-connectors-site.yaml` and documented in
`docs/technical/deployment.md`.
