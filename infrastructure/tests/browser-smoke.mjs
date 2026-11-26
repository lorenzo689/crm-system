// Browser smoke test against a running staging test stack (HTTPS test gateway).
//
//   STAGING_ENV_DIR=infrastructure/docker/.staging-test/bos-smoke \
//   SMOKE_CHROME=<chromium> node infrastructure/tests/browser-smoke.mjs
//
// Needs `playwright-core` resolvable (e.g. NODE_PATH to a scratch install).
// Uses only synthetic data. Exit code 0 if every check passes.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { chromium } from "playwright-core";

const dir = process.env.STAGING_ENV_DIR;
const env = Object.fromEntries(
  readFileSync(`${dir}/env`, "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const origin = env.STAGING_ORIGIN;
const host = new URL(origin).hostname;
const password = env.TEST_ADMIN_PASSWORD;
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch({
  executablePath: process.env.SMOKE_CHROME,
  headless: true,
  args: [`--host-resolver-rules=MAP ${host} 127.0.0.1`],
});
// The test gateway uses a private CA; production uses the tailnet certificate.
const context = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
const page = await context.newPage();
const cspViolations = [];
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const text = message.text();
  if (/Content Security Policy|Refused to (load|execute|apply|connect)/i.test(text)) cspViolations.push(text);
  else consoleErrors.push(text);
});

try {
  await page.goto(`${origin}/login`);
  await page.fill("#email", "admin@staging.test");
  await page.fill("#password", password);
  await Promise.all([
    page.waitForURL(/\/(dashboard|tasks|calendar|projects)/, { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);
  check("login through the private HTTPS origin", true, page.url());

  const cookie = (await context.cookies()).find((c) => c.name === "__Host-bissinger_session");
  check("cookie __Host-bissinger_session is Secure + HttpOnly + Lax", Boolean(cookie?.secure && cookie.httpOnly && cookie.sameSite === "Lax"));
  check("no JWT in web storage", !(await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))).includes("eyJ"));

  await page.reload();
  await page.waitForLoadState("networkidle");
  check("reload keeps the session", /\/dashboard/.test(page.url()), page.url());

  // Synthetic customer + document through the app's own API client rules.
  const created = await page.evaluate(async () => {
    const session = await (await fetch("/api/v1/auth/session")).json();
    const headers = { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken };
    const customer = await (await fetch("/api/v1/customers", { method: "POST", headers, body: JSON.stringify({ name: "Browser Kunde", customerNumber: `K-${Date.now() % 100000000}` }) })).json();
    const document = await (await fetch("/api/v1/documents", { method: "POST", headers, body: JSON.stringify({ title: "Browser Plan", type: "PLAN", customerId: customer.id }) })).json();
    return { customerId: customer.id, documentId: document.id, csrf: session.csrfToken };
  });
  check("CSRF-protected mutations from the page", Boolean(created.customerId && created.documentId));

  // Upload and download run inside the page (real browser fetch, same origin,
  // session cookie + CSRF header), not through Node.
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(64 * 1024, 7), Buffer.from("\n%%EOF\n")]);
  const uploadStatus = await page.evaluate(
    async ({ id, csrf, bytes }) => {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), "browser.pdf");
      const response = await fetch(`/api/v1/documents/${id}/versions`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrf },
        body: form,
      });
      return response.status;
    },
    { id: created.documentId, csrf: created.csrf, bytes: [...pdf] },
  );
  check("upload from the browser session", uploadStatus === 201, `status ${uploadStatus}`);

  await page.goto(`${origin}/customers`);
  await page.locator("text=Browser Kunde >> visible=true").first().waitFor({ timeout: 60000 });
  check("customers page renders the new customer", true);

  const downloaded = await page.evaluate(async (id) => {
    const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const attachment = await fetch(`/api/v1/documents/${id}/download?disposition=attachment`);
    const digest = toHex(await crypto.subtle.digest("SHA-256", await attachment.arrayBuffer()));
    const inline = await fetch(`/api/v1/documents/${id}/download?disposition=inline`);
    return {
      status: attachment.status,
      digest,
      inlineStatus: inline.status,
      inlineCsp: inline.headers.get("content-security-policy") ?? "",
    };
  }, created.documentId);
  const expected = createHash("sha256").update(pdf).digest("hex");
  check("download in the browser session is byte-identical", downloaded.status === 200 && downloaded.digest === expected);
  check("inline PDF preview allowed for the app itself", downloaded.inlineStatus === 200 && /frame-ancestors 'self'/.test(downloaded.inlineCsp));

  await page.goto(`${origin}/assistant`);
  await page.waitForLoadState("networkidle");
  await page.goto(`${origin}/dashboard`);
  await page.waitForLoadState("networkidle");
  check("no CSP violations while using the app", cspViolations.length === 0, cspViolations.slice(0, 3).join(" | "));
} catch (error) {
  check("browser smoke completed", false, String(error).slice(0, 300));
} finally {
  await browser.close();
  if (consoleErrors.length) console.log("other console errors:", consoleErrors.slice(0, 5));
  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
