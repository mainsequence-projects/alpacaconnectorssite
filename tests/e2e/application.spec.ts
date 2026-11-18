import { expect, test, type APIRequestContext, type Locator, type Page, type Request } from "@playwright/test";
import { assertCommandCenterPageLayout } from "@dev-mainsequence/command-center-sdk/layout/testing";

test("opens Assets in the SDK navigation shell and conforms at Command Center viewports", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Register Alpaca-backed assets" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registered Alpaca assets" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Alpaca Asset ID" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "FIGI (optional)" })).toBeVisible();
  const navigation = page.locator('[data-app-navigation-panel]');
  await expect(navigation).toHaveCount(1);
  await expect(page.locator('[data-cc-navigation-rail]')).toHaveCount(0);
  await expect(page.getByText("Applications", { exact: true })).toHaveCount(0);
  await expect(navigation.getByText("Alpaca Connectors", { exact: true })).toBeVisible();
  const alpacaLogo = navigation.locator(".alpaca-navigation-logo");
  await expect(alpacaLogo).toBeVisible();
  await expect(alpacaLogo).toHaveCSS("background-color", /rgb\(/);
  expect(await alpacaLogo.evaluate((element) => getComputedStyle(element).maskImage)).toContain(
    "alpaca-navigation-logo.png",
  );
  await expect(page.getByText("Capabilities", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Assets/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Accounts/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Bars/ })).toBeVisible();
  await expect(navigation.getByText("Portfolios", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^Signals/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Rebalance Configurations/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Portfolios/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Documentation/ })).toBeVisible();
  // Those seven destinations and no other.
  await expect(navigation.getByRole("link")).toHaveCount(7);
  await assertCommandCenterPageLayout(page);
});

test("calls only the connector routes its pages use", async ({ page }) => {
  const apiPaths = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/v1/")) apiPaths.add(url.pathname);
  });

  for (const [path, row] of [
    ["/", /AAPL/],
    ["/accounts", /Paper account/],
    ["/bars", /Daily paper holdings/],
    ["/signals", /Momentum/],
    ["/rebalance-configurations", /NYSE close/],
    ["/portfolios", /Daily momentum portfolio/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("row", { name: row }).first()).toBeVisible();
  }
  await page.getByRole("row", { name: /Daily momentum portfolio/ }).getByText("Daily momentum portfolio", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Historical performance" })).toBeVisible();

  const routes = [
    "/v1/project-state/configuration",
    "/v1/assets",
    "/v1/accounts",
    "/v1/market-data/bar-configurations",
    "/v1/signal-definitions",
    "/v1/portfolio-rebalance-configurations",
    "/v1/portfolio-configurations",
  ];
  expect(apiPaths.size).toBeGreaterThan(routes.length);
  for (const path of apiPaths) {
    expect(routes.some((route) => path === route || path.startsWith(`${route}/`)), path).toBe(true);
  }
});

const E2E_API_ORIGIN = "http://127.0.0.1:4274";
// Synthetic values for the e2e fixture API only.
const LIVE_API_KEY = "AKE2ELIVEAPIKEY000001";
const LIVE_SECRET_KEY = "e2eLiveSecretKeyValue000000000000000001";
const ROTATED_API_KEY = "AKE2EROTATEDAPIKEY0002";
const ROTATED_SECRET_KEY = "e2eRotatedSecretKeyValue00000000000002";

function trackAccountTraffic(page: Page) {
  const requestUrls: string[] = [];
  const accountWrites: Array<{ method: string; path: string; body: unknown }> = [];
  page.on("request", (request) => {
    requestUrls.push(request.url());
    const url = new URL(request.url());
    if (url.pathname.startsWith("/v1/accounts") && ["POST", "PATCH"].includes(request.method())) {
      accountWrites.push({ method: request.method(), path: url.pathname, body: request.postDataJSON() });
    }
  });
  return { requestUrls, accountWrites };
}

/** An account row's actions sit in its Actions menu: it has more than two. */
async function chooseRowAction(page: Page, row: Locator, action: string) {
  await row.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: action, exact: true }).click();
}

async function createAccount(request: APIRequestContext, name: string, suffix: string) {
  const response = await request.post(`${E2E_API_ORIGIN}/v1/accounts`, {
    data: {
      account_name: name,
      environment: "paper",
      credentials: { source: "managed", api_key: `AKE2E${suffix}KEY`, secret_key: `e2e${suffix}SecretKey` },
    },
  });
  expect(response.status()).toBe(201);
  return await response.json() as { uid: string; unique_identifier: string };
}

function expectNoCredentialLeak(requestUrls: string[], values: string[]) {
  expect(requestUrls.filter((url) => url.includes("/secret-references"))).toEqual([]);
  for (const value of values) {
    expect(requestUrls.filter((url) => url.includes(value))).toEqual([]);
  }
}

