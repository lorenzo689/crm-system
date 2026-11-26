// Reproduction scripts from the security sprint 2 review (not part of CI).
// Needs: API on localhost:4000 against an ISOLATED database (bissinger_os_smoke,
// seeded with owner@smoke.test / member@smoke.test, project 5555...), Next dev
// on localhost:3000, `npm i playwright-core` in a scratch folder and
// SMOKE_CHROME=<path to chromium>. Never run against real company data.
// Mind the login rate limit (5/min per IP) when running probes back to back.
//
// Browser smoke test for security sprint 2 (cookie sessions, CSRF).
// Runs against the isolated bissinger_os_smoke database only.
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const WEB = "http://localhost:3000";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const PASSWORD = "Smoke!Passw0rd-2026";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.SMOKE_CHROME,
  headless: true,
});
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

async function storageDump() {
  return page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
    cookie: document.cookie,
  }));
}
const looksLikeJwt = (s) => /eyJ[\w-]+\.[\w-]+\.[\w-]+/.test(s);

async function login(email) {
  await page.goto(`${WEB}/login`);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await Promise.all([
    page.waitForURL(/\/(dashboard|tasks|calendar|projects)/, { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);
}

try {
  // 0. Legacy token left from the old client is removed on first load.
  await page.goto(`${WEB}/login`);
  await page.evaluate(() => localStorage.setItem("accessToken", "legacy.jwt.value"));
  await page.reload();
  await page.waitForLoadState("networkidle");
  check(
    "legacy accessToken removed from localStorage",
    (await page.evaluate(() => localStorage.getItem("accessToken"))) === null,
  );

  // 1. Unauthenticated access to a protected page redirects to /login, no flash.
  await page.goto(`${WEB}/dashboard`);
  await page.waitForURL(/\/login/, { timeout: 60000 });
  check("protected page without session -> /login", page.url().includes("/login"));

  // 2. Login -> dashboard
  await login("owner@smoke.test");
  check("login lands on app page", /\/dashboard/.test(page.url()), page.url());

  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === "bissinger_session");
  check("session cookie present", Boolean(session));
  check("session cookie HttpOnly", session?.httpOnly === true);
  check("session cookie SameSite=Lax", session?.sameSite === "Lax");
  check("session cookie host-only (no Domain)", session?.domain === "localhost");
  let dump = await storageDump();
  check("document.cookie does not expose the session", !dump.cookie.includes("bissinger_session"));
  check(
    "no JWT in localStorage/sessionStorage",
    !looksLikeJwt(JSON.stringify(dump.local)) && !looksLikeJwt(JSON.stringify(dump.session)),
    JSON.stringify({ local: Object.keys(dump.local), session: Object.keys(dump.session) }),
  );

  // 3. Reload keeps the session
  await page.reload();
  await page.waitForLoadState("networkidle");
  check("reload keeps the user on the dashboard", /\/dashboard/.test(page.url()), page.url());

  // 4. Customers
  await page.goto(`${WEB}/customers`);
  await page.locator("text=Smoke Kunde >> visible=true").first().waitFor({ timeout: 60000 });
  check("customers page lists the customer", true);

  // 5. Project + upload (multipart with CSRF header)
  await page.goto(`${WEB}/projects/${PROJECT_ID}`);
  await page.locator("text=Smoke Projekt >> visible=true").first().waitFor({ timeout: 60000 });
  check("project page loads", true);
  const uploadRequests = [];
  page.on("request", (r) => {
    if (r.url().includes("/versions") && r.method() === "POST") {
      uploadRequests.push(r.headers());
    }
  });
  await page.getByRole("button", { name: "Dokumente", exact: true }).click();
  await page.getByRole("button", { name: /hochladen/i }).first().click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "smoke.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%smoke\n1 0 obj<<>>endobj\n%%EOF\n"),
  });
  await page.locator('form input[type="text"]').first().fill("Smoke-Dokument");
  const uploadResponse = page.waitForResponse(
    (r) => r.url().includes("/versions") && r.request().method() === "POST",
    { timeout: 60000 },
  );
  await page.locator('form button[type="submit"]').click();
  const uploaded = await uploadResponse;
  check("multipart upload succeeds", uploaded.status() === 201, `status ${uploaded.status()}`);
  check(
    "upload carried X-CSRF-Token and no Authorization header",
    Boolean(uploadRequests[0]?.["x-csrf-token"]) && !uploadRequests[0]?.authorization,
  );
  await page.locator("text=Smoke-Dokument >> visible=true").first().waitFor({ timeout: 60000 });
  check("uploaded document is listed", true);

  // 6. CSRF from the page context without the token is rejected
  const forged = await page.evaluate(async () => {
    const r = await fetch("http://localhost:4000/api/v1/customers", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Forged", customerNumber: "K-9999" }),
    });
    return r.status;
  });
  check("mutation without CSRF token -> 403", forged === 403, `status ${forged}`);

  // 7. Logout (second tab first, to check device independence afterwards)
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto(`${WEB}/login`);
  await other.fill("#email", "owner@smoke.test");
  await other.fill("#password", PASSWORD);
  await Promise.all([
    other.waitForURL(/\/dashboard/, { timeout: 60000 }),
    other.click('button[type="submit"]'),
  ]);

  await page.goto(`${WEB}/settings`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Sitzung/ }).first().click();
  const logoutButtons = page.getByRole("button", { name: "Abmelden" });
  const logoutResponse = page.waitForResponse((r) => r.url().endsWith("/auth/logout"));
  await logoutButtons.last().click();
  const loggedOut = await logoutResponse;
  await page.waitForURL(/\/login/, { timeout: 60000 });
  check("logout returns 204 and lands on /login", loggedOut.status() === 204, `status ${loggedOut.status()}`);
  const afterLogout = (await context.cookies()).find((c) => c.name === "bissinger_session");
  check("session cookie removed after logout", !afterLogout);

  await page.goto(`${WEB}/dashboard`);
  await page.waitForURL(/\/login/, { timeout: 60000 });
  check("dashboard after logout -> /login", page.url().includes("/login"));

  const otherStatus = await other.evaluate(async () =>
    (await fetch("http://localhost:4000/api/v1/auth/session", { credentials: "include" })).status,
  );
  check("other device stays signed in", otherStatus === 200, `status ${otherStatus}`);

  // 8. Login again, as a MEMBER this time (user switch, role-based UI)
  await login("member@smoke.test");
  const sessionInfo = await page.evaluate(async () =>
    (await fetch("http://localhost:4000/api/v1/auth/session", { credentials: "include" })).json(),
  );
  check(
    "re-login as another user reports that user and role",
    sessionInfo.user?.email === "member@smoke.test" && sessionInfo.role === "MEMBER",
    `${sessionInfo.user?.email} ${sessionInfo.role}`,
  );
  await page.goto(`${WEB}/finance`);
  await page.locator("text=Kein Zugriff >> visible=true").first().waitFor({ timeout: 60000 });
  check("member sees access-denied on finance", true);
  dump = await storageDump();
  check(
    "still no JWT in browser storage",
    !looksLikeJwt(JSON.stringify(dump.local)) && !looksLikeJwt(JSON.stringify(dump.session)),
  );

  await otherContext.close();
} catch (error) {
  check("smoke run completed", false, String(error).slice(0, 300));
  await page.screenshot({ path: "smoke-failure.png", fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  writeFileSync("smoke-results.json", JSON.stringify({ results, consoleErrors }, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (consoleErrors.length) console.log("console errors:", consoleErrors.slice(0, 10));
  process.exit(failed ? 1 : 0);
}
