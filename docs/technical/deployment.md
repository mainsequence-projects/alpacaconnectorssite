# Deployment

The application is deployed as a Main Sequence Static Site ResourceRelease from the repository
root. The reviewed declaration is
`.mainsequence/workflows/alpaca-connectors-site.yaml`.

The deployment is configured for Vite on Node.js 24, publishes `dist` with SPA fallback to
`/index.html`, retains three revisions, and automatically redeploys every synchronized commit.

Production API requests are delegated by the Command Center SDK to FastAPI ResourceRelease
`0705a0b6-ec48-443b-835e-6c597a6b18f2`. The workflow provides that public UID through
`VITE_FASTAPI_RESOURCE_RELEASE_UID`; the platform injects the reserved Command Center origin.
No credential is included in the browser build.

The same workflow owns the enabled **Alpaca Connectors** Command Center link for the deployment
operator. Its repository-backed monochrome mask is read from
`public/alpaca-navigation-logo.png` at the exact pushed commit through
`navigation_link.icon_mask_path`, with `app-window` retained as the required loading and error
fallback.

Use the Command Center SDK sync command for releases so the npm version, commit, backend-owned
tag, and Git push remain one atomic operation:

```bash
npx command-center-sdk code-repository sync -m "Describe the release" --path . --dry-run
npx command-center-sdk code-repository sync -m "Describe the release" --path .
```

Deployment is complete only after the workflow result succeeds, the Static Site release has a
ready active revision, and the deployed application can call the configured FastAPI release.
