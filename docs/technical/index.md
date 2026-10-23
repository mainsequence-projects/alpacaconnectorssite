# Technical documentation

Start with the [frontend implementation plan](frontend-implementation-plan.md), then use the
[architecture](architecture.md) and [testing](testing.md) pages when maintaining the application.

The root Vite build and the Docusaurus documentation build are combined in `dist/`. Application
routes are rooted at `/`; documentation routes are rooted at `/docs/`.

## Local Django backend

The developer CLI and API use `MAINSEQUENCE_ENDPOINT=http://local-backend:8000`
for the shared Django development proxy. Keep this setting in the ignored `.env`.
Map `local-backend` to the machine serving the Django stack, using that stack's
`maintenance/switch_local_backend.py` after moving it. Restart local clients
after a switch and sign in to this backend when the CLI requests it.

The site's direct Alpaca API, local Agent and MetaTables keep their separate
loopback addresses. Production delegated transport and authentication stay
unchanged. Never put platform tokens in browser configuration.