test("registers an account from Alpaca keys after a preflight review", async ({ page }) => {
  const { requestUrls, accountWrites } = trackAccountTraffic(page);
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { level: 1, name: "Alpaca account registrations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Register account" })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Paper account/ })).toBeVisible();
  const registerAction = page.getByRole("button", { name: "Register account", exact: true });
  await expect(registerAction).toHaveCount(1);
  await registerAction.click();

  const form = page.locator("form.workflow-form");
  const accountNameInput = form.getByLabel("Account name");
  const apiKeyInput = form.getByLabel("API key", { exact: true });
  const secretKeyInput = form.getByLabel("Secret key", { exact: true });
  const reviewAction = form.getByRole("button", { name: "Review registration" });
  const confirmRegistration = form.getByRole("button", { name: "Register account" });
  const review = form.getByRole("region", { name: "Registration review" });
  await expect(page.getByRole("heading", { name: "Register account" })).toBeVisible();
  await expect(page.getByText("Registration resolves every non-zero holding")).toBeVisible();
  await expect(page.getByText("this application never displays them again")).toBeVisible();
  await expect(form.getByRole("button", { name: /Secret$/ })).toHaveCount(0);
  for (const input of [apiKeyInput, secretKeyInput]) {
    await expect(input).toHaveAttribute("type", "password");
    await expect(input).toHaveAttribute("autocomplete", "off");
    await expect(input).toHaveAttribute("spellcheck", "false");
  }

  await accountNameInput.fill("Abandoned registration");
  await apiKeyInput.fill(LIVE_API_KEY);
  await secretKeyInput.fill(LIVE_SECRET_KEY);
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Register account" })).toHaveCount(0);
  await registerAction.click();
  await expect(accountNameInput).toHaveValue("");
  await expect(apiKeyInput).toHaveValue("");
  await expect(secretKeyInput).toHaveValue("");

  await accountNameInput.fill("Live operations");
  await form.getByLabel("Environment").selectOption("live");
  await apiKeyInput.fill(LIVE_API_KEY);
  await secretKeyInput.fill(LIVE_API_KEY);
  await expect(form.getByText("The API key and the secret key must be different values.")).toBeVisible();
  await expect(reviewAction).toBeDisabled();
  await secretKeyInput.fill(` ${LIVE_SECRET_KEY} `);
  await expect(confirmRegistration).toBeDisabled();
  await reviewAction.click();

  const registrationBody = {
    account_name: "Live operations",
    environment: "live",
    credentials: { source: "managed", api_key: LIVE_API_KEY, secret_key: LIVE_SECRET_KEY },
  };
  await expect(review).toBeVisible();
  await expect(review.getByText("Ready", { exact: true })).toBeVisible();
  await expect(review).toContainText(/ACCOUNT-\d+__ALPACA_LIVE/);
  await expect(review).toContainText("PA0000000002");
  await expect(review.getByText("Live", { exact: true })).toBeVisible();
  await expect(review.getByText("22222222-2222-4222-8222-222222222222", { exact: true })).toBeVisible();
  await expect(review.getByText("USD", { exact: true })).toBeVisible();
  await expect(review.getByText("Key storage", { exact: true })).toBeVisible();
  await expect(review.getByText(/ALPACA_CONNECTORS__/)).toHaveCount(0);
  await expect(confirmRegistration).toBeEnabled();
  expect(accountWrites).toEqual([
    { method: "POST", path: "/v1/accounts/registration/preflight", body: registrationBody },
  ]);

  await secretKeyInput.fill(`${LIVE_SECRET_KEY}9`);
  await expect(review).toHaveCount(0);
  await expect(confirmRegistration).toBeDisabled();
  await secretKeyInput.fill(LIVE_SECRET_KEY);
  await expect(confirmRegistration).toBeDisabled();
  await reviewAction.click();
  await expect(review).toBeVisible();
  await confirmRegistration.click();
  await expect(page.getByRole("heading", { name: "Registered Live operations." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Register account" })).toHaveCount(0);
  expect(accountWrites).toEqual([
    { method: "POST", path: "/v1/accounts/registration/preflight", body: registrationBody },
    { method: "POST", path: "/v1/accounts/registration/preflight", body: registrationBody },
    { method: "POST", path: "/v1/accounts", body: registrationBody },
  ]);
  await expect(page.getByRole("row", { name: /Live operations/ }).getByText("Live", { exact: true })).toBeVisible();

  await registerAction.click();
  await expect(accountNameInput).toHaveValue("");
  await expect(apiKeyInput).toHaveValue("");
  await expect(secretKeyInput).toHaveValue("");
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  expectNoCredentialLeak(requestUrls, [LIVE_API_KEY, LIVE_SECRET_KEY]);
});

test("edits, rotates, inspects, and deletes a managed account", async ({ page, request }) => {
  const legacyRegistration = await request.post(`${E2E_API_ORIGIN}/v1/accounts`, {
    data: {
      account_name: "Legacy request",
      environment: "paper",
      api_key_secret_name: "ALPACA_PAPER_API_KEY",
      secret_key_secret_name: "ALPACA_PAPER_SECRET_KEY",
    },
  });
  expect(legacyRegistration.status()).toBe(422);
  const created = await (await request.post(`${E2E_API_ORIGIN}/v1/accounts`, {
    data: {
      account_name: "Rotation desk",
      environment: "paper",
      credentials: { source: "managed", api_key: "AKE2ESETUPKEY0003", secret_key: "e2eSetupSecretKey0003" },
    },
  })).json() as { uid: string; unique_identifier: string };

  const { requestUrls, accountWrites } = trackAccountTraffic(page);
  await page.goto("/accounts");
  const row = page.getByRole("row", { name: /Rotation desk/ });
  const form = page.locator("form.workflow-form");
  const newApiKey = form.getByLabel("New API key");
  const newSecretKey = form.getByLabel("New secret key");
  const saveChanges = form.getByRole("button", { name: "Save changes" });
  const accountPath = `/v1/accounts/${created.uid}`;

  await chooseRowAction(page, row, "Edit");
  await expect(page.getByRole("heading", { name: "Edit account registration" })).toBeVisible();
  await expect(form.getByRole("heading", { name: "Rotate credentials" })).toBeVisible();
  await expect(form.getByText("Leave both fields empty to keep the current credentials.", { exact: false })).toBeVisible();
  await expect(newApiKey).toHaveAttribute("type", "password");
  await expect(newSecretKey).toHaveAttribute("autocomplete", "off");
  await expect(form.getByText("No changes to save.", { exact: true })).toBeVisible();
  await expect(saveChanges).toBeDisabled();
  await form.getByLabel("Account name").fill("Rotation desk renamed");
  await form.getByLabel("Active", { exact: true }).uncheck();
  await saveChanges.click();
  await expect(page.getByRole("heading", { name: "Updated Rotation desk renamed." })).toBeVisible();
  expect(accountWrites).toEqual([
    { method: "PATCH", path: accountPath, body: { account_name: "Rotation desk renamed", account_is_active: false } },
  ]);

  await chooseRowAction(page, row, "Edit");
  await newApiKey.fill(ROTATED_API_KEY);
  await expect(form.getByText("Enter both the new API key and the new secret key", { exact: false })).toBeVisible();
  await expect(saveChanges).toBeDisabled();
  await form.getByRole("button", { name: "Cancel edit" }).click();
  await chooseRowAction(page, row, "Edit");
  await expect(newApiKey).toHaveValue("");
  await expect(newSecretKey).toHaveValue("");
  await newApiKey.fill(ROTATED_API_KEY);
  await newSecretKey.fill(ROTATED_SECRET_KEY);
  await saveChanges.click();
  await expect(page.getByRole("heading", { name: "Edit account registration" })).toHaveCount(0);
  expect(accountWrites.slice(1)).toEqual([
    {
      method: "PATCH",
      path: accountPath,
      body: { credentials: { source: "managed", api_key: ROTATED_API_KEY, secret_key: ROTATED_SECRET_KEY } },
    },
  ]);
  await chooseRowAction(page, row, "Edit");
  await expect(newApiKey).toHaveValue("");
  await expect(newSecretKey).toHaveValue("");
  await form.getByRole("button", { name: "Cancel edit" }).click();

  await row.getByText("Rotation desk renamed", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Rotation desk renamed" })).toBeVisible();
  await expect(page.getByText("Stored by this application", { exact: true })).toBeVisible();
  await expect(page.getByText("Stored encrypted", { exact: true })).toBeVisible();
  await expect(page.getByText(`ALPACA_CONNECTORS__${created.unique_identifier}__API_KEY`, { exact: true })).toHaveCount(0);
  await expect(page.getByText("Credentials updated", { exact: true })).toBeVisible();
  await expect(page.getByText(ROTATED_API_KEY)).toHaveCount(0);
  await page.getByRole("button", { name: "Back to accounts" }).click();

  const deletes: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() === "DELETE") deletes.push(sent.url());
  });
  await chooseRowAction(page, row, "Delete");
  const dialog = page.getByRole("dialog", { name: "Delete account" });
  await expect(dialog).toContainText("everything that belongs to it");
  await expect(dialog.getByText("Preflight passed", { exact: true })).toBeVisible();
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete account", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByText("Deleted Rotation desk renamed and everything that belonged to it.", { exact: false })).toBeVisible();
  await expect(page.getByText("Deleted stored credential Secrets", { exact: false })).toHaveCount(0);
  // The API takes only the exact confirmation for this account.
  expect(deletes.map((url) => new URL(url).searchParams.get("confirm"))).toEqual([`DELETE ${created.uid}`]);
  expectNoCredentialLeak(requestUrls, [ROTATED_API_KEY, ROTATED_SECRET_KEY]);
});

test("removes an account's keys, keeps everything else, and stores new keys again", async ({ page, request }) => {
  const created = await createAccount(request, "Keys desk", "KEYS0004");
  const removals: Array<{ path: string; body: unknown }> = [];
  page.on("request", (sent) => {
    const url = new URL(sent.url());
    if (sent.method() === "POST" && url.pathname.endsWith("/actions/remove-keys")) {
      removals.push({ path: url.pathname, body: sent.postDataJSON() });
    }
  });

  await page.goto("/accounts");
  const row = page.getByRole("row", { name: /Keys desk/ });
  await expect(row).toContainText("Stored encrypted");
  await chooseRowAction(page, row, "Remove keys");
  const dialog = page.getByRole("dialog", { name: "Remove account keys" });
  await expect(dialog).toContainText("portfolios, signals and bars feeds stay");
  await expect(dialog.getByRole("button", { name: "Remove keys", exact: true })).toBeDisabled();
  await dialog.getByLabel("Confirmation word").fill("REMOVE");
  await dialog.getByRole("button", { name: "Remove keys", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Removed the keys of Keys desk." })).toBeVisible();
  await expect(row).toContainText("Removed");
  expect(removals).toEqual([{ path: `/v1/accounts/${created.uid}/actions/remove-keys`, body: {} }]);

  // Removing them again is not offered; the account and its detail stay.
  await row.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Remove keys", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await row.getByText("Keys desk", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Keys desk", exact: true })).toBeVisible();
  await expect(page.getByText("This account's keys were removed.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Back to accounts" }).click();

  await chooseRowAction(page, row, "Edit");
  const form = page.locator("form.workflow-form");
  await expect(form.getByText("runs on it fail until you enter new keys here", { exact: false })).toBeVisible();
  await form.getByLabel("New API key").fill(ROTATED_API_KEY);
  await form.getByLabel("New secret key").fill(ROTATED_SECRET_KEY);
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Edit account registration" })).toHaveCount(0);
  await expect(row).toContainText("Stored encrypted");
});

test("removes keys from the selected accounts through the API's bulk action", async ({ page, request }) => {
  const created = await createAccount(request, "Bulk desk", "BULK0005");
  const preflights: unknown[] = [];
  page.on("request", (sent) => {
    if (new URL(sent.url()).pathname === "/v1/accounts/actions/remove-keys/preflight") preflights.push(sent.postDataJSON());
  });

  await page.goto("/accounts");
  const row = page.getByRole("row", { name: /Bulk desk/ });
  await row.getByRole("checkbox").check();
  await page.locator(".cc-resource-selection-bar").getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Remove keys", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("The stored keys will be removed.", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Remove keys", exact: true }).click();
  await expect(page.getByText("Remove keys completed.", { exact: true })).toBeVisible();
  await expect(row).toContainText("Removed");
  expect(preflights).toEqual([{ selection: { mode: "explicit", uids: [created.uid] }, options: {} }]);
});

