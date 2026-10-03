# Accounts

The Accounts page registers and maintains Alpaca brokerage accounts. You enter the account's Alpaca
API key and secret key directly in the form; you do not need to create anything in Command Center
first. The keys are sent to the Alpaca Connectors API over the authenticated connection. The API
checks them with Alpaca and stores them as two Main Sequence Secrets that it creates and owns. The
application never displays the keys again.

The page initially shows the account collection without an open form. Select **Register account**
from the collection header to open the registration form; **Cancel** returns to the collection.
Create an account by giving the registration a readable name, choosing its paper or live
environment, and entering the **API key** and **Secret key**. Both keys are required and must be
different. The key fields are password fields with autocomplete turned off.

Registration takes two steps:

1. Select **Review registration**. The API checks the keys with Alpaca in a read-only dry run that
   writes nothing, including no Secrets. The review shows the Alpaca account identifier, account
   number, status, environment, equity and cash, the number of holdings rows the initial snapshot
   would write, unresolved symbols, Alpaca assets that would be registered, cash assets that would
   be ensured, and the names of the two Main Sequence Secrets that would be created or updated.
2. Select **Register account** to confirm. It is available only while the review matches the
   current inputs and reports no unresolved symbols, because an unresolved holding fails
   registration. Changing any field, including either key, hides the review and requires a new one.

If Alpaca rejects the keys, the form says so and no review is shown. Check that both keys are
correct and were issued for the selected paper or live environment.

A successful registration closes the form, clears the entered keys, and refreshes the collection.
**Cancel** also clears them. The keys exist only in the open form: they are never written to the
address bar, browser storage, or saved page state. Before creating the
Account, the backend resolves
every non-zero position against Alpaca's Asset catalog and registers any missing asset. It always
creates the initial holdings snapshot in the same registration flow. OpenFIGI details are optional
enrichment. A missing Alpaca identity fails registration before an Account or holdings snapshot is
written; this rule cannot be disabled. The backend idempotently ensures the shared ms-markets `USD`
currency Asset before publishing cash holdings. Crypto pairs resolve by symbol because Alpaca's
position UUID can differ from its canonical Asset catalog UUID.

## Editing and rotating credentials

The environment is immutable after registration. **Edit** changes the account name or active state
and sends only the fields that changed; those changes never send or check credentials, so they
work even when the stored keys no longer authenticate. **Save changes** stays disabled until
something differs from the stored registration.

The **Rotate credentials** section of the edit form replaces the stored keys. Leave both fields
empty to keep the current credentials. To rotate, enter both the new API key and the new secret
key; the API checks that they authenticate as the same Alpaca account and then overwrites the
stored Secret values. An account registered earlier with external Main Sequence Secrets switches to
Secrets owned by this application, and its external Secrets are left unchanged. The fields are
cleared after saving or cancelling.

## Detail view

Selecting an account row opens that account's detail view. It shows where the credentials are
stored (**Stored by this application** or **External Main Sequence Secrets**), the names of the
API key and secret key Secrets, and when the credentials were last updated. It never shows key
values. Only after the row is selected does the application query
`/v1/accounts/{account_uid}/holdings/latest`; the account collection never preloads holdings
for every account. The embedded list is scoped to the newest immutable holdings snapshot and can
be refreshed independently.

## Removing an account

Deleting removes the Alpaca registration and deactivates the account while retaining historical
holdings snapshots. For an account whose credentials are stored by this application, removal also
deletes those two Main Sequence Secrets, and the confirmation dialog says so; registering the
account again requires its keys. External Main Sequence Secrets are never deleted. Any bars
configuration that references the removed account can no longer run.

The account table uses the API's canonical collection and discovery contracts. Its discovered
actions also expose holdings capture and confirmed registration removal where the backend allows
them.
