/**
 * R2-04 regression tests: a request issued by one identity must never be
 * executed (or retried) under another identity.
 *
 * Runs the real browser client (lib/session.ts, lib/auth-api.ts) against an
 * in-process fake API that applies the server's rule: a CSRF token is valid
 * only for the session that issued it, otherwise 403 with code CSRF_INVALID.
 * Parallelism and the moment of the cookie switch are controlled explicitly.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

type Identity = {
  sid: string;
  user: { id: string; email: string; displayName: string };
  organization: { id: string; name: string };
  role: "OWNER" | "ADMIN" | "MEMBER";
};

const org = (id: string) => ({ id, name: `Org ${id}` });
const person = (id: string) => ({
  id,
  email: `${id}@test.de`,
  displayName: id,
});
const OWNER_A: Identity = { sid: "s-owner-1", user: person("owner"), organization: org("A"), role: "OWNER" };
const OWNER_A_SECOND: Identity = { ...OWNER_A, sid: "s-owner-2" };
const MEMBER_A: Identity = { sid: "s-member", user: person("member"), organization: org("A"), role: "MEMBER" };
const USER_B: Identity = { sid: "s-b", user: person("bob"), organization: org("B"), role: "OWNER" };
const OWNER_IN_ORG_B: Identity = { ...OWNER_A, sid: "s-owner-b", organization: org("B") };

const csrfOf = (identity: Identity) => `csrf-${identity.sid}`;

/** The browser's cookie jar (one session cookie) and the fake API. */
const server = {
  cookie: null as Identity | null,
  executed: [] as { path: string; as: string }[],
  mutationAttempts: 0,
  sessionReads: 0,
  /** Runs when a mutation reaches the server, before it is judged. */
  beforeMutation: null as null | (() => void),
};

function json(status: number, body: unknown) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sessionBody(identity: Identity) {
  return {
    user: identity.user,
    organization: identity.organization,
    role: identity.role,
    csrfToken: csrfOf(identity),
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/api\/v1/, "");
  const method = (init?.method ?? "GET").toUpperCase();

  if (path === "/auth/session") {
    server.sessionReads += 1;
    return server.cookie
      ? json(200, sessionBody(server.cookie))
      : json(401, { statusCode: 401, message: "Unauthorized" });
  }
  if (method === "GET") {
    return server.cookie
      ? json(200, { as: server.cookie.user.id })
      : json(401, { statusCode: 401 });
  }

  server.mutationAttempts += 1;
  server.beforeMutation?.();
  const cookie = server.cookie;
  if (!cookie) return json(401, { statusCode: 401 });
  const token = new Headers(init?.headers).get("X-CSRF-Token");
  if (token !== csrfOf(cookie)) {
    return json(403, {
      statusCode: 403,
      message: "CSRF-Prüfung fehlgeschlagen",
      code: "CSRF_INVALID",
    });
  }
  if (path === "/forbidden") {
    return json(403, { statusCode: 403, message: "Forbidden resource" });
  }
  server.executed.push({ path, as: `${cookie.user.id}|${cookie.organization.id}` });
  if (path === "/auth/logout") return json(204, null);
  return json(201, { ok: true });
}

// Minimal browser globals, installed before the client modules load.
const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
};
const browser = {
  reloads: 0,
  navigations: [] as string[],
};
Object.assign(globalThis, {
  window: {
    sessionStorage: memoryStorage(),
    localStorage: memoryStorage(),
    location: {
      reload: () => {
        browser.reloads += 1;
      },
      set href(value: string) {
        browser.navigations.push(value);
      },
    },
  },
  fetch: fakeFetch,
});
// No cross-tab channel in this process (it would keep the test runner alive).
Object.defineProperty(globalThis, "BroadcastChannel", { value: undefined, configurable: true });

const session = await import("@/lib/session");
const client = await import("@/lib/auth-api");

/** Puts the page into "signed in as `identity`" with the matching cookie. */
function signInPage(identity: Identity) {
  server.cookie = identity;
  session.startSession(sessionBody(identity));
}

const post = (path: string, body: BodyInit = JSON.stringify({ name: "Kunde" })) =>
  client.apiFetch(path, { method: "POST", body });

function identityChanged() {
  const state = session.getSessionSnapshot();
  return state.status === "authenticated" && state.identityChanged;
}

beforeEach(() => {
  server.cookie = null;
  server.executed = [];
  server.mutationAttempts = 0;
  server.sessionReads = 0;
  server.beforeMutation = null;
  browser.reloads = 0;
  browser.navigations = [];
});

