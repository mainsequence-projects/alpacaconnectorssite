import { expect, test, type Locator, type Page } from "@playwright/test";
import { assertCommandCenterPageLayout } from "@dev-mainsequence/command-center-sdk/layout/testing";

async function selectRowAction(page: Page, row: Locator, label: string) {
  await row.getByRole("button", { name: "Actions", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Actions", exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: label, exact: true }).click();
}

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
  await expect(page.getByRole("link", { name: /^Universes/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Bars/ })).toBeVisible();
  await expect(navigation.getByText("Portfolios", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^ETF Weight Signals/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Rebalance Configurations/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^ETF Portfolios/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Documentation/ })).toBeVisible();
  await assertCommandCenterPageLayout(page);
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
  await expect(review.getByText(/^ALPACA_CONNECTORS__ACCOUNT-\d+__ALPACA_LIVE__API_KEY$/)).toBeVisible();
  await expect(review.getByText(/^ALPACA_CONNECTORS__ACCOUNT-\d+__ALPACA_LIVE__SECRET_KEY$/)).toBeVisible();
  await expect(review.getByText("Create", { exact: true })).toHaveCount(2);
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

test("edits, rotates, inspects, and removes a managed account", async ({ page, request }) => {
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

  await row.getByRole("button", { name: "Edit" }).click();
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

  await row.getByRole("button", { name: "Edit" }).click();
  await newApiKey.fill(ROTATED_API_KEY);
  await expect(form.getByText("Enter both the new API key and the new secret key", { exact: false })).toBeVisible();
  await expect(saveChanges).toBeDisabled();
  await form.getByRole("button", { name: "Cancel edit" }).click();
  await row.getByRole("button", { name: "Edit" }).click();
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
  await row.getByRole("button", { name: "Edit" }).click();
  await expect(newApiKey).toHaveValue("");
  await expect(newSecretKey).toHaveValue("");
  await form.getByRole("button", { name: "Cancel edit" }).click();

  await row.getByText("Rotation desk renamed", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Rotation desk renamed" })).toBeVisible();
  await expect(page.getByText("Stored by this application", { exact: true })).toBeVisible();
  await expect(page.getByText(`ALPACA_CONNECTORS__${created.unique_identifier}__API_KEY`, { exact: true })).toBeVisible();
  await expect(page.getByText(`ALPACA_CONNECTORS__${created.unique_identifier}__SECRET_KEY`, { exact: true })).toBeVisible();
  await expect(page.getByText("Credentials updated", { exact: true })).toBeVisible();
  await expect(page.getByText(ROTATED_API_KEY)).toHaveCount(0);
  await page.getByRole("button", { name: "Back to accounts" }).click();

  await row.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove account registration" });
  await expect(dialog).toContainText("delete its stored credentials");
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByText(
    `Deleted stored credential Secrets: ALPACA_CONNECTORS__${created.unique_identifier}__API_KEY`,
    { exact: false },
  )).toBeVisible();
  expectNoCredentialLeak(requestUrls, [ROTATED_API_KEY, ROTATED_SECRET_KEY]);
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
        api_key_secret_name: "ALPACA_CONNECTORS__PA0000000003__ALPACA_PAPER__API_KEY",
        secret_key_secret_name: "ALPACA_CONNECTORS__PA0000000003__ALPACA_PAPER__SECRET_KEY",
        secret_writes: [
          { name: "ALPACA_CONNECTORS__PA0000000003__ALPACA_PAPER__API_KEY", action: "update" },
          { name: "ALPACA_CONNECTORS__PA0000000003__ALPACA_PAPER__SECRET_KEY", action: "update" },
        ],
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
  await expect(review.getByText("Update", { exact: true })).toHaveCount(2);
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
  await expect(page.getByText("External Main Sequence Secrets", { exact: true })).toBeVisible();
  await expect(page.getByText("ALPACA_PAPER_API_KEY", { exact: true })).toBeVisible();
  await expect(page.getByText("ALPACA_PAPER_SECRET_KEY", { exact: true })).toBeVisible();
  await expect(page.getByText("Not recorded", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest holdings" })).toBeVisible();
  await expect(page.getByRole("row", { name: /AAPL/ })).toContainText("125");
  await expect(page.getByRole("row", { name: /USD/ })).toContainText("25,000");
  expect(holdingsRequests).toHaveLength(1);
  expect(holdingsRequests[0].pathname).toBe("/v1/accounts/account-paper/holdings/latest");

  await page.getByRole("button", { name: "Back to accounts" }).click();
  await expect(page.getByRole("row", { name: /Paper account/ })).toBeVisible();
});

test("plans asset registration, creates a universe, and extracts its components", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Register Alpaca-backed assets" })).toBeVisible();
  await page.getByRole("button", { name: "Registered Alpaca account" }).click();
  await page.getByRole("option", { name: /Paper account/ }).click();
  await expect(page.getByLabel("ETF seed")).toHaveCount(0);
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

  await page.getByRole("link", { name: /^Universes/ }).click();
  await expect(page.getByRole("heading", { name: "Create and manage ETF holdings universes" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveAttribute("placeholder", "iShares Core S&P 500 ETF");
  await expect(page.getByLabel("ETF ticker")).toHaveAttribute("placeholder", "IVV");
  await expect(page.getByLabel("Holdings source URL")).toHaveAttribute("placeholder", /ishares-core-sp-500-etf/);
  await expect(page.getByText("missing components need provider-backed registration", { exact: false })).toBeVisible();
  await expect(page.getByText("Component provider", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Infer from configuration", { exact: true })).toHaveCount(0);
  await page.getByLabel("Name").fill("Dow Jones ETF holdings");
  await page.getByLabel("ETF ticker").fill("DIA");
  await page.getByLabel("Holdings source URL").fill("https://example.com/dia");
  await page.getByRole("button", { name: "Create universe" }).click();
  await expect(page.getByRole("heading", { name: "Universe created" })).toBeVisible();
  const creationResult = page.getByRole("heading", { name: "Universe created" }).locator("../..");
  await expect(creationResult).toContainText("Universe UID universe-dia");
  await expect(creationResult).toContainText("Source UID source-dia");
  await expect(creationResult).toContainText("Asset Category UID category-dia");

  const diaRow = page.getByRole("row", { name: /Dow Jones ETF holdings/ });
  await expect(diaRow).toContainText("0");
  await selectRowAction(page, diaRow, "Extract components");
  const dialog = page.getByRole("dialog", { name: "Extract universe components" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("This action does not update market-data bars.", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Alpaca account for component extraction" }).click();
  await page.getByRole("option", { name: /Paper account/ }).click();
  await dialog.getByRole("button", { name: "Extract components", exact: true }).click();
  await expect(diaRow).toContainText("3");
});

test("lists registered universes and runs lifecycle actions from the row action menu", async ({ page }) => {
  const requestedPaths: string[] = [];
  page.on("request", (request) => requestedPaths.push(new URL(request.url()).pathname));
  await page.goto("/universes");
  await expect(page.getByRole("heading", { name: "Registered universes" })).toBeVisible();
  expect(requestedPaths).not.toContain("/v1/project-state/configuration");
  await expect(page.getByRole("columnheader", { name: "UID" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Symbol" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Alpaca Account" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Identifier" })).toHaveCount(0);

  const ivvRow = page.getByRole("row", { name: /S&P 500 holdings/ });
  await expect(ivvRow.getByText("Active", { exact: true })).toBeVisible();
  await ivvRow.getByRole("button", { name: "Actions", exact: true }).click();
  let actionMenu = page.getByRole("menu", { name: "Actions", exact: true });
  await expect(actionMenu).toBeVisible();
  await expect(actionMenu.getByRole("menuitem", { name: "Extract components", exact: true })).toBeEnabled();
  await expect(actionMenu.getByRole("menuitem", { name: "Activate", exact: true })).toBeDisabled();
  await actionMenu.getByRole("menuitem", { name: "Deactivate", exact: true }).click();

  let dialog = page.getByRole("dialog", { name: "Deactivate universes" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Confirmation word").fill("DEACTIVATE");
  await dialog.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(ivvRow.getByText("Inactive", { exact: true })).toBeVisible();

  await ivvRow.getByRole("button", { name: "Actions", exact: true }).click();
  actionMenu = page.getByRole("menu", { name: "Actions", exact: true });
  await expect(actionMenu.getByRole("menuitem", { name: "Activate", exact: true })).toBeEnabled();
  await actionMenu.getByRole("menuitem", { name: "Activate", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Activate" });
  await dialog.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(ivvRow.getByText("Active", { exact: true })).toBeVisible();

  const qqqRow = page.getByRole("row", { name: /Nasdaq 100 holdings/ });
  await selectRowAction(page, qqqRow, "Delete");
  dialog = page.getByRole("dialog", { name: "Delete universes" });
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(qqqRow).toHaveCount(0);
});

test("loads a Universe detail and reuses the Assets list only after row activation", async ({ page }) => {
  const requestedPaths: string[] = [];
  page.on("request", (request) => requestedPaths.push(new URL(request.url()).pathname));

  await page.goto("/universes");
  const ivvRow = page.getByRole("row", { name: /S&P 500 holdings/ });
  await expect(ivvRow).toBeVisible();
  expect(requestedPaths).not.toContain("/v1/universes/universe-ivv");
  expect(requestedPaths).not.toContain("/v1/universes/universe-ivv/assets");

  await ivvRow.getByText("S&P 500 holdings", { exact: true }).click();

  await expect(page.getByRole("heading", { name: "S&P 500 holdings" })).toBeVisible();
  await expect(page.getByText("HOLDINGS__IVV", { exact: true })).toBeVisible();
  await expect(page.getByText("category-ivv", { exact: true })).toBeVisible();
  await expect(page.getByText("Not stored by Universe extraction", { exact: true })).toBeVisible();
  const assetList = page.getByRole("region", { name: "Registered Alpaca assets" });
  await expect(assetList).toBeVisible();
  await expect(assetList.getByRole("columnheader", { name: "Ticker", exact: true })).toBeVisible();
  await expect(assetList.getByRole("columnheader", { name: "Name", exact: true })).toBeVisible();
  await expect(assetList.getByRole("columnheader", { name: "Alpaca Asset ID", exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /AAPL Apple Inc\./ })).toBeVisible();
  await expect(page.getByRole("row", { name: /NVDA NVIDIA Corporation/ })).toBeVisible();
  expect(requestedPaths.filter((path) => path === "/v1/universes/universe-ivv")).toHaveLength(1);
  expect(requestedPaths.filter((path) => path === "/v1/universes/universe-ivv/assets")).toHaveLength(1);

  await page.getByRole("button", { name: "Back to universes" }).click();
  await expect(page.getByRole("row", { name: /S&P 500 holdings/ })).toBeVisible();
});

test("creates, reads, updates, and deletes a bars configuration", async ({ page }) => {
  let createPayload: Record<string, unknown> | null = null;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/v1/market-data/bar-configurations") {
      createPayload = request.postDataJSON() as Record<string, unknown>;
    }
  });

  await page.goto("/bars");
  await expect(page.getByRole("heading", { level: 1, name: "Bars configurations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create bars configuration" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Daily paper holdings/ })).toBeVisible();

  await page.getByLabel("Name").fill("Daily universe assets");
  await page.getByLabel("Registered Alpaca account").selectOption("account-paper");
  await page.getByRole("button", { name: "Asset source" }).click();
  await expect(page.getByRole("option", { name: /Latest account holdings/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Universe assets/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Explicit assets/ })).toBeVisible();
  await page.getByRole("option", { name: /Universe assets/ }).click();
  await expect(page.getByText("current materialized Asset Category members", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Active Universe" }).click();
  await page.getByRole("option", { name: /S&P 500 holdings/ }).click();
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
  await page.getByRole("button", { name: "Create configuration" }).click();
  await expect(page.getByRole("heading", { name: "Created Daily universe assets." })).toBeVisible();
  expect(createPayload).toMatchObject({
    account_uid: "account-paper",
    asset_source: "universe",
    asset_uids: [],
    universe_uid: "universe-ivv",
    frequency_id: "1d",
    feed: "sip",
    adjustment: "all",
  });

  let createdRow = page.getByRole("row", { name: /Daily universe assets/ });
  await expect(createdRow).toContainText("Universe assets");
  await createdRow.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit bars configuration" })).toBeVisible();
  await page.getByLabel("Name").fill("Daily universe assets updated");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Updated Daily universe assets updated." })).toBeVisible();

  createdRow = page.getByRole("row", { name: /Daily universe assets updated/ });
  await createdRow.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete bars configuration" });
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(createdRow).toHaveCount(0);
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
  await page.getByRole("button", { name: "Create configuration" }).click();

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

test("creates ETF signals that only choose whether the shared Job's scheduled run includes them", async ({ page }) => {
  const writes: { method: string; body: Record<string, unknown> }[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/v1/signal-jobs") && ["POST", "PATCH"].includes(request.method()) && !url.pathname.includes("/actions/")) {
      writes.push({ method: request.method(), body: request.postDataJSON() as Record<string, unknown> });
    }
  });

  await page.goto("/signals");
  await expect(page.getByRole("heading", { level: 1, name: "ETF Weight Signals" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "ETF Weight Signals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create signal" })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Daily IVV observation/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Scheduled Run" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Signal UID" })).toBeVisible();

  await page.getByRole("button", { name: "Create signal", exact: true }).click();
  const form = page.locator("form.workflow-form");
  await expect(page.getByRole("heading", { name: "Create signal" })).toBeVisible();
  await expect(form.getByLabel("Environment")).toHaveCount(0);
  await expect(form.getByText("Job schedule", { exact: true })).toHaveCount(0);
  await expect(form.getByText("Job resources", { exact: true })).toHaveCount(0);
  await expect(form.getByLabel("Scheduling method")).toHaveCount(0);
  await expect(form.getByLabel("CPU request")).toHaveCount(0);
  const scheduled = form.getByLabel("Include in the shared signal Job's daily scheduled run");
  await expect(scheduled).toBeChecked();
  await form.getByLabel("Signal name").fill("Scheduled IWM observation");
  await form.getByRole("button", { name: "Universe" }).click();
  await page.getByRole("option", { name: /Russell 2000 holdings/ }).click();
  await form.getByRole("button", { name: "Runtime Alpaca account" }).click();
  await page.getByRole("option", { name: /Paper account/ }).click();
  await form.getByRole("button", { name: "Create signal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Created Scheduled IWM observation." })).toBeVisible();
  expect(writes[0]).toEqual({
    method: "POST",
    body: {
      name: "Scheduled IWM observation",
      description: null,
      universe_uid: "universe-iwm",
      account_uid: "account-paper",
      scheduled: true,
    },
  });

  let createdRow = page.getByRole("row", { name: /Scheduled IWM observation/ });
  await expect(createdRow).toContainText("ready");
  await expect(createdRow).toContainText("Included");
  await selectRowAction(page, createdRow, "Run now");
  await expect(page.getByRole("heading", { name: /Scheduled IWM observation: run completed/ })).toBeVisible();

  createdRow = page.getByRole("row", { name: /Scheduled IWM observation/ });
  await selectRowAction(page, createdRow, "Edit");
  await expect(page.getByRole("heading", { name: "Edit signal" })).toBeVisible();
  await page.getByLabel("Signal name").fill("Scheduled IWM observation updated");
  await page.getByLabel("Include in the shared signal Job's daily scheduled run").uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Updated Scheduled IWM observation updated." })).toBeVisible();
  expect(writes[1].method).toBe("PATCH");
  expect(writes[1].body).toMatchObject({ name: "Scheduled IWM observation updated", scheduled: false });
  for (const retired of ["job", "enabled", "schedule_type", "cpu_request", "spot"]) {
    expect(writes[1].body).not.toHaveProperty(retired);
  }

  createdRow = page.getByRole("row", { name: /Scheduled IWM observation updated/ });
  await expect(createdRow).toContainText("Paused");
  await expect(createdRow.getByRole("button", { name: "Reconcile" })).toHaveCount(0);
  await selectRowAction(page, createdRow, "Delete");
  const dialog = page.getByRole("dialog", { name: "Delete signal" });
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(createdRow).toHaveCount(0);
});

test("shows the shared signal Job schedule read-only and pauses through the signal actions", async ({ page }) => {
  const actions: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname.startsWith("/v1/signal-jobs/signal-existing/actions/")) {
      actions.push(url.pathname.split("/").at(-1) ?? "");
    }
  });

  await page.goto("/signals");
  await page.getByRole("row", { name: /Daily IVV observation/ }).click();
  await expect(page.getByRole("heading", { name: "Daily IVV observation" })).toBeVisible();
  await expect(page.getByText("30 0 * * * · UTC", { exact: true })).toBeVisible();
  await expect(page.getByText("Included", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await expect(page.getByText("Paused", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(page.getByText("Included", { exact: true })).toBeVisible();
  expect(actions).toEqual(["pause", "resume"]);
});

test("loads and transposes the latest signal observations only after signal selection", async ({ page }) => {
  const observationRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/observations")) observationRequests.push(request.url());
  });

  await page.goto("/signals");
  await expect(page.getByRole("row", { name: /Daily IVV observation/ })).toBeVisible();
  expect(observationRequests).toHaveLength(0);

  await page.getByRole("row", { name: /Daily IVV observation/ }).click();
  await expect(page.getByRole("heading", { name: "Daily IVV observation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest signal weights" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Observation time" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "AAPL" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "MSFT" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "NVDA" })).toBeVisible();
  await expect(page.getByRole("row", { name: /2026-01-01 14:30:00 UTC/ })).toContainText("7.0000%");
  await expect(page.getByRole("row", { name: /2026-01-01 14:30:00 UTC/ })).toContainText("6.0000%");
  await expect(page.getByRole("row", { name: /2026-01-01 14:30:00 UTC/ })).toContainText("0.0000%");
  await expect(page.getByRole("row", { name: /2026-01-03 14:30:00 UTC/ })).toContainText("8.0000%");
  await expect(page.getByRole("row", { name: /2026-01-03 14:30:00 UTC/ })).toContainText("4.0000%");

  expect(observationRequests).toHaveLength(1);
  const requestUrl = new URL(observationRequests[0]);
  expect(requestUrl.pathname).toBe("/v1/signal-jobs/signal-existing/observations");
  expect(requestUrl.searchParams.get("limit")).toBe("100");

  await page.getByRole("button", { name: "Back to signals" }).click();
  await expect(page.getByRole("row", { name: /Daily IVV observation/ })).toBeVisible();
});

test("loads resolved portfolio details and value history only after portfolio selection", async ({ page }) => {
  const detailRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/v1/portfolio-configurations/portfolio-config-existing") {
      detailRequests.push(request.url());
    }
  });

  await page.goto("/portfolios");
  const row = page.getByRole("row", { name: /Daily IVV analytical portfolio/ });
  await expect(row).toBeVisible();
  expect(detailRequests).toHaveLength(0);

  await row.click();

  await expect(page.getByRole("heading", { name: "Daily IVV analytical portfolio" })).toBeVisible();
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
  await expect(page.getByText("Daily IVV observation", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("iShares Core S&P 500 ETF (IVV)", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Daily paper holdings", { exact: true }).first()).toBeVisible();
  const construction = page.locator("details").filter({ hasText: "Portfolio construction" });
  await expect(construction.getByText("CalendarEventSignal", { exact: true })).toBeVisible();
  await expect(construction.getByText("NYSE · regular session", { exact: true })).toBeVisible();
  await expect(construction.getByText("At market close", { exact: true })).toBeVisible();
  await expect(construction.getByText("Every session", { exact: true })).toBeVisible();
  await expect(page.getByText("ImmediateSignal", { exact: true })).toHaveCount(0);
  const valuation = page.locator("details").filter({ hasText: "Valuation source" });
  await valuation.locator("summary").click();
  await expect(valuation.getByText("1 day (86400 seconds)", { exact: true })).toBeVisible();
  await expect(page.getByText("Portfolio valuation cadence", { exact: true })).toHaveCount(0);
  await page.locator("details").filter({ hasText: "Execution and calendar" }).locator("summary").click();
  await expect(page.getByText("NYSE trading calendar · exchange_calendar", { exact: true })).toBeVisible();
  await expect(page.getByText("Extend latest prices to now", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Portfolio UID", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Signal UID", { exact: true })).toHaveCount(0);
  await expect(page.getByText("portfolio-existing", { exact: true })).toHaveCount(0);
  await expect(page.getByText("signal-universe-ivv", { exact: true })).toHaveCount(0);

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
  await page.getByRole("row", { name: /Daily IVV analytical portfolio/ }).click();
  await expect(page.getByRole("heading", { name: "Daily IVV analytical portfolio" })).toBeVisible();
  await expect(page.getByText("0 2 * * * · UTC", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByText("Portfolio left out of the scheduled run.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByText("Portfolio included in the scheduled run.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  expect(patches).toEqual([{ scheduled: false }, { scheduled: true }]);
});

test("creates, runs, updates, and deletes a durable ETF Portfolio Configuration", async ({ page }) => {
  await page.goto("/portfolios");
  await expect(page.getByRole("heading", { level: 1, name: "ETF Portfolios" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create portfolio" })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Daily IVV analytical portfolio/ })).toContainText("CalendarEventSignal");

  await page.getByRole("button", { name: "Create portfolio", exact: true }).click();
  const form = page.locator("form.workflow-form");
  await expect(page.getByRole("heading", { name: "Create portfolio" })).toBeVisible();
  await expect(form.getByLabel("Environment")).toHaveCount(0);
  await expect(form.getByText("persistent daily InterpolatedPrices", { exact: false })).toBeVisible();
  // The API rejects the retired price-extension and valuation-cadence fields, so the form has neither.
  await expect(form.getByRole("checkbox", { name: "Extend latest valuation prices to now" })).toHaveCount(0);
  await expect(form.getByText("Portfolio valuation cadence", { exact: false })).toHaveCount(0);
  const stalenessInput = form.getByLabel("Maximum price staleness (seconds)");
  await expect(stalenessInput).toHaveValue("86400");
  await expect(form.getByText("A price may be up to 1 day old", { exact: false })).toBeVisible();
  await expect(form.getByRole("checkbox", { name: "Stop when a required asset has no price" })).toBeChecked();
  await expect(form.getByText("no price is invented", { exact: false })).toBeVisible();
  await expect(form.getByText("It never creates timestamps", { exact: false })).toBeVisible();
  await expect(form.getByLabel("Portfolio calculation notes")).toContainText("CalendarEventSignal");
  const commissionInput = form.getByLabel("Commission fee (%)");
  await expect(commissionInput).toHaveValue("0.018");
  await expect(form.getByText("0.018% is stored and submitted as 0.00018", { exact: false })).toBeVisible();
  await expect(form.locator(".workflow-form-section").last()).toContainText("Scheduled run");
  await expect(form.getByText("Job schedule", { exact: true })).toHaveCount(0);
  await expect(form.getByLabel("CPU request")).toHaveCount(0);
  await expect(form.getByLabel("Include in the shared portfolio Job's daily scheduled run")).toBeChecked();
  await expect(form.locator(".workflow-form-section + .workflow-guidance")).toBeVisible();
  await form.getByLabel("Portfolio name").fill("Daily observed IVV portfolio");
  await form.getByRole("button", { name: "ETF weight Signal" }).click();
  await page.getByRole("option", { name: /Daily IVV observation/ }).click();
  await form.getByRole("button", { name: "Alpaca Bars Configuration" }).click();
  await page.getByRole("option", { name: /Daily paper holdings/ }).click();
  await form.getByRole("button", { name: "Rebalance Configuration" }).click();
  await page.getByRole("option", { name: /NYSE close/ }).click();
  await commissionInput.fill("0.025");
  await stalenessInput.fill("0");
  await expect(form.getByText("Enter a whole number of seconds greater than zero", { exact: false })).toBeVisible();
  await expect(form.getByRole("button", { name: "Create portfolio", exact: true })).toBeDisabled();
  await stalenessInput.fill("172800");
  await expect(form.getByText("A price may be up to 2 days old", { exact: false })).toBeVisible();
  const createRequest = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === "/v1/portfolio-configurations");
  await form.getByRole("button", { name: "Create portfolio", exact: true }).click();

  // Exactly PortfolioConfigurationCreateRequest (connector ADR 0009): no retired or unknown field.
  const expectedPortfolio = {
    name: "Daily observed IVV portfolio",
    description: null,
    signal_configuration_uid: "signal-existing",
    bars_configuration_uid: "bars-existing",
    rebalance_configuration_uid: "rebalance-nyse-close",
    upsample_frequency_id: "1d",
    intraday_bar_interpolation_rule: "ffill",
    valuation_column: "close",
    valuation_maximum_staleness_seconds: 172800,
    fail_on_missing_prices: true,
    commission_fee: 0.00025,
    scheduled: true,
  };
  expect((await createRequest).postDataJSON()).toEqual(expectedPortfolio);
  await expect(page.getByRole("heading", { name: "Created Daily observed IVV portfolio." })).toBeVisible();

  let createdRow = page.getByRole("row", { name: /Daily observed IVV portfolio/ });
  await expect(createdRow).toContainText("CalendarEventSignal");
  await selectRowAction(page, createdRow, "Run now");
  await expect(page.getByRole("heading", { name: /Daily observed IVV portfolio: JobRun/ })).toBeVisible();

  createdRow = page.getByRole("row", { name: /Daily observed IVV portfolio/ });
  await selectRowAction(page, createdRow, "Edit");
  await expect(page.getByRole("heading", { name: "Edit portfolio" })).toBeVisible();
  await expect(page.getByLabel("Maximum price staleness (seconds)")).toHaveValue("172800");
  await page.getByLabel("Portfolio name").fill("Daily observed IVV portfolio updated");
  await page.getByRole("checkbox", { name: "Stop when a required asset has no price" }).uncheck();
  const updateRequest = page.waitForRequest((request) => request.method() === "PATCH" && new URL(request.url()).pathname === "/v1/portfolio-configurations/portfolio-config-2");
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await updateRequest).postDataJSON()).toEqual({
    ...expectedPortfolio,
    name: "Daily observed IVV portfolio updated",
    fail_on_missing_prices: false,
  });
  await expect(page.getByRole("heading", { name: "Updated Daily observed IVV portfolio updated." })).toBeVisible();

  createdRow = page.getByRole("row", { name: /Daily observed IVV portfolio updated/ });
  await selectRowAction(page, createdRow, "Delete");
  const dialog = page.getByRole("dialog", { name: "Delete portfolio configuration" });
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(createdRow).toHaveCount(0);
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

test("uses delegated FastAPI credentials and applies host theme updates", async ({ page }) => {
  await page.goto("http://127.0.0.1:4274/");
  const application = page.frameLocator('iframe[title="Alpaca Connectors"]');
  await expect(application.getByRole("heading", { name: "Register Alpaca-backed assets" })).toBeVisible();
  await expect(application.locator("html")).toHaveAttribute("data-theme-id", "main-sequence-space");

  const requestState = await page.evaluate(async () => {
    const response = await fetch("/__requests");
    return response.json();
  });
  expect(requestState.requests.some((entry: { authorization: string | null }) => entry.authorization === "Bearer synthetic-delegated-token")).toBeTruthy();
  expect(requestState.requests.some((entry: { resourceReleaseUid: string | null }) => entry.resourceReleaseUid === "11111111-1111-4111-8111-111111111111")).toBeTruthy();

  await page.evaluate(() => (window as typeof window & { switchTheme(): void }).switchTheme());
  await expect(application.locator("html")).toHaveAttribute("data-theme-id", "quartz-light");
});

test("serves same-artifact documentation routes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^Documentation/ }).click();
  await expect(page.getByRole("heading", { name: "Application surfaces" })).toBeVisible();
  await page.getByRole("link", { name: "Project capabilities" }).first().click();
  await expect(page.getByRole("heading", { name: "Project capabilities" })).toBeVisible();
  await page.goto("/docs/surfaces/signals/");
  await expect(page.getByRole("heading", { name: "Signals", exact: true })).toBeVisible();
  await expect(page.getByText("The connector runs every signal on one shared signal Job", { exact: false })).toBeVisible();
  await page.goto("/docs/technical/frontend-implementation-plan/");
  await expect(page.getByRole("heading", { name: "Frontend implementation plan" })).toBeVisible();
});
