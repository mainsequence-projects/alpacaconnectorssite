# Bars

The Bars page manages reusable Alpaca stock-bar configurations. Creating a configuration stores a
definition; it does not resolve assets, capture holdings, or publish bars.

Every configuration requires:

- a name and registered Alpaca account;
- exactly one of the connector's three asset sources: latest account holdings, explicit registered
  Asset UIDs, or the assets of the live portfolios that use the configuration's prices;
- one migrated `frequency/feed/adjustment` profile; and
- an enabled or disabled status.

The profile picker describes every dimension rather than exposing only its storage key. The
currently migrated profiles are:

- **Daily · IEX · Raw (unadjusted)** (`1d/iex/raw`): one-day bars from the IEX exchange feed,
  without corporate-action adjustment.
- **Daily · SIP · Adjusted (all corporate actions)** (`1d/sip/all`): one-day bars from the
  consolidated SIP feed, adjusted for all corporate actions.

`all` is the adjusted profile; it is not a missing fourth field. Other adjustment modes supported
by Alpaca are not selectable until their exact `frequency/feed/adjustment` storage profile has
been migrated.

For **Latest account holdings**, resolution uses the newest persisted holdings snapshot in the
inclusive trailing 30-day window. It does not capture a fresh snapshot as a side effect. Capture
holdings separately when a newer snapshot is required.

For **Explicit assets**, enter Main Sequence Asset UIDs separated by commas, spaces, or lines. For
**Portfolio assets**, the update resolves every asset of the live portfolios that use the
configuration's prices, the portfolios whose valuation source it is, when it runs; the form takes
no asset list. The create and edit bodies send exactly the connector's fields, with `asset_uids`
empty for every source but explicit assets. The API validates the selected account, assets, and
migrated profile when the configuration is saved.

The table is backed by the canonical collection and discovery endpoints. Use its row actions to
edit or delete a configuration. Deleting a configuration removes only the stored definition; it
does not delete bars that were already published.
