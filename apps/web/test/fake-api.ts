/**
 * Controllable in-process fake of the API for the browser-client tests.
 *
 * It models what matters for session safety:
 * - the "browser cookie jar" (`cookie`) is captured at the moment a request is
 *   SENT, like a real browser does; the answer belongs to that identity;
 * - every guarded answer carries the non-secret session context in the
 *   X-Session-Context header (what the real API sends after sprint 3.1);
 * - answers can be held at barriers (`hold`) so tests decide exactly when a
 *   response arrives. No timers and no sleeps are used.
 */

export type Identity = {
  sid: string;
  user: { id: string; email: string; displayName: string };
  organization: { id: string; name: string };
  role: "OWNER" | "ADMIN" | "MEMBER";
};

const person = (id: string) => ({ id, email: `${id}@test.de`, displayName: id });
const org = (id: string) => ({ id, name: `Org ${id}` });

export const ALICE: Identity = { sid: "s-alice-1", user: person("alice"), organization: org("A"), role: "OWNER" };
export const ALICE_NEW_SESSION: Identity = { ...ALICE, sid: "s-alice-2" };
export const ALICE_AS_MEMBER: Identity = { ...ALICE, role: "MEMBER" };
export const ALICE_IN_ORG_B: Identity = { ...ALICE, sid: "s-alice-b", organization: org("B") };
export const BOB: Identity = { sid: "s-bob-1", user: person("bob"), organization: org("A"), role: "MEMBER" };

export const contextOf = (i: Identity) =>
  `ctx:${i.sid}:${i.user.id}:${i.organization.id}:${i.role}`;
export const csrfOf = (i: Identity) => `csrf-${i.sid}`;

export function sessionBody(i: Identity) {
  return {
    user: i.user,
    organization: i.organization,
    role: i.role,
    csrfToken: csrfOf(i),
    contextId: contextOf(i),
    expiresAt: "2030-01-01T00:00:00.000Z",
  };
}

export type Gate = {
  /** Resolves once a request has reached the barrier (it is "in flight"). */
  reached: Promise<void>;
  /** Lets the held response go out. */
  release: () => void;
};

type Hold = {
  match: (method: string, path: string) => boolean;
  remaining: number;
  gates: { reachedResolve: () => void; released: Promise<void> }[];
  made: Gate[];
};

export class FakeApi {
  /** What the browser would send as its session cookie right now. */
  cookie: Identity | null = null;
  /** Every request seen by the server: who it was served as. */
  requests: { method: string; path: string; servedAs: Identity | null }[] = [];
  private holds: Hold[] = [];
  private version = 0;

  count(method: string, path: string) {
    return this.requests.filter((r) => r.method === method && r.path === path).length;
  }

  /**
   * Holds the next `times` requests matching `path` (and optional method) until
   * the returned gates are released. Gates are returned in arrival order.
   */
  hold(path: string, options: { method?: string; times?: number } = {}): Gate[] {
    const times = options.times ?? 1;
    const hold: Hold = {
      match: (method, requested) =>
        requested === path && (options.method ? options.method === method : true),
      remaining: times,
      gates: [],
      made: [],
    };
    for (let n = 0; n < times; n += 1) {
      let reachedResolve!: () => void;
      let release!: () => void;
      const reached = new Promise<void>((resolve) => (reachedResolve = resolve));
      const released = new Promise<void>((resolve) => (release = resolve));
      hold.gates.push({ reachedResolve, released });
      hold.made.push({ reached, release });
    }
    this.holds.push(hold);
    return hold.made;
  }

  /** Releases every barrier that is still closed (test cleanup, never hangs). */
  releaseAll() {
    for (const hold of this.holds) for (const gate of hold.made) gate.release();
    this.holds = [];
  }

  private takeGate(method: string, path: string) {
    for (const hold of this.holds) {
      if (hold.remaining > 0 && hold.match(method, path)) {
        const gate = hold.gates[hold.gates.length - hold.remaining];
        hold.remaining -= 1;
        return gate;
      }
    }
    return null;
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), "https://app.test");
    const path = url.pathname.replace(/^\/api\/v1/, "") + url.search;
    const method = (init?.method ?? "GET").toUpperCase();
    // The cookie is attached when the request is sent.
    const servedAs = this.cookie;
    this.requests.push({ method, path, servedAs });

    const gate = this.takeGate(method, path);
    if (gate) {
      gate.reachedResolve();
      await new Promise<void>((resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        void gate.released.then(resolve);
      });
    }
    return this.respond(method, path, init, servedAs);
  };

  private respond(method: string, path: string, init: RequestInit | undefined, servedAs: Identity | null): Response {
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
      });

    if (path === "/auth/session") {
      return servedAs
        ? json(200, sessionBody(servedAs), { "X-Session-Context": contextOf(servedAs) })
        : json(401, { statusCode: 401 });
    }
    if (path === "/auth/logout") {
      this.cookie = null;
      return json(204, null);
    }
    if (!servedAs) return json(401, { statusCode: 401 });
    const context = { "X-Session-Context": contextOf(servedAs) };

    if (method !== "GET") {
      const token = new Headers(init?.headers).get("X-CSRF-Token");
      if (token !== csrfOf(servedAs)) {
        return json(403, { statusCode: 403, message: "CSRF-Prüfung fehlgeschlagen", code: "CSRF_INVALID" });
      }
      return json(201, { ok: true, by: servedAs.user.id }, context);
    }
    if (path.startsWith("/documents/") && path.includes("/download")) {
      return new Response(`bytes-of-${servedAs.user.id}`, {
        status: 200,
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="plan.pdf"`, ...context },
      });
    }
    this.version += 1;
    return json(
      200,
      {
        secret: `data-of-${servedAs.user.id}`,
        organization: servedAs.organization.id,
        role: servedAs.role,
        version: this.version,
      },
      context,
    );
  }
}

/** Minimal browser globals (no DOM): storage, location and the fake fetch. */
export function installBrowser(api: FakeApi) {
  const storage = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    };
  };
  const browser = { reloads: 0, navigations: [] as string[] };
  Object.assign(globalThis, {
    window: {
      sessionStorage: storage(),
      localStorage: storage(),
      location: {
        reload: () => {
          browser.reloads += 1;
        },
        set href(value: string) {
          browser.navigations.push(value);
        },
      },
    },
    fetch: api.fetch,
  });
  // No cross-tab channel inside this process (it would keep the runner alive).
  Object.defineProperty(globalThis, "BroadcastChannel", { value: undefined, configurable: true });
  return browser;
}

/** Yields to the event loop so already-resolved promise chains settle (not a timer). */
export const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