test("previews an account delete and deletes its portfolios, signals and bars with it", async ({ page, request }) => {
  const created = await createAccount(request, "Delete desk", "DELETE0006");
  const feed = await request.post(`${E2E_API_ORIGIN}/v1/market-data/bar-configurations`, {
    data: {
      name: "Delete desk holdings",
      description: null,
      enabled: true,
      scheduled: true,
      account_uid: created.uid,
      asset_source: "account_holdings",
      asset_uids: [],
      frequency_id: "1d",
      feed: "sip",
      adjustment: "all",
    },
  });
  expect(feed.status()).toBe(201);
  const signal = await (await request.post(`${E2E_API_ORIGIN}/v1/signal-definitions`, {
    data: { account_uid: created.uid, key: "desk/momentum", name: "Desk momentum" },
  })).json() as { uid: string };
  const portfolio = await request.post(`${E2E_API_ORIGIN}/v1/portfolio-configurations`, {
    data: {
      name: "Desk portfolio",
      account_uid: created.uid,
      signal_definition_uid: signal.uid,
      rebalance_configuration_uid: "rebalance-nyse-close",
    },
  });
  expect(portfolio.status()).toBe(201);

  await page.goto("/accounts");
  const row = page.getByRole("row", { name: /Delete desk/ });
  await chooseRowAction(page, row, "Delete");
  const dialog = page.getByRole("dialog", { name: "Delete account" });
  const impact = (message: string) => dialog.locator("li").filter({ hasText: message });
  await expect(impact("Portfolios that end and are deleted")).toContainText("1");
  await expect(impact("Signals deleted with their published weights")).toContainText("1");
  await expect(impact("Bars feeds deleted")).toContainText("1");
  await expect(impact("holdings, orders, trades and targets")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete account", exact: true })).toBeDisabled();
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete account", exact: true }).click();
  await expect(page.getByText("1 portfolio ended; 1 retired Portfolio deleted.", { exact: true })).toBeVisible();
  await expect(page.getByText("1 signal deleted with its weights.", { exact: true })).toBeVisible();
  await expect(row).toHaveCount(0);

  await page.goto("/portfolios");
  await expect(page.getByRole("row", { name: /Daily momentum portfolio/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Desk portfolio/ })).toHaveCount(0);
  await page.goto("/signals");
  await expect(page.getByRole("row", { name: /Momentum/ }).first()).toBeVisible();
  await expect(page.getByRole("row", { name: /Desk momentum/ })).toHaveCount(0);
  await page.goto("/bars");
  await expect(page.getByRole("row", { name: /Daily paper holdings/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Delete desk holdings/ })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Desk portfolio prices/ })).toHaveCount(0);
});

test("shows what blocks an account delete and changes nothing", async ({ page, request }) => {
  const created = await createAccount(request, "Held desk", "HELD0007");
  const blocker = "1 of the account's portfolios are held by another account's current target; that account's owner must change its target first.";
  await request.post(`${E2E_API_ORIGIN}/__account-delete-blockers`, {
    data: { account_uid: created.uid, blockers: [blocker] },
  });
  const deletes: string[] = [];
  page.on("request", (sent) => {
    if (sent.method() === "DELETE") deletes.push(sent.url());
  });

  await page.goto("/accounts");
  const row = page.getByRole("row", { name: /Held desk/ });
  await chooseRowAction(page, row, "Delete");
  const dialog = page.getByRole("dialog", { name: "Delete account" });
  await expect(dialog.getByText("Action blocked", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText(blocker, { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Confirmation word")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Action blocked" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toBeVisible();
  expect(deletes).toEqual([]);
  await request.post(`${E2E_API_ORIGIN}/__account-delete-blockers`, { data: { account_uid: created.uid, blockers: [] } });
});

test("tells a person who does not own an account that only its owner removes its keys or deletes it", async ({ page }) => {
  await page.goto("/accounts");
  const row = page.getByRole("row", { name: /Shared income account/ });
  await chooseRowAction(page, row, "Remove keys");
  const removeDialog = page.getByRole("dialog", { name: "Remove account keys" });
  await removeDialog.getByLabel("Confirmation word").fill("REMOVE");
  await removeDialog.getByRole("button", { name: "Remove keys", exact: true }).click();
  await expect(removeDialog.getByText("This Alpaca account is registered to another owner.", { exact: true })).toBeVisible();
  await removeDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toContainText("Stored encrypted");

  await chooseRowAction(page, row, "Delete");
  const deleteDialog = page.getByRole("dialog", { name: "Delete account" });
  await expect(deleteDialog.getByText("Preflight could not be completed", { exact: true })).toBeVisible();
  await expect(deleteDialog.getByText("This Alpaca account is registered to another owner.", { exact: true })).toBeVisible();
  await expect(deleteDialog.getByRole("button", { name: "Preflight unavailable" })).toBeDisabled();
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toBeVisible();
});

test("shows an Alpaca credential rejection without enabling registration", async ({ page }) => {
  const registrationRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/v1/accounts") {
      registrationRequests.push(request.url());
    }
  });
  await page.route("**/v1/accounts/registration/preflight", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      json: {
        detail: {
          code: "alpaca_credentials_rejected",
          message: "Alpaca rejected the supplied credentials.",
          retryable: false,
        },
      },
    });
  });

  await page.goto("/accounts");
  await page.getByRole("button", { name: "Register account", exact: true }).click();
  const form = page.locator("form.workflow-form");
  const rejection = form.getByText("Alpaca rejected these credentials.", { exact: false });
  await form.getByLabel("Account name").fill("Rejected paper account");
  await form.getByLabel("API key", { exact: true }).fill(LIVE_API_KEY);
  await form.getByLabel("Secret key", { exact: true }).fill(LIVE_SECRET_KEY);
  await form.getByRole("button", { name: "Review registration" }).click();

  await expect(rejection).toBeVisible();
  await expect(rejection).toContainText("paper trading account");
  await expect(page.getByRole("dialog", { name: "Account request failed" })).toHaveCount(0);
  await expect(form.getByRole("region", { name: "Registration review" })).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Register account" })).toBeDisabled();
  await form.getByLabel("Secret key", { exact: true }).fill(ROTATED_SECRET_KEY);
  await expect(rejection).toHaveCount(0);
  expect(registrationRequests).toHaveLength(0);
});

test("blocks registration when the review reports unresolved holdings", async ({ page }) => {
  const registrationRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/v1/accounts") {
      registrationRequests.push(request.url());
    }
  });
  await page.route("**/v1/accounts/registration/preflight", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        account_unique_identifier: "PA0000000003__ALPACA_PAPER",
        account_number: "PA0000000003",
        status: "ACTIVE",
        is_paper: true,
        credential_source: "managed",
        equity: "1000",
        cash: "0",
        would_write_holdings: 1,
        unresolved_symbols: ["33333333-3333-4333-8333-333333333333"],
        alpaca_asset_ids_to_register: [],
        cash_asset_identifiers_to_ensure: [],
      },
    });
  });

  await page.goto("/accounts");
  await page.getByRole("button", { name: "Register account", exact: true }).click();
  const registrationForm = page.locator("form.workflow-form");
  await registrationForm.getByLabel("Account name").fill("Blocked paper account");
  await registrationForm.getByLabel("API key", { exact: true }).fill(LIVE_API_KEY);
  await registrationForm.getByLabel("Secret key", { exact: true }).fill(LIVE_SECRET_KEY);
  await registrationForm.getByRole("button", { name: "Review registration" }).click();

  const review = registrationForm.getByRole("region", { name: "Registration review" });
  await expect(review.getByText("Blocked", { exact: true })).toBeVisible();
  await expect(review.getByText("33333333-3333-4333-8333-333333333333", { exact: true })).toBeVisible();
  await expect(review.getByText("None.", { exact: true })).toHaveCount(2);
  await expect(registrationForm.getByRole("button", { name: "Register account" })).toBeDisabled();
  await assertCommandCenterPageLayout(page);
  expect(registrationRequests).toHaveLength(0);
});

