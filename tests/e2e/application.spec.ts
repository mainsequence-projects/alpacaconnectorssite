import { expect, test } from "@playwright/test";
import { assertCommandCenterPageLayout } from "@dev-mainsequence/command-center-sdk/layout/testing";

test("opens Assets in the SDK navigation shell and conforms at Command Center viewports", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Register Alpaca-backed assets" })).toBeVisible();
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
  await expect(page.getByRole("link", { name: /^Documentation/ })).toBeVisible();
  await assertCommandCenterPageLayout(page);
});

test("creates, updates, and deletes an account using Secret references", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page.getByRole("heading", { level: 1, name: "Alpaca account registrations" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Paper account/ })).toBeVisible();
  await expect(page.getByText("Credential values remain in Main Sequence")).toBeVisible();

  await page.getByLabel("Account name").fill("Live operations");
  await page.getByLabel("Environment").selectOption("live");
  await page.getByRole("button", { name: "API key Secret" }).click();
  await page.getByRole("option", { name: "ALPACA_LIVE_API_KEY" }).click();
  await page.getByRole("button", { name: "Secret key Secret" }).click();
  await page.getByRole("option", { name: "ALPACA_LIVE_SECRET_KEY" }).click();
  await page.getByRole("button", { name: "Register account" }).click();
  await expect(page.getByRole("heading", { name: "Registered Live operations." })).toBeVisible();

  let createdRow = page.getByRole("row", { name: /Live operations/ });
  await expect(createdRow.getByText("Live", { exact: true })).toBeVisible();
  await createdRow.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit account registration" })).toBeVisible();
  await page.getByLabel("Account name").fill("Live operations updated");
  await page.getByLabel("Active", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Updated Live operations updated." })).toBeVisible();

  createdRow = page.getByRole("row", { name: /Live operations updated/ });
  await expect(createdRow.getByText("Inactive", { exact: true })).toBeVisible();
  await createdRow.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove account registration" });
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(createdRow).toHaveCount(0);
});

