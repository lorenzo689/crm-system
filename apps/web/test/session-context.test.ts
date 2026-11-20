/**
 * Sprint 3.1: an answer may only be used by the session context it was
 * requested for. These tests drive the REAL browser client (lib/session.ts,
 * lib/auth-api.ts, lib/use-api.ts) against a controllable fake API
 * (test/fake-api.ts). Responses are held at barriers, so every interleaving is
 * explicit; nothing depends on timing.
 *
 * The security property under test: data that belongs to another user,
 * organization, role or session must never reach a consumer or the cache of
 * the page that asked, and must never be restored by a late answer.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  ALICE,
  ALICE_AS_MEMBER,
  ALICE_IN_ORG_B,
  ALICE_NEW_SESSION,
  BOB,
  FakeApi,
  csrfOf,
  installBrowser,
  sessionBody,
  settle,
  type Identity,
} from "./fake-api.ts";

const api = new FakeApi();
const browser = installBrowser(api);

const session = await import("@/lib/session");
const client = await import("@/lib/auth-api");
const cache = await import("@/lib/use-api");
const documents = await import("@/lib/documents");

type Customers = { secret: string; organization: string; role: string; version: number };
const getCustomers = () => client.apiFetch<Customers>("/customers");

/** The page is signed in as `identity`; the browser cookie matches. */
function signIn(identity: Identity) {
  api.cookie = identity;
  session.startSession(sessionBody(identity) as never);
}

const state = () => session.getSessionSnapshot();
const authenticated = () => {
  const current = state();
  assert.equal(current.status, "authenticated");
  return current as Extract<ReturnType<typeof state>, { status: "authenticated" }>;
};

afterEach(() => api.releaseAll());

beforeEach(() => {
  api.releaseAll();
  api.cookie = null;
  api.requests.length = 0;
  browser.reloads = 0;
  browser.navigations = [];
  // Fresh page: a login resets the sticky "blocked" state.
});

describe("GET requests are bound to the session context", () => {
  it("1. user A -> user B before the request is sent: B's data never reaches the page", async () => {
    signIn(ALICE);
    api.cookie = BOB; // another tab signed in; this tab does not know yet

    await assert.rejects(getCustomers(), session.SessionChangedError);
    assert.equal(authenticated().identityChanged, true, "the page is blocked");
  });

  it("1b. the same holds for streamed / raw requests (documents, reports)", async () => {
    signIn(ALICE);
    api.cookie = BOB;
    await assert.rejects(
      client.apiFetchRaw("/documents/d1/download"),
      session.SessionChangedError,
    );
  });

  it("2. user A -> user B while a GET is in flight: the late answer is discarded", async () => {
    signIn(ALICE);
    const [gate] = api.hold("/customers");
    const pending = assert.rejects(getCustomers(), session.SessionChangedError);
    await gate.reached;

    api.cookie = BOB;
    await session.loadSession({ force: true }); // the page learns about B
    gate.release(); // the answer (served as A) arrives afterwards

    await pending;
    assert.equal(authenticated().identityChanged, true);
  });

  it("3. same user, organization A -> B: blocked, no data from the other organization", async () => {
    signIn(ALICE);
    api.cookie = ALICE_IN_ORG_B;
    await assert.rejects(getCustomers(), session.SessionChangedError);
    assert.equal(authenticated().identityChanged, true);
  });

  it("4. same user, OWNER -> MEMBER: the page adopts the new role and re-requests once", async () => {
    signIn(ALICE);
    api.cookie = ALICE_AS_MEMBER; // role changed on the server

    const result = await getCustomers();

    assert.equal(result.role, "MEMBER", "only data served under the new role is used");
    assert.equal(authenticated().session.role, "MEMBER", "the page state follows the role");
    assert.equal(authenticated().identityChanged, false, "same person: not blocked");
    assert.equal(api.count("GET", "/customers"), 2, "exactly one retry");
    assert.equal(api.count("GET", "/auth/session"), 1);
  });

  it("5. a new session of the same user during requests: the page takes over the new session and its CSRF token", async () => {
    signIn(ALICE);
    api.cookie = ALICE_NEW_SESSION;

    const result = await getCustomers();

    assert.equal(result.role, "OWNER");
    assert.equal(authenticated().session.csrfToken, csrfOf(ALICE_NEW_SESSION));
    assert.equal(authenticated().identityChanged, false);
  });

  it("6. a permission change while a request is in flight: the old answer is dropped, the request is repeated under the new role", async () => {
    signIn(ALICE);
    const [gate] = api.hold("/customers");
    const pending = getCustomers();
    await gate.reached; // in flight, served under the OWNER role

    api.cookie = ALICE_AS_MEMBER;
    await session.loadSession({ force: true }); // the page now knows it is MEMBER
    gate.release();

    const result = await pending;
    assert.equal(result.role, "MEMBER", "the OWNER-era answer is never delivered");
  });

  it("7. logout during five parallel GETs: none of them delivers data", async () => {
    signIn(ALICE);
    const gates = api.hold("/customers", { times: 5 });
    const outcomes = Array.from({ length: 5 }, () => getCustomers().then(
      () => "delivered",
      (error: unknown) => (error instanceof session.SessionChangedError ? "discarded" : `error:${String(error)}`),
    ));
    await Promise.all(gates.map((gate) => gate.reached));

    await session.logout();
    for (const gate of gates) gate.release();

    assert.deepEqual(await Promise.all(outcomes), Array(5).fill("discarded"));
    assert.deepEqual(browser.navigations, ["/login"]);
  });
});