test("loads only the selected account's latest holdings after row activation", async ({ page }) => {
  const holdingsRequests: URL[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith("/holdings/latest")) holdingsRequests.push(url);
  });

  await page.goto("/accounts");
  const accountRow = page.getByRole("row", { name: /Paper account/ });
  await expect(accountRow).toBeVisible();
  expect(holdingsRequests).toHaveLength(0);

  await accountRow.getByText("Paper account", { exact: true }).click();

  await expect(page.getByRole("heading", { name: "Paper account" })).toBeVisible();
  await expect(page.getByText("Imported from Main Sequence Secrets", { exact: true })).toBeVisible();
  await expect(page.getByText("Stored encrypted", { exact: true })).toBeVisible();
  await expect(page.getByText("ALPACA_PAPER_API_KEY", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Not recorded", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest holdings" })).toBeVisible();
  await expect(page.getByRole("row", { name: /AAPL/ })).toContainText("125");
  await expect(page.getByRole("row", { name: /USD/ })).toContainText("25,000");
  expect(holdingsRequests).toHaveLength(1);
  expect(holdingsRequests[0].pathname).toBe("/v1/accounts/account-paper/holdings/latest");

  await page.getByRole("button", { name: "Back to accounts" }).click();
  await expect(page.getByRole("row", { name: /Paper account/ })).toBeVisible();
});

test("completes the Alpaca Agent's key requests on the Accounts page", async ({ page, request }) => {
  const { requestUrls, accountWrites } = trackAccountTraffic(page);
  async function startKeyRequest(data: Record<string, string>) {
    return (await (await request.post(`${E2E_API_ORIGIN}/__key-requests`, { data })).json()) as { uid: string };
  }
  const registration = await startKeyRequest({
    action: "register",
    environment: "live",
    account_name: "Agent live account",
  });
  const unwanted = await startKeyRequest({ action: "register", environment: "paper", account_name: "Not needed" });
  const rotation = await startKeyRequest({ action: "rotate", environment: "paper", account_uid: "account-paper" });

  await page.goto("/accounts");
  await expect(page.getByRole("heading", { name: "Requested by your Alpaca Agent" })).toBeVisible();
  const pending = page.getByRole("list", { name: "Pending key requests" }).getByRole("listitem");
  await expect(pending).toHaveCount(3);
  await expect(pending.filter({ hasText: "Register a live account named \u201cAgent live account\u201d" })).toHaveCount(1);
  await expect(pending.filter({ hasText: "Replace the keys of a registered paper account" })).toHaveCount(1);

  await pending.filter({ hasText: "Not needed" }).getByRole("button", { name: "Dismiss" }).click();
  await expect(pending).toHaveCount(2);

  await pending.filter({ hasText: "Agent live account" }).getByRole("button", { name: "Enter keys" }).click();
  const form = page.locator("form.workflow-form");
  await expect(form.getByText("this completes your Alpaca Agent's request")).toBeVisible();
  await expect(form.getByLabel("Account name")).toHaveValue("Agent live account");
  await expect(form.getByLabel("Environment")).toHaveValue("live");
  await expect(form.getByLabel("Environment")).toBeDisabled();
  await form.getByLabel("API key", { exact: true }).fill(LIVE_API_KEY);
  await form.getByLabel("Secret key", { exact: true }).fill(LIVE_SECRET_KEY);
  await form.getByRole("button", { name: "Review registration" }).click();
  await expect(form.getByRole("region", { name: "Registration review" })).toBeVisible();
  await form.getByRole("button", { name: "Register account" }).click();
  await expect(page.getByRole("heading", { name: "Registered Agent live account." })).toBeVisible();
  await expect(page.getByText("Your Alpaca Agent's request is complete")).toBeVisible();

  await expect(pending).toHaveCount(1);
  await pending.getByRole("button", { name: "Enter keys" }).click();
  const save = form.getByRole("button", { name: "Save changes" });
  await expect(form.getByText("Enter the new API key and secret key to complete")).toBeVisible();
  await expect(save).toBeDisabled();
  await form.getByLabel("New API key").fill(ROTATED_API_KEY);
  await form.getByLabel("New secret key").fill(ROTATED_SECRET_KEY);
  await save.click();
  await expect(page.getByRole("heading", { name: /^Updated .+\.$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Requested by your Alpaca Agent" })).toHaveCount(0);

  const registrationBody = {
    account_name: "Agent live account",
    environment: "live",
    credentials: { source: "managed", api_key: LIVE_API_KEY, secret_key: LIVE_SECRET_KEY },
    key_request_uid: registration.uid,
  };
  expect(accountWrites).toEqual([
    { method: "POST", path: `/v1/accounts/key-requests/${unwanted.uid}/actions/cancel`, body: {} },
    { method: "POST", path: "/v1/accounts/registration/preflight", body: registrationBody },
    { method: "POST", path: "/v1/accounts", body: registrationBody },
    {
      method: "PATCH",
      path: "/v1/accounts/account-paper",
      body: {
        credentials: { source: "managed", api_key: ROTATED_API_KEY, secret_key: ROTATED_SECRET_KEY },
        key_request_uid: rotation.uid,
      },
    },
  ]);
  expectNoCredentialLeak(requestUrls, [LIVE_API_KEY, LIVE_SECRET_KEY, ROTATED_API_KEY, ROTATED_SECRET_KEY]);
});

test("plans and executes asset registration through the observable operation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Register Alpaca-backed assets" })).toBeVisible();
  await page.getByRole("button", { name: "Registered Alpaca account" }).click();
  await page.getByRole("option", { name: /Paper account/ }).click();
  await page.getByLabel("Exact Alpaca symbols", { exact: false }).fill("AAPL, NVDA");
  await page.getByRole("button", { name: "Build plan" }).click();
  const planProgress = page.getByRole("list", { name: "Asset registration progress" });
  await expect(page.getByRole("heading", { name: "Registration progress" })).toBeVisible();
  await expect(planProgress).toBeVisible();
  await expect(planProgress.getByText("Complete", { exact: true })).toHaveCount(7);
  await expect(planProgress.getByText("Resolve registered Alpaca account", { exact: true })).toBeVisible();
  await expect(planProgress.getByText("Resolve Alpaca asset identities", { exact: true })).toBeVisible();
  await expect(planProgress.getByText("Enrich optional OpenFIGI details", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registration plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenFIGI enrichment warnings" })).toBeVisible();
  await expect(page.getByText(
    "OpenFIGI returned no unambiguous match; Alpaca registration remains available.",
    { exact: true },
  )).toBeVisible();
  await expect(page.getByRole("button", { name: "Execute approved plan" })).toBeEnabled();
  await page.getByRole("button", { name: "Execute approved plan" }).click();
  const executionProgress = page.getByRole("list", { name: "Asset registration progress" });
  await expect(executionProgress.getByText("Complete", { exact: true })).toHaveCount(8);
  await expect(page.getByRole("heading", { name: "Registration execution" })).toBeVisible();
});

test("creates, reads, updates, and deletes a bars feed of an account", async ({ page }) => {
  let createPayload: Record<string, unknown> | null = null;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/v1/market-data/bar-configurations") {
      createPayload = request.postDataJSON() as Record<string, unknown>;
    }
  });

  await page.goto("/bars");
  await expect(page.getByRole("heading", { level: 1, name: "Bars configurations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create bars feed" })).toBeVisible();
  const holdings = page.getByRole("row", { name: /Daily paper holdings/ });
  await expect(holdings).toContainText("Latest account holdings");
  await expect(holdings).toContainText("Paper account (paper)");
  const portfolioBars = page.getByRole("row", { name: /Daily momentum portfolio prices/ });
  await expect(portfolioBars).toContainText("Daily momentum portfolio");
  await expect(portfolioBars).not.toContainText("Paper account (paper)");
  await expect(portfolioBars).toContainText("Its portfolio's assets");

  await page.getByLabel("Name").fill("Daily explicit assets");
  await page.getByLabel("Registered Alpaca account").selectOption("account-paper");
  await page.getByRole("button", { name: "Asset source" }).click();
  // A feed prices explicit assets or its account's holdings; a portfolio's own comes with it.
  await expect(page.getByRole("listbox", { name: "Asset source" }).getByRole("option")).toHaveCount(2);
  await expect(page.getByRole("option", { name: /Latest account holdings/ })).toBeVisible();
  await page.getByRole("option", { name: /Explicit assets/ }).click();
  await page.getByLabel("Registered Asset UIDs").fill("asset-aapl, asset-msft");
  await page.getByRole("button", { name: "Migrated Bars profile" }).click();
  await expect(page.getByRole("option", { name: /Daily · IEX · Raw \(unadjusted\)/ })).toContainText(
    "prices are not adjusted for corporate actions",
  );
  await expect(page.getByRole("option", { name: /Daily · SIP · Adjusted \(all corporate actions\)/ })).toContainText(
    "prices are adjusted for all corporate actions",
  );
  await page.getByRole("option", { name: /Daily · SIP · Adjusted \(all corporate actions\)/ }).click();
  await expect(page.getByRole("button", { name: "Migrated Bars profile" })).toContainText(
    "Adjusted (all corporate actions)",
  );
  await page.getByLabel("Include in the daily bars update").uncheck();
  await page.getByRole("button", { name: "Create feed" }).click();
  await expect(page.getByRole("heading", { name: "Created Daily explicit assets." })).toBeVisible();
  // Exactly the connector's feed create model.
  expect(createPayload).toEqual({
    name: "Daily explicit assets",
    description: null,
    enabled: true,
    scheduled: false,
    account_uid: "account-paper",
    asset_source: "assets",
    asset_uids: ["asset-aapl", "asset-msft"],
    frequency_id: "1d",
    feed: "sip",
    adjustment: "all",
  });

  let createdRow = page.getByRole("row", { name: /Daily explicit assets/ });
  await expect(createdRow).toContainText("Explicit assets");
  await expect(createdRow).toContainText("On demand");
  await createdRow.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit bars feed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Asset source" })).toContainText("Explicit assets");
  await page.getByLabel("Name").fill("Daily explicit assets updated");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Updated Daily explicit assets updated." })).toBeVisible();

  createdRow = page.getByRole("row", { name: /Daily explicit assets updated/ });
  await createdRow.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete bars feed" });
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(createdRow).toHaveCount(0);
});

