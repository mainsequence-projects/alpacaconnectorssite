# Bars

The Bars page manages the Alpaca stock-bar configurations. Creating one stores a definition; it
does not resolve assets, capture holdings, or publish bars.

A bars configuration has exactly one parent (connector ADR 0028):

- a **bars feed** belongs to one account, runs with that account's keys, and is deleted with it.
  A feed can't run with another owner's account; an account without an owner stays open; or
- a **portfolio's own** bars configuration belongs to its portfolio. The application creates it
  with the portfolio, it prices every asset the portfolio's signal has published with the
  portfolio's account's keys, and it is deleted only with its portfolio.

Every migrated bars profile writes one shared price table, keyed by time and asset with no account:
a configuration only chooses which assets that profile prices. The list's **Account** and
**Portfolio** columns show each configuration's parent, and the **Belongs to** filter narrows the
list to the bars feeds of accounts or to the portfolios' own (the API's `portfolio_owned`).

## Bars feeds

The form creates bars feeds. Every feed requires:

- a name and a registered Alpaca account;
- exactly one of the feed sources: latest account holdings, or explicit registered Asset UIDs;
- one migrated `frequency/feed/adjustment` profile;
- an enabled or disabled status; and
- whether the daily bars update includes it (**Include in the daily bars update**); a feed left out
  still runs on demand while enabled.

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
holdings separately when a newer snapshot is required. For **Explicit assets**, enter Main Sequence
Asset UIDs separated by commas, spaces, or lines.

The create body, also sent whole by a feed's **Save changes**, has exactly the connector's fields,
with `asset_uids` empty for latest account holdings:

```json
{
  "name": "Daily explicit assets",
  "description": null,
  "enabled": true,
  "scheduled": false,
  "account_uid": "<account uid>",
  "asset_source": "assets",
  "asset_uids": ["<asset uid>", "<asset uid>"],
  "frequency_id": "1d",
  "feed": "sip",
  "adjustment": "all"
}
```

The API validates the selected account, assets, and migrated profile when the feed is saved.
Deleting a feed removes only its stored definition; the bars it published stay in the shared table.

## A portfolio's own bars configuration

**Edit** on a portfolio's own configuration shows the portfolio it belongs to and its asset source
read-only, and changes only its name, description, status, daily update, and profile; the request
never sends an account or an asset source. **Delete** is not offered: the configuration goes with
its portfolio. Only the portfolio's owner, its account's owner, changes it.

A portfolio not yet adopted still names a `portfolios` feed of an account, shown with the source
**Assets of the portfolios that name it**; it prices those portfolios, as before accounts owned
portfolios. **Edit** keeps its source read-only and sends none, so it stays a `portfolios` feed.
**Delete** is refused while portfolios name it, and the dialog shows the connector's message. The
connector also still accepts new `portfolios` feeds; the form doesn't offer them, since every new
portfolio prices itself with its own configuration.

The table is backed by the canonical collection and discovery endpoints, whose discovery declares
its columns and filters.
