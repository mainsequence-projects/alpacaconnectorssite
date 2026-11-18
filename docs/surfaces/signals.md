# Signals

The **Signals** application, in the **Portfolios** navigation group, shows the one kind of signal
the connector makes (connector ADR 0028). A signal belongs to one account. Its key is the
application's own, unique within the account; the account owner's application creates the signal
and publishes its weights through the Alpaca Connectors API, and any of the account's portfolios can
follow it. The site never creates a signal or enters weights.

The list shows each signal's name, its application key, its account, how many portfolios follow it,
and when it last changed. The **Account** filter narrows it to one account's signals.

Select a row to open the signal. Its detail shows the account, the application key, when the
latest weights were published, the number of assets, and two tables:

- **Latest weights**: up to the latest five observations, newest first, one row per asset, read from
  `GET /v1/signal-definitions/{uid}/weights?limit=5`. A dash marks an asset that was not part of an
  observation.
- **Portfolios that follow it**, with their scheduled-run state and latest run.

Like every detail page, it shows names rather than internal UIDs.

## Renaming and deleting

Both are the account owner's; the connector refuses anyone else, and the page shows its message.

**Rename** changes the name and description and sends only the fields that changed
(`PATCH /v1/signal-definitions/{uid}`). The application key never changes.

Deleting the last portfolio that follows a signal deletes the signal with it. **Delete** here is for
a signal no portfolio follows, such as one no portfolio ever followed; the connector refuses it with
`409 signal_followed` otherwise. Type `DELETE` to delete the signal and its published weights. When
a retired portfolio still follows the signal, its weights stay as that portfolio's record, and the
result says so. Deleting the account deletes all of its signals
([Accounts](accounts.md#removing-keys-and-deleting-an-account)).