test("keeps a portfolio's own bars configuration with its portfolio", async ({ page }) => {
  const patches: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "PATCH" && url.pathname === "/v1/market-data/bar-configurations/bars-portfolio-existing") {
      patches.push(request.postDataJSON() as Record<string, unknown>);
    }
  });

  await page.goto("/bars");
  const row = page.getByRole("row", { name: /Daily momentum portfolio prices/ });
  // It is deleted only with its portfolio.
  await expect(row.getByRole("button", { name: "Delete" })).toBeDisabled();
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit a portfolio's bars configuration" })).toBeVisible();
  const form = page.locator("form.workflow-form");
  await expect(form.getByLabel("Belongs to")).toHaveValue("Portfolio · Daily momentum portfolio");
  await expect(form.getByLabel("Registered Alpaca account")).toHaveCount(0);
  await expect(form.getByLabel("Asset source")).toHaveValue("Every asset its portfolio's signal has published");
  await form.getByLabel("Name").fill("Momentum portfolio prices");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Updated Momentum portfolio prices." })).toBeVisible();
  // Its account and asset source are its portfolio's: the edit never sends them.
  expect(patches).toEqual([{
    name: "Momentum portfolio prices",
    description: "Daily SIP bars for the portfolio's assets.",
    enabled: true,
    scheduled: true,
    frequency_id: "1d",
    feed: "sip",
    adjustment: "all",
  }]);


  await page.getByRole("button", { name: "Belongs to", exact: true }).click();
  await page.getByRole("option", { name: "Portfolios' own" }).click();
  await expect(page.getByRole("row", { name: /Momentum portfolio prices/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Daily paper holdings/ })).toHaveCount(0);
});

test("shows bars request failures in a dismissible modal", async ({ page }) => {
  await page.route("**/v1/market-data/bar-configurations", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      json: { detail: "Bars configuration response validation failed." },
    });
  });

  await page.goto("/bars");
  await page.getByLabel("Name").fill("Broken bars request");
  await page.getByRole("button", { name: "Create feed" }).click();

  const errorDialog = page.getByRole("dialog", {
    name: "Bars configuration request failed",
  });
  await expect(errorDialog).toBeVisible();
  await expect(errorDialog).toContainText(
    "Bars configuration response validation failed.",
  );
  await errorDialog.getByRole("button", { name: "Dismiss" }).click();
  await expect(errorDialog).toHaveCount(0);
});

