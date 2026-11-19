// Browser regression probes for security sprint 2 / 2.1 (not part of CI).
// Needs: API on localhost:4000 against an ISOLATED database (bissinger_os_smoke,
// seeded with owner@smoke.test / member@smoke.test, both CONTRIBUTOR on project
// 5555...), Next dev on localhost:3000, `npm i playwright-core` in a scratch
// folder and SMOKE_CHROME=<path to chromium>. Never run against real data.
// The login rate limit (5/min per IP) is respected by a pause before probe 4.
// Exit code 0 = every probe holds; R2-04 was the original finding.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";

const WEB = "http://localhost:3000";
const API = "http://localhost:4000/api/v1";
const PROJECT = "55555555-5555-4555-8555-555555555555";
const PASSWORD = "Smoke!Passw0rd-2026";
const BANNER = "Die Anmeldung hat sich geändert. Bitte überprüfe deine Eingaben und lade die Seite neu.";
const sql = (q) =>
  execSync(
    `docker exec docker-postgres-1 psql -U bissinger -d bissinger_os_smoke -At -c "${q.replace(/"/g, '\\"')}"`,
  )
    .toString()
    .trim();
let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`${ok ? "HOLDS    " : "BROKEN   "} ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch({ executablePath: process.env.SMOKE_CHROME, headless: true });

async function uiLogin(page, email) {
  await page.goto(`${WEB}/login`);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL(/\/(dashboard|tasks|calendar|projects)/, { timeout: 90000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function openNotes(page) {
  await page.goto(`${WEB}/projects/${PROJECT}`);
  await page.getByRole("button", { name: "Notizen", exact: true }).click();
  await page.locator("textarea").first().waitFor({ timeout: 90000 });
}

// Probe 1 (R2-04): cookie replaced behind the tab's back, then the owner submits.
{
  sql("delete from notes");
  const context = await browser.newContext();
  const page = await context.newPage();
  await uiLogin(page, "owner@smoke.test");
  await openNotes(page);
  let navigations = 0;
  page.on("framenavigated", (f) => f === page.mainFrame() && (navigations += 1));

  // A login that bypasses this tab's BroadcastChannel (frozen tab, second
  // app instance, direct API call) replaces the cookie.
  await page.evaluate(async ([api, password]) => {
    await fetch(`${api}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "member@smoke.test", password }),
    });
  }, [API, PASSWORD]);

  const statuses = [];
  page.on("response", (r) => {
    if (r.url().includes("/notes") && r.request().method() === "POST") statuses.push(r.status());
  });
  const text = "Notiz des Owners (Review-Probe)";
  await page.locator("textarea").first().fill(text);
  await page.locator('form button[type="submit"]').first().click();
  await page.getByText(BANNER).first().waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Seite neu laden" }).waitFor({ timeout: 30000 });
  const stored = sql("select count(*) from notes");
  check("R2-04: no note stored under the switched identity", stored === "0", `notes ${stored}`);
  check("R2-04: exactly one POST, no automatic retry", statuses.join(",") === "403", `statuses ${statuses.join(",")}`);
  check("banner shown, input kept, no navigation",
    (await page.locator("textarea").first().inputValue()) === text && navigations === 0,
    `navigations ${navigations}`);
  await context.close();
}

// Probe 2: back button after logout shows no protected data.
{
  const context = await browser.newContext();
  const page = await context.newPage();
  await uiLogin(page, "owner@smoke.test");
  await page.goto(`${WEB}/customers`);
  await page.locator("text=Smoke Kunde >> visible=true").first().waitFor({ timeout: 90000 });
  await page.goto(`${WEB}/settings`);
  await page.getByRole("button", { name: /Sitzung/ }).first().click();
  await Promise.all([
    page.waitForURL(/\/login/, { timeout: 90000 }),
    page.getByRole("button", { name: "Abmelden" }).last().click(),
  ]);
  await page.goBack();
  await page.waitForTimeout(3000);
  const visible = await page.locator("text=Smoke Kunde >> visible=true").count();
  check("back button after logout shows no protected data", visible === 0, page.url());
  await context.close();
}

// Probe 3: user switch in tab A; tab B keeps its input and shows the banner.
{
  const context = await browser.newContext();
  const a = await context.newPage();
  const b = await context.newPage();
  await uiLogin(a, "owner@smoke.test");
  await openNotes(b);
  await b.locator("textarea").first().fill("Ungespeicherter Entwurf");
  let reloaded = false;
  b.on("framenavigated", (f) => f === b.mainFrame() && (reloaded = true));
  await uiLogin(a, "member@smoke.test");
  await b.getByRole("button", { name: "Seite neu laden" }).waitFor({ timeout: 30000 });
  check("other tab: banner, no reload, draft kept",
    !reloaded && (await b.locator("textarea").first().inputValue()) === "Ungespeicherter Entwurf",
    `reloaded ${reloaded}`);
  await context.close();
}

await new Promise((resolve) => setTimeout(resolve, 61000));

// Probe 4: no session or CSRF token in URLs or Web Storage.
{
  const context = await browser.newContext();
  const page = await context.newPage();
  const urls = [];
  page.on("request", (r) => urls.push(r.url()));
  await uiLogin(page, "owner@smoke.test");
  await page.goto(`${WEB}/projects/${PROJECT}`);
  await page.waitForLoadState("networkidle");
  const csrf = await page.evaluate(async (api) =>
    (await (await fetch(`${api}/auth/session`, { credentials: "include" })).json()).csrfToken,
  API);
  const cookie = (await context.cookies()).find((c) => c.name === "bissinger_session")?.value ?? "";
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  const leaked = urls.filter((u) => u.includes(csrf) || (cookie && u.includes(cookie.slice(0, 40))));
  check("no session or CSRF token in URLs or Web Storage",
    leaked.length === 0 && !storage.includes(csrf) && !storage.includes("eyJ"),
    `requests ${urls.length}`);
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} probe(s) BROKEN` : "\nall probes hold");
process.exit(failures ? 1 : 0);