describe("identity switch before a mutation is sent", () => {
  const switches: [string, Identity, Identity][] = [
    ["OWNER -> MEMBER", OWNER_A, MEMBER_A],
    ["MEMBER -> OWNER", MEMBER_A, OWNER_A],
    ["user A -> user B (other organization)", OWNER_A, USER_B],
    ["same user, organization A -> organization B", OWNER_A, OWNER_IN_ORG_B],
  ];
  for (const [name, from, to] of switches) {
    it(`${name}: aborts, never retries, executes nothing`, async () => {
      signInPage(from);
      server.cookie = to; // another tab signed in

      await assert.rejects(post("/customers"), session.SessionChangedError);
      assert.deepEqual(server.executed, []);
      assert.equal(server.mutationAttempts, 1, "no automatic retry");
      assert.equal(identityChanged(), true);
      assert.equal(browser.reloads, 0, "no reload that would discard input");
      assert.deepEqual(browser.navigations, [], "no redirect");
    });
  }

  for (const [name, path, body] of [
    ["customer creation", "/customers", JSON.stringify({ name: "Kunde" })],
    ["note creation", "/notes", JSON.stringify({ content: "Notiz" })],
    ["invoice creation", "/sales-documents", JSON.stringify({ type: "INVOICE" })],
    ["file upload (multipart)", "/documents/d1/versions", new FormData()],
  ] as const) {
    it(`${name} under a switched identity is not executed`, async () => {
      signInPage(OWNER_A);
      server.cookie = MEMBER_A;
      await assert.rejects(post(path, body), session.SessionChangedError);
      assert.deepEqual(server.executed, []);
    });
  }

  it("project edit (PATCH) under a switched identity is not executed", async () => {
    signInPage(OWNER_A);
    server.cookie = USER_B;
    await assert.rejects(
      client.apiFetch("/projects/p1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Neu" }),
      }),
      session.SessionChangedError,
    );
    assert.deepEqual(server.executed, []);
  });
});

describe("identity switch while the request is in flight", () => {
  it("cookie changes after the client check, before the server judges it: aborted", async () => {
    signInPage(OWNER_A);
    server.beforeMutation = () => {
      server.cookie = MEMBER_A;
      server.beforeMutation = null;
    };
    await assert.rejects(post("/customers"), session.SessionChangedError);
    assert.deepEqual(server.executed, []);
    assert.equal(server.mutationAttempts, 1);
  });

  it("parallel POSTs during a switch: none is executed or retried", async () => {
    signInPage(OWNER_A);
    server.cookie = MEMBER_A;
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, n) => post("/customers", JSON.stringify({ n }))),
    );
    for (const result of results) {
      assert.equal(result.status, "rejected");
      assert.ok(
        result.status === "rejected" &&
          result.reason instanceof session.SessionChangedError,
      );
    }
    assert.deepEqual(server.executed, []);
    assert.equal(server.mutationAttempts, 5, "exactly one attempt each");
  });

  it("switch right before the automatic retry: the retry is rejected and not repeated", async () => {
    // Same identity, new session: a retry is allowed ...
    signInPage(OWNER_A);
    server.cookie = OWNER_A_SECOND;
    server.beforeMutation = () => {
      // ... but on the retry the cookie already belongs to MEMBER_A.
      if (server.mutationAttempts === 2) server.cookie = MEMBER_A;
    };
    await assert.rejects(post("/customers"), (error: Error) => {
      assert.equal(error.message, "CSRF-Prüfung fehlgeschlagen");
      return true;
    });
    assert.equal(server.mutationAttempts, 2, "at most one retry, no loop");
    assert.deepEqual(server.executed, []);
  });
});

describe("allowed retry and non-retried errors", () => {
  it("stale CSRF token with unchanged identity (re-login of the same user): retried once and executed as that user", async () => {
    signInPage(OWNER_A);
    server.cookie = OWNER_A_SECOND;
    await post("/customers");
    assert.equal(server.mutationAttempts, 2);
    assert.deepEqual(server.executed, [{ path: "/customers", as: "owner|A" }]);
    assert.equal(identityChanged(), false);
  });

  it("a generic 403 (role/project) is final: no session re-read, no retry", async () => {
    signInPage(OWNER_A);
    const readsBefore = server.sessionReads;
    await assert.rejects(post("/forbidden"), /Forbidden resource/);
    assert.equal(server.mutationAttempts, 1);
    assert.equal(server.sessionReads, readsBefore);
  });

  it("GET requests are never retried", async () => {
    signInPage(OWNER_A);
    const result = await client.apiFetch<{ as: string }>("/users/me");
    assert.equal(result.as, "owner");
  });
});

describe("after an identity change", () => {
  it("every further request is blocked without reaching the server", async () => {
    signInPage(OWNER_A);
    server.cookie = MEMBER_A;
    await assert.rejects(post("/customers"), session.SessionChangedError);
    const attempts = server.mutationAttempts;

    await assert.rejects(post("/notes"), session.SessionChangedError);
    await assert.rejects(client.apiFetch("/users/me"), session.SessionChangedError);
    assert.equal(server.mutationAttempts, attempts);
  });

  it("a background session check (other tab, focus) flags the change without reloading", async () => {
    signInPage(OWNER_A);
    server.cookie = USER_B;
    await session.loadSession({ force: true });
    assert.equal(identityChanged(), true);
    assert.equal(browser.reloads, 0);
    const state = session.getSessionSnapshot();
    assert.ok(state.status === "authenticated");
    assert.equal(state.session.user.id, "owner", "page keeps its own identity");
  });

  it("logout does not end the other identity's session", async () => {
    signInPage(OWNER_A);
    server.cookie = MEMBER_A;
    await assert.rejects(session.logout(), session.SessionChangedError);
    assert.deepEqual(server.executed, []);
    assert.deepEqual(browser.navigations, []);
  });

  it("a fresh login on this page clears the state", async () => {
    signInPage(OWNER_A);
    server.cookie = MEMBER_A;
    await assert.rejects(post("/customers"));
    signInPage(MEMBER_A);
    await post("/customers");
    assert.deepEqual(server.executed, [{ path: "/customers", as: "member|A" }]);
  });
});