test("plans asset registration, creates a universe, and runs it from the row", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Register Alpaca-backed assets" })).toBeVisible();
  await page.getByLabel("ETF seed").check();
  await expect(page.getByRole("heading", { name: "What ETF seed registration does" })).toBeVisible();
  await expect(page.getByText("It does not create a universe; use Universes afterward.")).toBeVisible();
  await page.getByLabel("Exact symbols").check();
  await page.getByLabel("Symbols Comma or space separated").fill("AAPL, NVDA");
  await page.getByRole("button", { name: "Build plan" }).click();
  const planProgress = page.getByRole("list", { name: "Asset registration progress" });
  await expect(page.getByRole("heading", { name: "Registration progress" })).toBeVisible();
  await expect(planProgress).toBeVisible();
  await expect(planProgress.getByText("Complete", { exact: true })).toHaveCount(5);
  await expect(planProgress.getByText("Resolve OpenFIGI identities", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registration plan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Execute approved plan" })).toBeEnabled();
  await page.getByRole("button", { name: "Execute approved plan" }).click();
  const executionProgress = page.getByRole("list", { name: "Asset registration progress" });
  await expect(executionProgress.getByText("Complete", { exact: true })).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "Registration execution" })).toBeVisible();

  await page.getByRole("link", { name: /^Universes/ }).click();
  await expect(page.getByRole("heading", { name: "Create and manage ETF holdings universes" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveAttribute("placeholder", "iShares Core S&P 500 ETF");
  await expect(page.getByLabel("ETF ticker")).toHaveAttribute("placeholder", "IVV");
  await expect(page.getByLabel("Holdings source URL")).toHaveAttribute("placeholder", /ishares-core-sp-500-etf/);
  await expect(page.getByText("It does not extract holdings.", { exact: false })).toBeVisible();
  await expect(page.getByText("Component provider", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Infer from configuration", { exact: true })).toHaveCount(0);
  await page.getByLabel("Name").fill("Dow Jones ETF holdings");
  await page.getByLabel("ETF ticker").fill("DIA");
  await page.getByLabel("Holdings source URL").fill("https://example.com/dia");
  await page.getByRole("button", { name: "Create universe" }).click();
  await expect(page.getByRole("heading", { name: "Universe created" })).toBeVisible();

  const diaRow = page.getByRole("row", { name: /Dow Jones ETF holdings/ });
  await expect(diaRow).toContainText("0");
  await diaRow.click({ button: "right" });
  const contextMenu = page.getByRole("menu", { name: "Actions for Dow Jones ETF holdings" });
  await contextMenu.getByRole("menuitem", { name: "Run", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Run" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Run", exact: true }).click();
  await expect(diaRow).toContainText("3");
});

test("lists registered universes and runs lifecycle actions from the row context menu", async ({ page }) => {
  const requestedPaths: string[] = [];
  page.on("request", (request) => requestedPaths.push(new URL(request.url()).pathname));
  await page.goto("/universes");
  await expect(page.getByRole("heading", { name: "Registered universes" })).toBeVisible();
  expect(requestedPaths).not.toContain("/v1/project-state/configuration");
  await expect(page.getByRole("columnheader", { name: "UID" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Identifier" })).toHaveCount(0);

  const ivvRow = page.getByRole("row", { name: /S&P 500 holdings/ });
  await expect(ivvRow.getByText("Active", { exact: true })).toBeVisible();
  await ivvRow.click({ button: "right" });

  let contextMenu = page.getByRole("menu", { name: "Actions for S&P 500 holdings" });
  await expect(contextMenu).toBeVisible();
  await expect(contextMenu.getByRole("menuitem", { name: "Run", exact: true })).toBeEnabled();
  await expect(contextMenu.getByRole("menuitem", { name: "Activate", exact: true })).toBeDisabled();
  await contextMenu.getByRole("menuitem", { name: "Deactivate", exact: true }).click();

  let dialog = page.getByRole("dialog", { name: "Deactivate universes" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Confirmation word").fill("DEACTIVATE");
  await dialog.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(ivvRow.getByText("Inactive", { exact: true })).toBeVisible();

  await ivvRow.click({ button: "right" });
  contextMenu = page.getByRole("menu", { name: "Actions for S&P 500 holdings" });
  await expect(contextMenu.getByRole("menuitem", { name: "Activate", exact: true })).toBeEnabled();
  await contextMenu.getByRole("menuitem", { name: "Activate", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Activate" });
  await dialog.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(ivvRow.getByText("Active", { exact: true })).toBeVisible();

  const qqqRow = page.getByRole("row", { name: /Nasdaq 100 holdings/ });
  await qqqRow.click({ button: "right" });
  contextMenu = page.getByRole("menu", { name: "Actions for Nasdaq 100 holdings" });
  await contextMenu.getByRole("menuitem", { name: "Delete" }).click();
  dialog = page.getByRole("dialog", { name: "Delete universes" });
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(qqqRow).toHaveCount(0);
});

test("creates, reads, updates, and deletes a bars configuration", async ({ page }) => {
  await page.goto("/bars");
  await expect(page.getByRole("heading", { level: 1, name: "Bars configurations" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create bars configuration" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Daily paper holdings/ })).toBeVisible();

  await page.getByLabel("Name").fill("Daily selected holdings");
  await page.getByLabel("Registered Alpaca account").selectOption("account-paper");
  await page.getByLabel("Asset source").selectOption("account_holdings");
  await page.getByLabel("Migrated bars profile").selectOption("1d/sip/all");
  await page.getByRole("button", { name: "Create configuration" }).click();
  await expect(page.getByRole("heading", { name: "Created Daily selected holdings." })).toBeVisible();

  let createdRow = page.getByRole("row", { name: /Daily selected holdings/ });
  await expect(createdRow).toContainText("Latest account holdings");
  await createdRow.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit bars configuration" })).toBeVisible();
  await page.getByLabel("Name").fill("Daily selected holdings updated");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Updated Daily selected holdings updated." })).toBeVisible();

  createdRow = page.getByRole("row", { name: /Daily selected holdings updated/ });
  await createdRow.getByRole("button", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete bars configuration" });
  await dialog.getByLabel("Confirmation word").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(createdRow).toHaveCount(0);
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
  await page.goto("/docs/technical/frontend-implementation-plan/");
  await expect(page.getByRole("heading", { name: "Frontend implementation plan" })).toBeVisible();
});