test("loads a portfolio's details, weights, and value history only after portfolio selection", async ({ page }) => {
  const detailRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/v1/portfolio-configurations/portfolio-config-existing") {
      detailRequests.push(request.url());
    }
  });

  await page.goto("/portfolios");
  const row = page.getByRole("row", { name: /Daily momentum portfolio/ });
  await expect(row).toBeVisible();
  expect(detailRequests).toHaveLength(0);

  await row.getByText("Daily momentum portfolio", { exact: true }).click();

  await expect(page.getByRole("heading", { name: "Daily momentum portfolio" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Historical performance" })).toBeVisible();
  await expect(page.locator("[data-portfolio-value-chart]")).toBeVisible();
  await expect(page.getByText("101.40", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Total return", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1.40%", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Maximum drawdown", { exact: true })).toBeVisible();
  await expect(page.getByText("Calculated by Empyrical", { exact: false })).toBeVisible();
  await expect(page.getByText("alpha and beta are not reported", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Portfolio construction" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Valuation source" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Execution and calendar" })).toBeVisible();
  await expect(page.getByText(/^(Daily momentum|Momentum) portfolio prices$/).first()).toBeVisible();
  const construction = page.locator("details").filter({ hasText: "Portfolio construction" });
  await expect(construction.getByRole("heading", { name: "Weights", exact: true })).toBeVisible();
  await expect(construction.locator("dt", { hasText: /^Account$/ }).locator("xpath=following-sibling::dd[1]")).toHaveText("Paper account (paper)");
  await expect(construction.locator("dt", { hasText: /^Signal$/ }).locator("xpath=following-sibling::dd[1]")).toHaveText("Momentum · momentum");
  await expect(construction.getByText("Published to the signal by the account owner's application", { exact: true })).toBeVisible();
  await expect(construction.locator("dt", { hasText: /^Assets$/ }).locator("xpath=following-sibling::dd[1]")).toHaveText("3");
  // A portfolio built from provided weights has no signal configuration to show.
  await expect(construction.getByRole("heading", { name: "Signal", exact: true })).toHaveCount(0);
  await expect(construction.getByText("CalendarEventSignal", { exact: true })).toBeVisible();
  await expect(construction.getByText("NYSE · regular session", { exact: true })).toBeVisible();
  await expect(construction.getByText("At market close", { exact: true })).toBeVisible();
  await expect(construction.getByText("Every session", { exact: true })).toBeVisible();
  await expect(page.getByText("ImmediateSignal", { exact: true })).toHaveCount(0);
  const valuation = page.locator("details").filter({ hasText: "Valuation source" });
  await valuation.locator("summary").click();
  await expect(valuation.getByText("1 day (86400 seconds)", { exact: true })).toBeVisible();
  await expect(valuation.getByText("Every asset the portfolio's signal has published", { exact: true })).toBeVisible();
  await expect(valuation.getByText(/ · the portfolio's own$/)).toBeVisible();
  await expect(page.getByText("Portfolio valuation cadence", { exact: true })).toHaveCount(0);
  await page.locator("details").filter({ hasText: "Execution and calendar" }).locator("summary").click();
  await expect(page.getByText("NYSE trading calendar · exchange_calendar", { exact: true })).toBeVisible();
  await expect(page.getByText("Extend latest prices to now", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Portfolio UID", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Signal UID", { exact: true })).toHaveCount(0);
  await expect(page.getByText("portfolio-existing", { exact: true })).toHaveCount(0);
  await expect(page.getByText("weights-portfolio-config-existing", { exact: true })).toHaveCount(0);

  expect(detailRequests).toHaveLength(1);
  const requestUrl = new URL(detailRequests[0]);
  expect(requestUrl.searchParams.get("observation_limit")).toBe("2500");
});

test("shows the shared portfolio Job schedule read-only and pauses through PATCH scheduled", async ({ page }) => {
  const patches: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "PATCH" && url.pathname === "/v1/portfolio-configurations/portfolio-config-existing") {
      patches.push(request.postDataJSON() as Record<string, unknown>);
    }
  });

  await page.goto("/portfolios");
  await page.getByRole("row", { name: /Daily momentum portfolio/ }).getByText("Daily momentum portfolio", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Daily momentum portfolio" })).toBeVisible();
  await expect(page.getByText("0 2 * * * · UTC", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("Portfolio left out of the scheduled run.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByText("Portfolio included in the scheduled run.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  expect(patches).toEqual([{ scheduled: false }, { scheduled: true }]);
});

test("runs and deletes portfolios built from provided weights and never creates or edits one", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/v1/portfolio-configurations") && ["POST", "PATCH"].includes(request.method()) && !url.pathname.includes("/actions/")) {
      writes.push(`${request.method()} ${url.pathname}`);
    }
  });

  await page.goto("/portfolios");
  await expect(page.getByRole("heading", { level: 1, name: "Portfolios" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Portfolios" })).toBeVisible();
  await expect(page.getByText("The account owner's application creates them and publishes the signals' weights", { exact: false })).toBeVisible();
  const momentum = page.getByRole("row", { name: /Daily momentum portfolio/ });
  await expect(momentum).toContainText("CalendarEventSignal");
  await expect(momentum).toContainText("Paper account (paper)");
  await expect(momentum).toContainText("Momentum · momentum");
  // Creating a portfolio and giving it weights are the application's; the page offers neither.
  await expect(page.getByRole("button", { name: "Create portfolio" })).toHaveCount(0);
  await expect(page.locator("form.workflow-form")).toHaveCount(0);

  let row = page.getByRole("row", { name: /Quarterly value portfolio/ });
  await expect(row.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await row.getByRole("button", { name: "Run now", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Quarterly value portfolio: JobRun/ })).toBeVisible();

  row = page.getByRole("row", { name: /Quarterly value portfolio/ });
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete portfolio" });
  await expect(dialog).toContainText("It is retired, not erased");
  await expect(dialog).toContainText("Only the portfolio's owner can delete it.");
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Deleted Quarterly value portfolio. The portfolio is retired and its own bars configuration deleted; its published values were retained." })).toBeVisible();
  await expect(page.getByRole("row", { name: /Daily momentum portfolio/ })).toBeVisible();
  expect(writes).toEqual([]);
});

test("filters portfolios by account and signal", async ({ page }) => {
  const listQueries: URLSearchParams[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/v1/portfolio-configurations") listQueries.push(url.searchParams);
  });

  await page.goto("/portfolios");
  await expect(page.getByRole("row", { name: /Daily momentum portfolio/ })).toBeVisible();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("option", { name: "Shared income account (paper)" }).click();
  await expect(page.getByRole("row", { name: /Shared income portfolio/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Daily momentum portfolio/ })).toHaveCount(0);
  expect(listQueries.at(-1)?.get("account_uid")).toBe("account-shared");

  // The signal filter offers the selected account's signals only.
  await page.getByRole("button", { name: "Signal", exact: true }).click();
  await expect(page.getByRole("option", { name: /Income/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Momentum/ })).toHaveCount(0);
  await page.getByRole("option", { name: /Income/ }).click();
  await expect(page.getByRole("row", { name: /Shared income portfolio/ })).toBeVisible();
  expect(listQueries.at(-1)?.get("signal_definition_uid")).toBe("signal-def-income");
});

test("runs a portfolio not yet adopted like any other", async ({ page }) => {
  await page.goto("/portfolios");
  const row = page.getByRole("row", { name: /Legacy growth portfolio/ });
  await expect(row).toContainText("Not adopted");
  await row.getByRole("button", { name: "Run now", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Legacy growth portfolio: JobRun/ })).toBeVisible();
  await row.getByText("Legacy growth portfolio", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Legacy growth portfolio" })).toBeVisible();
  await expect(page.getByText("It works as before", { exact: false })).toBeVisible();
  const valuation = page.locator("details").filter({ hasText: "Valuation source" });
  await valuation.locator("summary").click();
  await expect(valuation.getByText(/ · the feed it names$/)).toBeVisible();
});

test("edits a portfolios feed without its source and keeps it while portfolios name it", async ({ page }) => {
  const patches: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "PATCH" && url.pathname === "/v1/market-data/bar-configurations/bars-legacy-portfolios") {
      patches.push(request.postDataJSON() as Record<string, unknown>);
    }
  });

  await page.goto("/bars");
  const legacy = page.getByRole("row", { name: /Legacy portfolio prices/ });
  await expect(legacy).toContainText("Assets of the portfolios that name it");
  await legacy.getByRole("button", { name: "Edit" }).click();
  const form = page.locator("form.workflow-form");
  await expect(page.getByRole("heading", { name: "Edit bars feed" })).toBeVisible();
  await expect(form.getByLabel("Asset source")).toHaveValue("Every asset of the portfolios not yet adopted that name it");
  await form.getByLabel("Name").fill("Legacy portfolio prices renamed");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Updated Legacy portfolio prices renamed." })).toBeVisible();
  // It keeps its source: the edit sends none.
  expect(patches).toEqual([{
    name: "Legacy portfolio prices renamed",
    description: "The prices portfolios used before accounts owned them.",
    enabled: true,
    scheduled: true,
    frequency_id: "1d",
    feed: "sip",
    adjustment: "all",
    account_uid: "account-paper",
  }]);

  const renamed = page.getByRole("row", { name: /Legacy portfolio prices renamed/ });
  await renamed.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete bars feed" });
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog.getByText("Portfolios not yet adopted name this bars feed", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(renamed).toBeVisible();
});

test("tells a person who does not own a portfolio that only its owner can pause or delete it", async ({ page }) => {
  const refusals: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname === "/v1/portfolio-configurations/portfolio-config-shared" && response.status() === 403) {
      refusals.push(response.request().method());
    }
  });

  await page.goto("/portfolios");
  await page.getByRole("row", { name: /Shared income portfolio/ }).getByText("Shared income portfolio", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shared income portfolio" })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Only the portfolio's owner can do this." })).toBeVisible();
  await expect(page.getByText("This portfolio belongs to another owner.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back to portfolios" }).click();
  const row = page.getByRole("row", { name: /Shared income portfolio/ });
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete portfolio" });
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog.getByText("Only the portfolio's owner can do this.", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toBeVisible();
  expect(refusals).toEqual(["PATCH", "DELETE"]);
});

test("lists each account's signals and opens one with its latest weights and portfolios", async ({ page }) => {
  const reads: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && (url.pathname.startsWith("/v1/signal-definitions/") || url.pathname === "/v1/portfolio-configurations")) {
      reads.push(`${url.pathname}${url.search}`);
    }
  });

  await page.goto("/signals");
  await expect(page.getByRole("heading", { level: 1, name: "Signals" })).toBeVisible();
  // The application creates signals and publishes their weights; the page offers neither.
  await expect(page.getByRole("button", { name: /Create/ })).toHaveCount(0);
  const momentum = page.getByRole("row", { name: /Momentum/ });
  await expect(momentum).toContainText("momentum");
  await expect(momentum).toContainText("Paper account (paper)");
  await expect(momentum).toContainText("1 portfolio");
  await expect(page.getByRole("row", { name: /Income/ })).toContainText("Shared income account (paper)");

  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("option", { name: "Shared income account (paper)" }).click();
  await expect(page.getByRole("row", { name: /Income/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Momentum/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("option", { name: "All accounts" }).click();

  await page.getByRole("row", { name: /Momentum/ }).getByText("Momentum", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Momentum", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest weights" })).toBeVisible();
  const aapl = page.getByRole("row", { name: /AAPL/ });
  await expect(aapl).toContainText("55.00%");
  await expect(aapl).toContainText("60.00%");
  await expect(page.getByRole("row", { name: /MSFT/ })).toContainText("45.00%");
  await expect(page.getByRole("row", { name: /Daily momentum portfolio/ })).toBeVisible();
  await expect(page.getByText("weights-portfolio-config-existing", { exact: true })).toHaveCount(0);
  expect(reads).toEqual(expect.arrayContaining([
    "/v1/signal-definitions/signal-def-momentum",
    "/v1/signal-definitions/signal-def-momentum/weights?limit=5",
    "/v1/portfolio-configurations?limit=100&offset=0&ordering=name&signal_definition_uid=signal-def-momentum",
  ]));
});

