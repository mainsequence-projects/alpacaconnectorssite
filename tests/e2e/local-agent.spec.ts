import { expect, test } from "@playwright/test";

const LOCAL_SITE = "http://127.0.0.1:4276";
const FIXTURE = "http://127.0.0.1:4274";

test("local chat uses SDK proxy without a platform Agent UID, session or fallback", async ({ page, request }) => {
  await page.route("**/v1/project-state/configuration", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), agent_uid: null } });
  });
  const urls: string[] = [];
  page.on("request", (entry) => urls.push(entry.url()));
  await page.goto(`${LOCAL_SITE}/accounts`);
  await page.getByRole("button", { name: "Ask Alpaca Agent" }).click();
  const rail = page.getByRole("region", { name: "Alpaca Agent" });
  await expect(rail).toBeVisible();
  await expect(rail).toContainText("Alpaca tools pending TAU #102");
  await expect.poll(() => urls.filter((url) => url.endsWith("/__agent__/ready")).length).toBeGreaterThan(0);
  await expect.poll(() => urls.filter((url) => url.includes("/__agent__/api/local/v1/chat-sessions")).length).toBeGreaterThan(0);
  expect(urls.filter((url) => /__mainsequence__|get-or-create-session|resolve-runtime-access|users\/me/.test(url))).toEqual([]);
  const entries = (await (await request.get(`${FIXTURE}/__requests`)).json()).requests as Array<{path: string; authorization: string | null}>;
  const agentEntries = entries.filter((entry) => entry.path === "/ready" || entry.path.startsWith("/api/local/"));
  expect(agentEntries.length).toBeGreaterThan(0);
  for (const entry of agentEntries) expect(entry.authorization).toBeNull();
});

test("an unavailable local Agent stays an error and never opens a deployed session", async ({ page }) => {
  const paths: string[] = [];
  page.on("request", (entry) => paths.push(new URL(entry.url()).pathname));
  await page.route("**/__agent__/ready", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, detail: "Local Agent offline" }),
  }));
  await page.goto(`${LOCAL_SITE}/accounts`);
  await page.getByRole("button", { name: "Ask Alpaca Agent" }).click();
  await expect(page.getByRole("region", { name: "Alpaca Agent" })).toContainText("Local Agent offline");
  expect(paths.filter((path) => /__mainsequence__|get-or-create-session|resolve-runtime-access/.test(path))).toEqual([]);
});

test("SDK local proxy rejects cross-origin calls and internal routes", async ({ request }) => {
  const foreign = await request.get(`${LOCAL_SITE}/__agent__/ready`, { headers: { Origin: "http://foreign.invalid" } });
  expect(foreign.status()).toBe(403);
  const internal = await request.get(`${LOCAL_SITE}/__agent__/internal/runtime/bootstrap`);
  expect(internal.status()).toBe(404);
  const identity = await request.get(`${LOCAL_SITE}/__agent__/api/local/v1/agent`, {
    headers: { Authorization: "Bearer synthetic-browser-value", Cookie: "synthetic=test" },
  });
  expect(identity.status()).toBe(200);
  const entries = (await (await request.get(`${FIXTURE}/__requests`)).json()).requests;
  expect(entries.filter((entry: {path: string}) => entry.path === "/api/local/v1/agent").at(-1).authorization).toBeNull();
});
