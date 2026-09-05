# Accounts

The Accounts page registers and maintains Alpaca brokerage accounts. The browser never accepts an
Alpaca API key or secret-key value. Instead, the user selects the names of two existing Main
Sequence Secrets: one containing the Alpaca API key and one containing the Alpaca secret key.

The page initially shows the account collection without an open form. Select **Register account**
from the collection header to open the registration form; **Cancel** returns to the collection.
Create an account by choosing its paper or live environment, selecting both Secret references,
and giving the registration a readable name. A successful registration closes the form and
refreshes the collection. Before creating the Account, the backend resolves
every non-zero position against Alpaca's Asset catalog and registers any missing asset. It always
creates the initial holdings snapshot in the same registration flow. OpenFIGI details are optional
enrichment. A missing Alpaca identity fails registration before an Account or holdings snapshot is
written; this rule cannot be disabled. The backend idempotently ensures the shared ms-markets `USD`
currency Asset before publishing cash holdings. Crypto pairs resolve by symbol because Alpaca's
position UUID can differ from its canonical Asset catalog UUID.

The environment is immutable after registration. Edit changes the account name, Secret bindings,
or active state. Deleting removes the Alpaca registration and deactivates the account while
retaining historical holdings snapshots. Any bars configuration that references the removed
account can no longer run.

The account table uses the API's canonical collection and discovery contracts. Its discovered
actions also expose holdings capture and confirmed registration removal where the backend allows
them.

Selecting an account row opens that account's detail view. Only then does the application query
`/v1/accounts/{account_uid}/holdings/latest`; the account collection never preloads holdings
for every account. The embedded list is scoped to the newest immutable holdings snapshot and can
be refreshed independently.

The Secret-reference catalog returns names only. Secret values remain protected platform runtime
inputs and are resolved by the connector backend only when an Alpaca operation needs them.
