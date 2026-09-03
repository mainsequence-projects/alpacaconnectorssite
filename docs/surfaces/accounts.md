# Accounts

The Accounts page registers and maintains Alpaca brokerage accounts. The browser never accepts an
Alpaca API key or secret-key value. Instead, the user selects the names of two existing Main
Sequence Secrets: one containing the Alpaca API key and one containing the Alpaca secret key.

Create an account by choosing its paper or live environment, selecting both Secret references,
and giving the registration a readable name. Initial holdings capture is optional. When selected,
the backend can strictly register missing held assets before publishing the first snapshot.

The environment is immutable after registration. Edit changes the account name, Secret bindings,
or active state. Deleting removes the Alpaca registration and deactivates the account while
retaining historical holdings snapshots. Any bars configuration that references the removed
account can no longer run.

The account table uses the API's canonical collection and discovery contracts. Its discovered
actions also expose holdings capture and confirmed registration removal where the backend allows
them.

The Secret-reference catalog returns names only. Secret values remain protected platform runtime
inputs and are resolved by the connector backend only when an Alpaca operation needs them.
