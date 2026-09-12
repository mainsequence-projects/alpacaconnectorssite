# Signals

The ETF Weight Signals application creates and operates scheduled Universe-backed ETF signal Jobs. The default view
is the signal list; select **Create signal** to open the form.

Each configuration selects:

- one active registered Universe;
- one active registered Alpaca account used to resolve Secret names at runtime;
- an interval or calendar schedule; and
- CPU, memory, maximum runtime, and spot preferences.

Each saved configuration owns one dedicated Main Sequence Job. Different Universes therefore have
different Jobs and may use different schedules. A JobRun is execution history and does not store or
override this configuration.

Creating a configuration also idempotently creates the canonical ms-markets `SignalMetadata` row.
The deterministic `signal_uid` is visible in the list immediately; the first weights observation is
still written only when the Job runs. The CodeRepositoryBranch resolves the Organization Environment
internally, so the GUI never asks the user to select or submit one.

For calendar schedules, the form generates the five-field crontab from daily, weekday, weekly, or
monthly controls and shows the exact stored expression before submission. Advanced mode remains
available for numeric five-field expressions using `*`, lists, ranges, and steps. The user selects
an IANA timezone; the browser timezone is the create-form default. Main Sequence evaluates that
local cron clock through daylight-saving transitions. UTC is available explicitly. Abbreviations
and fixed offsets are not accepted.

`universe_uid` defines the stable final signal identity. `account_uid` is serialized runtime
configuration so an automatic run can access Alpaca and register missing components. It does not
change the final signal UID and is not a column or index dimension in `SignalWeightsStorage`.

Use row actions to run immediately, edit, or delete a configuration. Scheduling can be enabled or
disabled from the edit form. Reconciliation is an internal provisioning operation and is not a
user-facing action. Delete removes the dedicated Job and configuration but retains prior signal
observations.

Every successful run extracts the current holdings once, bulk-registers missing Alpaca assets,
bulk-refreshes the linked category, and writes one complete weights observation. The observation
timestamp records when the provider response was seen; it does not guarantee the precise economic
effective time of the ETF weights.

The schedule and the updater configuration are separate. The schedule decides when a JobRun starts.
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
