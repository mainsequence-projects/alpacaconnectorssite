# Bars

The Bars page manages reusable Alpaca stock-bar configurations. Creating a configuration stores a
definition; it does not resolve assets, capture holdings, or publish bars.

Every configuration requires:

- a name and registered Alpaca account;
- exactly one asset source: latest account holdings, an active registered universe, or explicit
  registered Asset UIDs;
- one migrated `frequency/feed/adjustment` profile; and
- an enabled or disabled status.

For **Latest account holdings**, resolution uses the newest persisted holdings snapshot in the
inclusive trailing 30-day window. It does not capture a fresh snapshot as a side effect. Capture
holdings separately when a newer snapshot is required.

For **Registered universe**, the form lists active universes. For **Explicit assets**, enter Main
Sequence Asset UIDs separated by commas, spaces, or lines. The API validates the selected account,
universe, assets, and migrated profile when the configuration is saved.

The table is backed by the canonical collection and discovery endpoints. Use its row actions to
edit or delete a configuration. Deleting a configuration removes only the stored definition; it
does not delete bars that were already published.
