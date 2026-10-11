# Deployment

The application is deployed as a Main Sequence static site from the repository root. The reviewed
declaration is `.mainsequence/workflows/alpaca-connectors-site.yaml`: workflow `api_version`
`2.3.0` with one `kind: static_site` resource, key `alpaca-connectors-site`. Until 2026-10-11 the
same file and key used the legacy 2.2.0 form (`kind: resource_release` with
`release_kind: static_site`). The platform identifies the site by its file and key, so keeping both
keeps the site's UID, URL, and Command Center link. The Alpaca Agent hands people that link to enter
account keys, so neither may change.

The deployment is configured for Vite on Node.js 24, publishes `dist` with SPA fallback to
`/index.html`, retains three revisions, and automatically redeploys every pushed commit.

Production API requests are delegated by the Command Center SDK to the connector's FastAPI
ResourceRelease, the `alpaca` resource of the `alpaca-connectors` repository. The workflow names it
by repository and key in `build_environment`, and the platform resolves its public UID into
`VITE_FASTAPI_RESOURCE_RELEASE_UID` at every build; when the connector recreates that release, the
platform rebuilds this site. The platform injects the reserved Command Center origin.
No credential is included in the browser build, and neither is the Alpaca Agent: the site reads the
Agent and its Environment from the API when the page loads ([Architecture](architecture.md)), so a
re-created Agent needs no site rebuild.

The same workflow owns the enabled **Alpaca Connectors** Command Center link for the deployment
operator. Its repository-backed monochrome mask is read from
`public/alpaca-navigation-logo.png` at the exact pushed commit through
`navigation_link.icon_mask_path`, with `line-chart` retained as the required loading and error
fallback.

Publishing is a plain `git push` of reviewed commits; the push runs the workflow above. Since
Command Center SDK 0.5.13, `npx command-center-sdk code-repository sync --path .` only refreshes
`package-lock.json` and installs it. It does not version, commit, tag, push, or deploy, and it has no
`--dry-run`.

Deployment is complete only after the workflow result succeeds, the Static Site release has a
ready active revision with the same release UID and Command Center link as before, and the deployed
application can call the configured FastAPI release.
