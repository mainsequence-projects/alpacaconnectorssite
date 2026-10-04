# Signals

The ETF Weight Signals application creates and operates scheduled Universe-backed ETF signals. The default view
is the signal list; select **Create signal** to open the form.

Each configuration selects:

- one active registered Universe;
- one active registered Alpaca account whose credential Secrets are resolved at runtime; and
- whether the shared signal Job's daily scheduled run includes it (**Include in the shared signal
  Job's daily scheduled run**, on by default).

## Scheduled runs

The connector runs every signal on one shared signal Job, `Alpaca ETF Signal`. Its workflow file
declares that Job together with its daily schedule (00:30 UTC) and its compute, so the form has no
schedule or compute fields; the connector rejects a request that still sends them. A configuration
only chooses whether the scheduled run includes it.

The details page shows the shared Job's schedule read-only, and whether the signal is included.
**Pause** leaves the signal out of the scheduled run and **Resume** includes it again; both call the
signal's pause and resume actions. **Run now** starts one run at any time, paused or not. Until a
push of the connector has created the Job on the branch, the signal's state is `provisioning` and
the details page reports that the Job is not deployed yet. A JobRun is execution history and does
not store or override the configuration.

Creating a configuration also idempotently creates the canonical ms-markets `SignalMetadata` row.
The deterministic `signal_uid` is visible in the list immediately; the first weights observation is
still written only when a run publishes it. The CodeRepositoryBranch resolves the Organization Environment
internally, so the GUI never asks the user to select or submit one.

`universe_uid` defines the stable final signal identity. `account_uid` is serialized runtime
configuration so an automatic run can access Alpaca and register missing components. It does not
change the final signal UID and is not a column or index dimension in `SignalWeightsStorage`.

Use row actions to run immediately, edit, or delete a configuration. The scheduled-run checkbox is
also in the edit form. Reconciliation is an internal operation and is not a user-facing action.
Delete removes only the configuration; prior signal observations and the shared Job's past runs
remain.

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
