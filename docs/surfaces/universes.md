# Universes

The Universes page lists, runs, and deletes the registered ETF holdings universes. Universes are
being retired: the connector keeps only portfolios built from weights an application provides, so
it no longer creates universes or their holdings sources, and the page has no creation form. The
registered universes stay available until each Environment has been drained of them.

Right-click a registered row and choose **Extract components**, then select the Alpaca account
for that execution. The account is not assigned to the Universe. Preflight follows the registered
`source_uid` and extracts current ETF constituents and weights. Missing Main Sequence assets are
planned as work, not reported as blockers. Execution uses the selected account to register every
resolvable Alpaca constituent, then replaces the linked category
membership only after the complete constituent set is available. A constituent that Alpaca cannot
resolve remains a real blocker and leaves the category membership unchanged.

## Registered universes

The table is backed by `GET /v1/universes` and its Command Center discovery contract. It supports
server search, ordering, pagination, refresh, selection, and the actions authorized by discovery.

Clicking a row opens its detail and fetches that one Universe only. The detail shows the explicit
linked Asset Category and renders its members with the same Asset list component used on the
Assets page. That member list is fetched on click from
`GET /v1/universes/{universe_uid}/assets`; it is not fetched for every Universe in the collection.

The linked category stores Asset membership only. Universe Run publishes the extracted weights
through canonical signal storage, but those signal rows are not shown as category-membership
weights on the Universe detail page.

Right-click a row—or use its visible Actions controls—to:

- **Extract components** from the universe's explicit ETF source, selecting an Alpaca account only for that execution,
  then register missing assets and refresh membership.
- **Activate** an inactive universe.
- **Deactivate** an active universe. Inactive universes remain registered and visible, but cannot
  be selected for new market-data updates.
- **Delete** the Universe, linked category, and memberships after preflight and explicit
  confirmation. Deletion does not remove its assets or its separately managed `UniverseSource`.

`AssetUniverse.is_active` is the lifecycle state. No source identity or active flag is read from
`AssetCategory.metadata_json`, and the application performs no provider, URL, source, or category
inference. `AssetUniverse` never stores or infers an Alpaca account.
