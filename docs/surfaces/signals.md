# Signals

The ETF Weight Signals application operates the remaining scheduled Universe-backed ETF signals.
ETF signals are being retired: the connector keeps only portfolios built from weights an
application provides, so it no longer creates signal configurations, and the page has no create or
edit form. The default view is the signal list; the remaining signals stay available until each
Environment has been drained of them.

Each configuration was created with one registered Universe, one registered Alpaca account used at
runtime, and whether the shared signal Job's daily scheduled run includes it.

## Scheduled runs

The connector runs every signal on one shared signal Job, `Alpaca ETF Signal`. Its workflow file
declares that Job together with its daily schedule (00:30 UTC) and its compute. A configuration only
chooses whether the scheduled run includes it.

The details page shows the shared Job's schedule read-only, and whether the signal is included.
**Pause** leaves the signal out of the scheduled run and **Resume** includes it again; both call the
signal's pause and resume actions. **Run now** starts one run at any time, paused or not. Until a
push of the connector has created the Job on the branch, the signal's state is `provisioning` and
the details page reports that the Job is not deployed yet. A JobRun is execution history and does
not store or override the configuration.

The list shows each configuration's deterministic `signal_uid`. The CodeRepositoryBranch resolves
the Organization Environment internally, so the GUI never asks the user to select or submit one.

`universe_uid` defines the stable final signal identity. `account_uid` is serialized runtime
configuration so an automatic run can access Alpaca and register missing components. It does not
change the final signal UID and is not a column or index dimension in `SignalWeightsStorage`.

Use row actions to run immediately or delete a configuration. Reconciliation is an internal
operation and is not a user-facing action. Delete removes only the configuration; prior signal
observations and the shared Job's past runs remain.

Every successful run extracts the current holdings once, bulk-registers missing Alpaca assets,
bulk-refreshes the linked category, and writes one complete weights observation. The observation
timestamp records when the provider response was seen; it does not guarantee the precise economic
effective time of the ETF weights.

The shared Job's schedule and the updater configuration are separate. The schedule decides when a
JobRun starts.
The updater receives `universe_uid` plus the runtime `account_uid`; every JobRun forces the updater
to publish the current observation even if the extracted weights match the previous run. That force
behavior is part of this producer's invariant, not an editable user option. Debug, retry, batching,
and dependency-tree controls are runtime concerns and are not added to the signal's hashed business
configuration.

## Signal observations

Select a signal in the list to query its latest 100 distinct observations from the canonical
ms-markets `SignalWeightsStorage` table. The detail view performs this query only when the signal is
opened; the list does not prefetch observations for every signal.

The result is transposed for inspection: observation timestamps are rows and Assets are columns.
Weights are displayed as percentages. Because each successful update publishes a complete frame,
an Asset missing from one complete observation is displayed as 0%. An explicit stored null remains
unavailable instead of being converted to zero.

These timestamps record when extraction observed the holdings. They do not guarantee the exact
economic effective time of the ETF weights.
