# Universes

The Universes page separates universe creation from universe execution.

The **Create universe** form requires a name, ETF ticker, and explicit holdings source URL. Its
placeholders use iShares IVV only as an example; they are not inferred or submitted values.
Creation stores the source configuration and creates an empty registered universe with a stable UID
and zero assets. It does not extract holdings or synchronize memberships.

After creation, right-click the registered row and choose **Run**. The backend-discovered action
first extracts and validates the source in preflight. Execution proceeds only when every component
resolves to exactly one registered Main Sequence asset, then replaces the universe memberships and
refreshes the table. If preflight reports missing assets, use Assets to register them and run the
universe again.

## Registered universes

The table is backed by `GET /v1/universes` and its Command Center discovery contract. It supports
server search, ordering, pagination, refresh, selection, and the actions authorized by discovery.

Right-click a row—or use its visible Actions controls—to:

- **Run** the universe's explicit source through preflight and then synchronize memberships.
- **Activate** an inactive universe.
- **Deactivate** an active universe. Inactive universes remain registered and visible, but cannot
  be selected for new market-data updates.
- **Delete** the category and its memberships after preflight and explicit confirmation. Deletion
  does not remove its assets or its durable `UniverseSource`.

Existing materialized universes with no lifecycle metadata are treated as active.
