# Accounts

The Accounts page registers and maintains Alpaca brokerage accounts. You enter the account's Alpaca
API key and secret key directly in the form; you do not need to create anything in Command Center
first. The keys are sent to the Alpaca Connectors API over the authenticated connection. The API
checks them with Alpaca and stores them encrypted on the account's own row, under a key only the
connector's workloads can read (connector ADR 0017). The application never displays the keys
again.

The page initially shows the account collection without an open form. Select **Register account**
from the collection header to open the registration form; **Cancel** returns to the collection.
Create an account by giving the registration a readable name, choosing its paper or live
environment, and entering the **API key** and **Secret key**. Both keys are required and must be
different. The key fields are password fields with autocomplete turned off.

Registration takes two steps:

1. Select **Review registration**. The API checks the keys with Alpaca in a read-only dry run that
   writes nothing. The review shows the Alpaca account identifier, account number, status,
   environment, equity and cash, the number of holdings rows the initial snapshot would write,
   unresolved symbols, Alpaca assets that would be registered and cash assets that would be
   ensured, and reminds you that the keys are stored encrypted only when the account is
   registered.
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

## Requests from the Alpaca Agent

To talk to the Alpaca Agent from any page, select **Ask Alpaca Agent** at the bottom right. The
conversation opens beside the page and keeps your place; it appears only when the Agent is available
in this Environment.

The Alpaca Agent never receives your keys. When you ask it to register an account or replace an
account's keys, it starts a request for you and gives you the link to this application. The
Accounts page then shows **Requested by your Alpaca Agent** with your own pending requests, each
with what it is for and when it expires (one hour after the Agent started it).

Select **Enter keys** to open the matching form. A registration request fixes the environment and
fills in the account name; a key replacement opens that account's edit form and requires both new
keys. Review and register, or save, as usual: the keys go only to the API, which completes the
request, and the Agent can then continue in the conversation. **Dismiss** cancels a request you do
not want. Only you can see or complete your requests, and nothing about a request is read from the
address bar.

## Editing and rotating credentials

The environment is immutable after registration. **Edit** changes the account name or active state
and sends only the fields that changed; those changes never send or check credentials, so they
work even when the stored keys no longer authenticate. **Save changes** stays disabled until
something differs from the stored registration.

The **Rotate credentials** section of the edit form replaces the stored keys. Leave both fields
empty to keep the current credentials. To rotate, enter both the new API key and the new secret
key; the API checks that they authenticate as the same Alpaca account and then replaces the
stored keys. An account registered before keys were stored encrypted, whose keys still live in
Main Sequence Secrets, switches to encrypted storage when rotated; the Secrets it was imported
from are left unchanged. The fields are cleared after saving or cancelling.

After the owner removed an account's keys, the section says so: entering both new keys stores them
again, and the account's portfolios and bars feeds run with them.

## Detail view

Selecting an account row opens that account's detail view. It shows how the credentials were
provided (**Stored by this application** for keys entered here, **Imported from Main Sequence
Secrets** for keys the connector copied once from Secrets named through its CLI or Agent), whether
the keys are **Stored encrypted**, **Removed** by the owner, or still **Awaiting migration**, and
when the credentials were last updated; the account list's **Keys** column shows the same state. It
never shows key values or Secret names. Only after the row is selected does the application query
`/v1/accounts/{account_uid}/holdings/latest`; the account collection never preloads holdings
for every account. The embedded list is scoped to the newest immutable holdings snapshot and can
be refreshed independently.

## Removing keys and deleting an account

An account owns its portfolios, its signals and its bars feeds (connector ADR 0028). Removing its
keys and deleting it are two separate actions in the row's **Actions** menu, and both are the
account owner's: the connector refuses anyone else, and the dialog shows its message, **This Alpaca
account is registered to another owner.**

**Remove keys** clears the stored keys after you type `REMOVE`
(`POST /v1/accounts/{account_uid}/actions/remove-keys`). The owner, the account, its history, its
portfolios, signals and bars feeds stay, and nothing is disabled: runs on the account fail until its
owner enters keys again with **Edit**. The row then shows **Removed** keys and no longer offers the
action. Main Sequence Secrets the keys were imported from are kept; for an account registered
before encrypted storage and not yet migrated, the Secrets this application created for it are
deleted, and the result names them. To remove the keys of several accounts at once, select their
rows and choose **Remove keys** from the selection's **Actions**: the connector's bulk action, which
checks the selection with its preflight first.

**Delete** deletes the account and everything that belongs to it. The dialog first runs the
connector's delete preflight (`POST /v1/accounts/{account_uid}/actions/delete/preflight`), which
changes nothing, and lists what would go: the account's portfolios, each retired and then deleted
unless another account's history names it; its signals with their published weights; its bars
feeds (the shared price tables keep their bars); the retired portfolios it recorded; and its
holdings, orders, trades and targets. When the preflight reports a blocker, such as another
account's current target holding one of the account's portfolios, the dialog shows it, never names
the other account, and offers no confirmation: nothing is deleted until that account's owner changes
its target. Otherwise type `DELETE` and select **Delete account**; the site sends the connector's
exact confirmation, `DELETE /v1/accounts/{account_uid}?confirm=DELETE%20<account_uid>`. The result
says how many portfolios ended and signals went, and which retired portfolios stay because another
account's history names them. Deleting cannot be undone: registering the account again starts it
with no history. Use **Remove keys** to keep the account.

The account table uses the API's canonical collection and discovery contracts; its columns and its
bulk actions, capture holdings and remove keys, come from the connector's discovery.