test("renames a signal and deletes only one no portfolio follows", async ({ page }) => {
  const writes: Array<{ method: string; path: string; body: unknown }> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/v1/signal-definitions") && ["PATCH", "DELETE"].includes(request.method())) {
      writes.push({ method: request.method(), path: url.pathname, body: request.postDataJSON() });
    }
  });

  await page.goto("/signals");
  await expect(page.getByRole("row", { name: /Momentum/ }).getByRole("button", { name: "Delete" })).toBeDisabled();

  const unused = page.getByRole("row", { name: /Unused signal/ });
  await expect(unused).toContainText("No portfolio");
  await unused.getByRole("button", { name: "Rename" }).click();
  const form = page.locator("form.workflow-form");
  await expect(form.getByLabel("Application key")).toHaveValue("unused");
  await expect(form.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await form.getByLabel("Name").fill("Spare signal");
  await form.getByLabel("Description").fill("Kept for later.");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Updated Spare signal." })).toBeVisible();

  const spare = page.getByRole("row", { name: /Spare signal/ });
  await spare.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete signal" });
  await expect(dialog).toContainText("only while no portfolio follows it");
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Deleted Spare signal and its weights." })).toBeVisible();
  await expect(spare).toHaveCount(0);
  expect(writes).toEqual([
    { method: "PATCH", path: "/v1/signal-definitions/signal-def-unused", body: { name: "Spare signal", description: "Kept for later." } },
    { method: "DELETE", path: "/v1/signal-definitions/signal-def-unused", body: null },
  ]);

  // Another owner's signal: the API refuses, and the page says so.
  await page.getByRole("row", { name: /Income/ }).getByRole("button", { name: "Rename" }).click();
  await form.getByLabel("Name").fill("Renamed income");
  await form.getByRole("button", { name: "Save changes" }).click();
  const error = page.getByRole("dialog", { name: "Signal request failed" });
  await expect(error).toContainText("This Alpaca account is registered to another owner.");
  await error.getByRole("button", { name: "Dismiss" }).click();
});

test("creates and edits a calendar-event rebalance configuration from its own portfolio application", async ({ page }) => {
  await page.goto("/rebalance-configurations");
  await expect(page.getByRole("heading", { level: 1, name: "Rebalance Configurations" })).toBeVisible();
  const existingRow = page.getByRole("row", { name: /NYSE close/ });
  await expect(existingRow).toContainText("CalendarEventSignal");
  await expect(existingRow).toContainText("NYSE · regular session");
  await expect(existingRow).toContainText("At market close");
  await expect(existingRow).toContainText("Every session");

  await page.getByRole("button", { name: "Create rebalance configuration", exact: true }).click();
  const form = page.locator("form.workflow-form");
  await expect(form.getByRole("button", { name: "Strategy" })).toContainText("Calendar Event Signal");
  await expect(form.getByLabel("Calendar", { exact: true })).toHaveValue("NYSE · regular session");
  await expect(form.getByLabel("Calendar", { exact: true })).not.toBeEditable();
  await expect(form.getByLabel("Market event")).toHaveValue("market_close");
  await expect(form.getByLabel("Event offset (seconds)")).toHaveValue("0");
  await expect(form.getByLabel("Cadence")).toHaveValue("every_session");
  await expect(form.getByLabel("Weekday")).toHaveCount(0);
  await expect(form.getByRole("status")).toHaveText("Rebalances at market close of every NYSE regular session.");

  await form.getByLabel("Name").fill("Wednesday pre-close");
  await form.getByLabel("Description Optional").fill("Rebalance weekly, fifteen minutes before the Wednesday close.");
  await form.getByLabel("Event offset (seconds)").fill("-90.5");
  await expect(form.getByRole("alert")).toHaveText("Enter the event offset as a whole number of seconds.");
  await expect(form.getByRole("button", { name: "Create configuration", exact: true })).toBeDisabled();
  await form.getByLabel("Event offset (seconds)").fill("-900");
  await form.getByLabel("Cadence").selectOption("weekly");
  const weekday = form.getByLabel("Weekday");
  await expect(weekday.locator("option")).toHaveText(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  await weekday.selectOption({ label: "Wednesday" });
  await expect(form.getByRole("status")).toHaveText("Rebalances 15 min before market close of each NYSE regular session that falls on a Wednesday.");
  const createRequest = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === "/v1/portfolio-rebalance-configurations");
  await form.getByRole("button", { name: "Create configuration", exact: true }).click();

  // Exactly PortfolioRebalanceConfigurationCreateRequest: calendar_event_signal on the NYSE regular session.
  const expectedRebalance = {
    name: "Wednesday pre-close",
    description: "Rebalance weekly, fifteen minutes before the Wednesday close.",
    strategy: "calendar_event_signal",
    calendar_identifier: "NYSE",
    session_label: "regular",
    rebalance_event: "market_close",
    event_offset_seconds: -900,
    rebalance_cadence: "weekly",
    rebalance_weekday: 2,
  };
  expect((await createRequest).postDataJSON()).toEqual(expectedRebalance);
  await expect(page.getByRole("heading", { name: "Created Wednesday pre-close." })).toBeVisible();
  const createdRow = page.getByRole("row", { name: /Wednesday pre-close/ });
  await expect(createdRow).toContainText("CalendarEventSignal");
  await expect(createdRow).toContainText("15 min before market close");
  await expect(createdRow).toContainText("Weekly on Wednesday");

  await createdRow.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit rebalance configuration" })).toBeVisible();
  await expect(form.getByLabel("Event offset (seconds)")).toHaveValue("-900");
  await expect(form.getByLabel("Weekday")).toHaveValue("2");
  await form.getByLabel("Market event").selectOption("market_open");
  await form.getByLabel("Event offset (seconds)").fill("1800");
  await form.getByLabel("Cadence").selectOption("every_session");
  const updateRequest = page.waitForRequest((request) => request.method() === "PATCH" && new URL(request.url()).pathname === "/v1/portfolio-rebalance-configurations/rebalance-2");
  await form.getByRole("button", { name: "Save changes", exact: true }).click();
  // The edit sends the whole body; an every-session policy stores the default weekday.
  expect((await updateRequest).postDataJSON()).toEqual({
    ...expectedRebalance,
    rebalance_event: "market_open",
    event_offset_seconds: 1800,
    rebalance_cadence: "every_session",
    rebalance_weekday: 0,
  });
  await expect(page.getByRole("heading", { name: "Updated Wednesday pre-close." })).toBeVisible();
  await expect(page.getByRole("row", { name: /Wednesday pre-close/ })).toContainText("30 min after market open");
});

test("shows rebalance request progress in a modal and labels failures accurately", async ({ page }) => {
  let releaseRequest: () => void = () => undefined;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let createPayload: unknown = null;

  await page.route("**/v1/portfolio-rebalance-configurations", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    createPayload = route.request().postDataJSON();
    await requestGate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      json: { detail: "The operation could not be completed by a required service." },
    });
  });

  await page.goto("/rebalance-configurations");
  await expect(page.getByRole("row", { name: /NYSE close/ })).toBeVisible();
  await page.getByRole("button", { name: "Create rebalance configuration", exact: true }).click();
  const form = page.locator("form.workflow-form");
  await form.getByLabel("Name").fill("Delayed rebalance request");
  await form.getByRole("button", { name: "Create configuration", exact: true }).click();

  const progressDialog = page.getByRole("dialog", { name: "Creating rebalance configuration" });
  await expect(progressDialog).toBeVisible();
  await expect(progressDialog.locator("[data-cc-activity-indicator]")).toBeVisible();
  await expect(page.getByRole("row", { name: /NYSE close/ })).toBeVisible();
  // An untouched form sends the connector's documented defaults explicitly.
  expect(createPayload).toEqual({
    name: "Delayed rebalance request",
    description: null,
    strategy: "calendar_event_signal",
    calendar_identifier: "NYSE",
    session_label: "regular",
    rebalance_event: "market_close",
    event_offset_seconds: 0,
    rebalance_cadence: "every_session",
    rebalance_weekday: 0,
  });

  releaseRequest();

  await expect(progressDialog).toHaveCount(0);
  const errorDialog = page.getByRole("dialog", {
    name: "Rebalance configuration request failed",
  });
  await expect(errorDialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "Portfolio request failed" })).toHaveCount(0);
  await expect(errorDialog.getByText("The operation could not be completed by a required service.", { exact: true })).toBeVisible();
});

interface FixtureRequestLogEntry {
  path: string;
  authorization: string | null;
  resourceReleaseUid: string | null;
}

async function fixtureRequestLog(request: APIRequestContext): Promise<FixtureRequestLogEntry[]> {
  const response = await request.get(`${E2E_API_ORIGIN}/__requests`);
  return ((await response.json()) as { requests: FixtureRequestLogEntry[] }).requests;
}