describe("session revalidation with overlapping requests", () => {
  it("8a. an older answer cannot overwrite a newer session (reordered responses)", async () => {
    signIn(ALICE);
    const [older, newer] = api.hold("/auth/session", { times: 2 });

    const first = session.loadSession({ force: true }); // sent as session 1
    await older.reached;
    api.cookie = ALICE_NEW_SESSION;
    const second = session.loadSession({ force: true }); // sent as session 2
    await newer.reached;

    newer.release();
    await second;
    assert.equal(authenticated().session.csrfToken, csrfOf(ALICE_NEW_SESSION));
    older.release();
    await first;

    assert.equal(authenticated().session.csrfToken, csrfOf(ALICE_NEW_SESSION), "the newer session wins");
  });

  it("8b. an older 401 cannot sign out a newer valid session", async () => {
    api.cookie = null;
    session.startSession(sessionBody(ALICE) as never);
    api.cookie = null; // cookie missing at the moment the first check is sent
    const [older, newer] = api.hold("/auth/session", { times: 2 });

    const first = session.loadSession({ force: true }).catch(() => undefined);
    await older.reached;
    api.cookie = ALICE_NEW_SESSION;
    const second = session.loadSession({ force: true });
    await newer.reached;

    newer.release();
    await second;
    older.release();
    await first;

    assert.equal(state().status, "authenticated", "the stale 401 is ignored");
  });

  it("8c. an already detected identity change stays detected", async () => {
    signIn(ALICE);
    const [older, newer] = api.hold("/auth/session", { times: 2 });
    const first = session.loadSession({ force: true }); // sent while A
    await older.reached;
    api.cookie = BOB;
    const second = session.loadSession({ force: true }); // sent while B
    await newer.reached;

    newer.release();
    await second;
    assert.equal(authenticated().identityChanged, true);
    older.release(); // the slow answer still says "Alice"
    await first;

    assert.equal(authenticated().identityChanged, true, "a slow answer does not undo the block");
  });

  it("8d. a failing re-check never reveals foreign data", async () => {
    signIn(ALICE);
    api.cookie = BOB;
    const original = globalThis.fetch;
    // The context check cannot be completed (network down).
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
      String(input).endsWith("/auth/session")
        ? Promise.reject(new TypeError("network down"))
        : original(input, init)) as typeof fetch;
    try {
      await assert.rejects(getCustomers(), session.SessionChangedError);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("the API cache is isolated per session context", () => {
  it("9. prefetch under A, login as B: B never reads A's entry", async () => {
    signIn(ALICE);
    await cache.loadApi("/customers");
    assert.equal((cache.peekApi("/customers")?.data as Customers).secret, "data-of-alice");

    signIn(BOB); // sign-in as another user in this tab

    assert.equal(cache.peekApi("/customers")?.data, undefined, "A's entry is not visible to B");
    await cache.loadApi("/customers");
    assert.equal((cache.peekApi("/customers")?.data as Customers).secret, "data-of-bob");
  });

  it("10. an entry does not survive logout and a new session of the same user", async () => {
    signIn(ALICE);
    await cache.loadApi("/customers");
    await session.logout();
    signIn(ALICE_NEW_SESSION);

    assert.equal(cache.peekApi("/customers")?.data, undefined);
  });

  it("11. an answer that arrives after the context changed is not written to the cache", async () => {
    signIn(ALICE);
    const [gate] = api.hold("/customers");
    const loading = cache.loadApi("/customers");
    await gate.reached; // in flight as A

    signIn(BOB);
    gate.release();
    await loading;

    assert.equal(cache.peekApi("/customers")?.data, undefined, "A's answer is not cached under B");
  });

  it("12. an invalidation while an older request runs: the older answer cannot come back", async () => {
    signIn(ALICE);
    const off = cache.subscribeApi("/customers", () => undefined); // a mounted component
    try {
      const [older] = api.hold("/customers");
      const first = cache.loadApi("/customers", true);
      await older.reached;

      cache.invalidateApi("/customers"); // starts a fresh request that finishes first
      await settle();
      const newer = (cache.peekApi("/customers")?.data as Customers).version;

      older.release(); // the old request finishes last (and gets a higher version)
      await first;
      await settle();

      assert.equal(
        (cache.peekApi("/customers")?.data as Customers).version,
        newer,
        "the answer of the newer request stays",
      );
    } finally {
      off();
    }
  });

  it("13. invalidation does not start requests while the page is blocked", async () => {
    signIn(ALICE);
    const off = cache.subscribeApi("/customers", () => undefined);
    try {
      api.cookie = BOB;
      await assert.rejects(getCustomers(), session.SessionChangedError); // blocked now
      const before = api.requests.length;

      cache.invalidateApi("/customers");
      cache.prefetchApi("/customers");
      await settle();

      assert.equal(api.requests.length, before, "no request under the wrong context");
    } finally {
      off();
    }
  });

  it("14. a context error is not turned into a harmless load error with stale data", async () => {
    signIn(ALICE);
    await cache.loadApi("/customers"); // cached for A
    api.cookie = BOB;
    await cache.loadApi("/customers", true); // forced reload fails: context changed

    const entry = cache.peekApi("/customers");
    assert.equal(entry?.data, undefined, "no stale data stays visible");
    assert.equal(entry?.error ?? null, null, "and it is not reported as an ordinary error either");
  });
});

describe("mutations keep their CSRF protection", () => {
  it("15. a mutation sent while the cookie switched is rejected, never executed under the new identity", async () => {
    signIn(ALICE);
    api.cookie = BOB;
    await assert.rejects(
      client.apiFetch("/customers", { method: "POST", body: JSON.stringify({ name: "X" }) }),
      session.SessionChangedError,
    );
    assert.deepEqual(
      api.requests.filter((r) => r.method === "POST").map((r) => r.servedAs?.user.id),
      ["bob"],
      "the server saw exactly one attempt, which its CSRF check refused",
    );
  });
});

describe("document downloads and previews", () => {

  it("16. a download in flight while the session switches never yields the bytes", async () => {
    signIn(ALICE);
    const [gate] = api.hold("/documents/d1/download?disposition=attachment");
    const pending = assert.rejects(
      documents.fetchDocumentBlob("d1", { disposition: "attachment" }),
      session.SessionChangedError,
    );
    await gate.reached;

    api.cookie = BOB;
    await session.loadSession({ force: true }); // blocked
    gate.release();

    await pending;
  });

  it("17. a download under the right context returns the bytes and the file name", async () => {
    signIn(ALICE);
    const result = await documents.fetchDocumentBlob("d1", { disposition: "attachment" });
    assert.equal(await result.blob.text(), "bytes-of-alice");
    assert.equal(result.fileName, "plan.pdf");
  });

  it("18. a download whose answer belongs to another user is dropped", async () => {
    signIn(ALICE);
    api.cookie = BOB;
    await assert.rejects(documents.fetchDocumentBlob("d1"), session.SessionChangedError);
  });

  it("19. only PDF and plain images may be previewed from a blob URL", () => {
    assert.equal(documents.isPreviewableType("application/pdf"), true);
    assert.equal(documents.isPreviewableType("image/png"), true);
    for (const risky of ["text/html", "image/svg+xml", "application/xml", "text/xml", ""]) {
      assert.equal(documents.isPreviewableType(risky), false, risky);
    }
  });
});