test("uses delegated FastAPI credentials and applies host theme updates", async ({ page, request }) => {
  await request.delete(`${E2E_API_ORIGIN}/__requests`);
  await page.goto("http://127.0.0.1:4274/");
  const application = page.frameLocator('iframe[title="Alpaca Connectors"]');
  await expect(application.getByRole("heading", { name: "Register Alpaca-backed assets" })).toBeVisible();
  await expect(application.locator("html")).toHaveAttribute("data-theme-id", "main-sequence-space");

  // Every API request through the Command Center transport carries the delegated credential.
  const requests = await fixtureRequestLog(request);
  expect(requests.length).toBeGreaterThan(0);
  for (const entry of requests) {
    expect(entry).toMatchObject({
      authorization: "Bearer synthetic-delegated-token",
      resourceReleaseUid: "11111111-1111-4111-8111-111111111111",
    });
  }

  await page.evaluate(() => (window as typeof window & { switchTheme(): void }).switchTheme());
  await expect(application.locator("html")).toHaveAttribute("data-theme-id", "quartz-light");
});

// The fixture API's configuration names these (connector ee18b82); the site's build names neither.
const SITE_AGENT_UID = "22222222-2222-4222-8222-222222222222";
const SITE_ENVIRONMENT_UID = "33333333-3333-4333-8333-333333333333";

interface HostPlatformRequest {
  method: string;
  path: string;
  userUid: string;
  body: string | null;
}

async function setSiteAgent(request: APIRequestContext, agentUid: string | null) {
  await request.post(`${E2E_API_ORIGIN}/__site-agent`, { data: { agent_uid: agentUid } });
}

async function hostPlatformRequests(page: Page): Promise<HostPlatformRequest[]> {
  return page.evaluate(() => (window as typeof window & { platformRequests: HostPlatformRequest[] }).platformRequests);
}

test("opens the Alpaca Agent that the API's configuration names in Command Center AI's rail", async ({ page, request }) => {
  await setSiteAgent(request, SITE_AGENT_UID);
  // The host fixture's frame is 900px tall; the launcher sits at its bottom right.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("http://127.0.0.1:4274/");
  const application = page.frameLocator('iframe[title="Alpaca Connectors"]');
  await application.getByRole("link", { name: /^Accounts/ }).click();
  await expect(application.getByRole("heading", { name: "Alpaca account registrations" })).toBeVisible();

  const launcher = application.getByRole("button", { name: "Ask Alpaca Agent" });
  await expect(launcher).toBeVisible();
  // A visit that does not open the conversation creates no session.
  expect((await hostPlatformRequests(page)).filter((entry) => entry.method !== "GET")).toEqual([]);
  await launcher.click();
  // Below 1400px the rail floats over the page.
  const rail = application.getByRole("region", { name: "Alpaca Agent" });
  await expect(rail).toBeVisible();
  await expect(rail).toHaveAttribute("data-chat-rail", "overlay");
  await expect(launcher).toHaveCount(0);

  // The conversation opens the default session of the API's Agent, through the host, as the host's
  // person, and scopes its platform reads to the API's Environment.
  await expect
    .poll(async () => (await hostPlatformRequests(page)).map((entry) => `${entry.method} ${entry.path}`))
    .toContain(`POST /api/v1/agents/${SITE_AGENT_UID}/sessions/get-or-create-session/`);
  const platformRequests = await hostPlatformRequests(page);
  const sessionRequest = platformRequests.find((entry) => entry.path.endsWith("/get-or-create-session/"));
  expect(JSON.parse(sessionRequest?.body ?? "{}")).toMatchObject({ handle_unique_id: "alpaca_connectors_site" });
  for (const entry of platformRequests) {
    expect(entry.userUid).toBe("fixture-user");
    const environment = new URL(entry.path, "http://platform.invalid").searchParams.get("organization_environment_uid");
    if (environment !== null) expect(environment).toBe(SITE_ENVIRONMENT_UID);
  }
  expect(platformRequests.some((entry) => entry.path.includes(`organization_environment_uid=${SITE_ENVIRONMENT_UID}`))).toBe(true);

  // Closing keeps the page where it was and brings the launcher back.
  await rail.getByRole("button", { name: "Close chat rail" }).click();
  await expect(rail).toHaveCount(0);
  await expect(launcher).toBeVisible();
  await expect(application.getByRole("heading", { name: "Alpaca account registrations" })).toBeVisible();
});

test("docks the Alpaca Agent's rail beside the page from 1400px", async ({ page, request }) => {
  await setSiteAgent(request, SITE_AGENT_UID);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:4274/");
  const application = page.frameLocator('iframe[title="Alpaca Connectors"]');
  await expect(application.getByRole("heading", { name: "Register Alpaca-backed assets" })).toBeVisible();
  const content = application.locator(".application-content");
  const fullWidth = (await content.boundingBox())?.width ?? 0;

  await application.getByRole("button", { name: "Ask Alpaca Agent" }).click();
  const rail = application.getByRole("region", { name: "Alpaca Agent" });
  await expect(rail).toHaveAttribute("data-chat-rail", "docked");
  await expect.poll(async () => (await content.boundingBox())?.width ?? 0).toBeLessThanOrEqual(fullWidth - 540);
  await expect(application.getByRole("heading", { name: "Register Alpaca-backed assets" })).toBeVisible();
});

test("hides the assistant when the API names no Alpaca Agent and keeps every page working", async ({ page, request }) => {
  await setSiteAgent(request, null);
  try {
    await page.goto("http://127.0.0.1:4274/");
    const application = page.frameLocator('iframe[title="Alpaca Connectors"]');
    await expect(application.getByRole("heading", { name: "Register Alpaca-backed assets" })).toBeVisible();
    await application.getByRole("link", { name: /^Accounts/ }).click();
    await expect(application.getByRole("heading", { name: "Alpaca account registrations" })).toBeVisible();
    await expect(application.getByRole("button", { name: "Ask Alpaca Agent" })).toHaveCount(0);
    await expect(application.getByRole("region", { name: "Alpaca Agent" })).toHaveCount(0);
    expect(await hostPlatformRequests(page)).toEqual([]);
  } finally {
    await setSiteAgent(request, SITE_AGENT_UID);
  }
});

test("authenticates local development API requests in the dev server, not the browser", async ({ page, request }) => {
  const devServerOrigin = "http://127.0.0.1:4275";
  await request.delete(`${E2E_API_ORIGIN}/__requests`);
  const browserApiRequests: Request[] = [];
  page.on("request", (apiRequest) => {
    if (new URL(apiRequest.url()).pathname.startsWith("/v1/")) browserApiRequests.push(apiRequest);
  });

  await page.goto(`${devServerOrigin}/`);
  await expect(page.getByRole("heading", { name: "Register Alpaca-backed assets" })).toBeVisible({ timeout: 30_000 });

  // The browser calls its own development server and never holds a token.
  expect(browserApiRequests.length).toBeGreaterThan(0);
  for (const apiRequest of browserApiRequests) {
    expect(new URL(apiRequest.url()).origin).toBe(devServerOrigin);
    expect((await apiRequest.allHeaders()).authorization).toBeUndefined();
  }
  // The dev server proxy adds the session token from `mainsequence auth token` to every request.
  const requests = await fixtureRequestLog(request);
  expect(requests.map((entry) => entry.path)).toContain("/v1/project-state/configuration");
  for (const entry of requests) {
    expect(entry.authorization).toBe("Bearer synthetic-local-session-token");
  }

  // Another site open in the same browser cannot make the proxy act with the developer's token.
  for (const headers of [{ "Sec-Fetch-Site": "cross-site" }, { Origin: "https://elsewhere.example" }]) {
    const refused = await request.get(`${devServerOrigin}/v1/project-state/configuration`, { headers });
    expect(refused.status()).toBe(403);
  }
  expect((await fixtureRequestLog(request)).length).toBe(requests.length);
});

test("serves same-artifact documentation routes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^Documentation/ }).click();
  await expect(page.getByRole("heading", { name: "Application surfaces" })).toBeVisible();
  await page.getByRole("link", { name: "Project capabilities" }).first().click();
  await expect(page.getByRole("heading", { name: "Project capabilities" })).toBeVisible();
  await page.goto("/docs/surfaces/portfolios/");
  await expect(page.getByRole("heading", { name: "Portfolios", exact: true })).toBeVisible();
  await expect(page.getByText("The connector runs every portfolio on one shared portfolio Job", { exact: false })).toBeVisible();
  await page.goto("/docs/technical/frontend-implementation-plan/");
  await expect(page.getByRole("heading", { name: "Frontend implementation plan" })).toBeVisible();
});
