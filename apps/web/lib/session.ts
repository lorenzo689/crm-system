"use client";

import type { OrganizationRole } from "@/lib/user-profile";

/**
 * Browser view of the server-side session.
 *
 * The session itself lives in an HttpOnly cookie that JavaScript can neither
 * read nor write. What is kept here, in memory only, is what the API's
 * GET /auth/session returns: who is signed in and the CSRF token for this
 * session. Nothing is put into localStorage; a reload simply asks the server
 * again.
 */
export type SessionInfo = {
  user: { id: string; email: string; displayName: string };
  organization: { id: string; name: string } | null;
  role: OrganizationRole | null;
  csrfToken: string;
  /**
   * Non-secret marker of this exact session context (session + user +
   * organization + role). The API repeats it in X-Session-Context on every
   * authenticated answer; an answer is only used while both are equal.
   */
  contextId: string;
  expiresAt: string;
};

export const SESSION_CONTEXT_HEADER = "X-Session-Context";

export type SessionState =
  | { status: "unknown" }
  | {
      status: "authenticated";
      session: SessionInfo;
      /**
       * The browser's cookie now belongs to another user or organization than
       * the one this page was built for. The page keeps showing (unsaved
       * input survives) but sends nothing anymore until it is reloaded.
       */
      identityChanged: boolean;
    }
  | { status: "anonymous" }
  | { status: "error"; message: string };

export const SESSION_CHANGED_MESSAGE =
  "Die Anmeldung hat sich geändert. Bitte überprüfe deine Eingaben und lade die Seite neu.";

/** Thrown instead of sending (or re-sending) a request under a new identity. */
export class SessionChangedError extends Error {
  constructor() {
    super(SESSION_CHANGED_MESSAGE);
    this.name = "SessionChangedError";
  }
}

/** Who a request acts as: user and organization, never just one of them. */
export function identityOf(
  session: Pick<SessionInfo, "user" | "organization">,
) {
  return `${session.user.id}|${session.organization?.id ?? ""}`;
}

export const API_URL =
  // Same-origin by default (reverse proxy serves the web app and /api/v1).
  // Local development sets NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1.
  process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

const SESSION_NOTICE_KEY = "sessionNotice";
/** Marks that this tab was signed in, so a later 401 reads as "expired". */
const HAD_SESSION_KEY = "hadSession";
/** Pre-sprint-2 storage of the JWT; removed on sight, never migrated. */
const LEGACY_TOKEN_KEY = "accessToken";
const CHANNEL_NAME = "bissinger-session";

let state: SessionState = { status: "unknown" };
let inflight: Promise<SessionInfo | null> | null = null;
/** Number of the newest loadSession request; older answers are ignored. */
let startedLoads = 0;
const listeners = new Set<() => void>();

/**
 * Session-context epoch. Everything that depends on "who is this page" (API
 * answers, cache entries, in-flight requests) is tied to the epoch it was
 * started in. The epoch advances whenever the context key changes, which also
 * aborts every request of the old context.
 */
let epoch = 0;
let contextController = new AbortController();
const contextListeners = new Set<() => void>();

function contextKeyOf(value: SessionState) {
  if (value.status === "authenticated") {
    return value.identityChanged ? "blocked" : `ctx:${value.session.contextId}`;
  }
  return value.status;
}

function setState(next: SessionState) {
  const changed = contextKeyOf(state) !== contextKeyOf(next);
  state = next;
  if (changed) {
    epoch += 1;
    const previous = contextController;
    contextController = new AbortController();
    previous.abort();
    for (const listener of contextListeners) listener();
  }
  for (const listener of listeners) listener();
}

export function getContextEpoch() {
  return epoch;
}

/** Called after the context changed (cache owners drop their entries). */
export function subscribeContext(listener: () => void) {
  contextListeners.add(listener);
  return () => {
    contextListeners.delete(listener);
  };
}

/** The page may start authenticated requests (not blocked, not signed out). */
export function canRequestData() {
  return (
    state.status === "unknown" ||
    state.status === "error" ||
    (state.status === "authenticated" && !state.identityChanged)
  );
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionSnapshot(): SessionState {
  return state;
}

const SERVER_SNAPSHOT: SessionState = { status: "unknown" };
export function getServerSessionSnapshot(): SessionState {
  return SERVER_SNAPSHOT;
}

function safeSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function purgeLegacyToken() {
  try {
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    // Storage may be blocked; there is nothing to clean up then.
  }
}

let channel: BroadcastChannel | null = null;
function getChannel() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    // Another tab logged in or out: re-read the session. A different identity
    // only raises the "identity changed" state (no reload, so unsaved input
    // survives); a logout elsewhere ends this tab's session as usual.
    channel.onmessage = () => {
      void loadSession({ force: true }).catch(() => undefined);
    };
  }
  return channel;
}

function announceSessionChange() {
  getChannel()?.postMessage("changed");
}

if (typeof window !== "undefined") {
  purgeLegacyToken();
  getChannel();
}

/**
 * Asks the server for the current session. Concurrent callers share one
 * request; `force` starts a new one (e.g. after a CSRF rejection).
 */
export function loadSession(
  options: { force?: boolean } = {},
): Promise<SessionInfo | null> {
  if (inflight && !options.force) {
    return inflight;
  }
  const seq = ++startedLoads;
  // A newer check was started (or the page signed in/out) meanwhile: this
  // answer is outdated and must neither sign anyone out nor restore anything.
  const outdated = () => seq !== startedLoads;
  const request = (async () => {
    // A failed re-check must not tear down a page that is in use; only the
    // first check (nothing rendered yet) shows the error screen.
    const fail = (message: string): never => {
      if (state.status !== "authenticated" && !outdated()) {
        setState({ status: "error", message });
      }
      throw new Error(message);
    };
    let response: Response;
    try {
      response = await fetch(`${API_URL}/auth/session`, {
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      return fail("Server nicht erreichbar. Bitte Verbindung prüfen.");
    }
    if (response.status === 401) {
      if (outdated()) {
        return state.status === "authenticated" ? state.session : null;
      }
      setState({ status: "anonymous" });
      return null;
    }
    if (!response.ok) {
      return fail("Sitzung konnte nicht geprüft werden.");
    }
    const session = (await response.json()) as SessionInfo;
    if (outdated()) {
      return session;
    }
    if (state.status === "authenticated") {
      if (state.identityChanged) {
        // Sticky: a detected change is never undone by a later answer.
        return session;
      }
      if (identityOf(state.session) !== identityOf(session)) {
        // Keep the page's own session (and its now useless CSRF token);
        // callers compare identities and must not act on the new one.
        setState({ ...state, identityChanged: true });
        return session;
      }
    }
    // Same person and organization: a new session or role is adopted; the
    // context epoch advances when the context id changed.
    setState({ status: "authenticated", session, identityChanged: false });
    return session;
  })();
  inflight = request;
  void request
    .catch(() => undefined)
    .finally(() => {
      if (inflight === request) inflight = null;
    });
  return request;
}

/** Identity this page acts as, or null before the first session check. */
export function currentIdentity(): string | null {
  return state.status === "authenticated" ? identityOf(state.session) : null;
}

function assertIdentityUnchanged() {
  if (state.status === "authenticated" && state.identityChanged) {
    throw new SessionChangedError();
  }
}

/** CSRF token for this session; loads the session first if needed. */
export async function getCsrfToken(): Promise<string | null> {
  assertIdentityUnchanged();
  if (state.status === "authenticated") {
    return state.session.csrfToken;
  }
  const session = await loadSession().catch(() => null);
  assertIdentityUnchanged();
  return session?.csrfToken ?? null;
}

export const CSRF_ERROR_CODE = "CSRF_INVALID";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

async function isCsrfRejection(response: Response) {
  if (response.status !== 403) return false;
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { code?: unknown } | null;
  return body?.code === CSRF_ERROR_CODE;
}

type Sender = (
  csrfToken: string | null,
  signal: AbortSignal | undefined,
) => Promise<Response>;

function discard(response: Response) {
  void response.body?.cancel().catch(() => undefined);
}

/** Still signed in as the same, unblocked person: asking again is allowed. */
function mayRetryInNewContext() {
  return canRequestData() && state.status === "authenticated";
}

/**
 * Safe requests (GET/HEAD/OPTIONS) are bound to the session context:
 *
 * - the request is aborted when the page's context changes;
 * - the answer must carry the context id the page expects. An answer for
 *   another context (or without a marker) is never handed to the caller. The
 *   session is re-read instead: another person/organization blocks the page,
 *   the same person in a new session/role is adopted and the request is sent
 *   once more under that context;
 * - a 401 is only believed after the session was re-read (a late 401 of an
 *   old cookie must not sign out a newer session).
 */
async function sendBoundToContext(send: Sender): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    if (state.status !== "authenticated") {
      // Before the first session check there is no context to bind to.
      return send(null, undefined);
    }
    const startedIn = epoch;
    const expected = state.session.contextId;
    let response: Response;
    try {
      response = await send(null, contextController.signal);
    } catch (error) {
      if (epoch === startedIn) throw error;
      if (attempt === 0 && mayRetryInNewContext()) continue;
      throw new SessionChangedError();
    }
    if (epoch !== startedIn) {
      discard(response);
      if (attempt === 0 && mayRetryInNewContext()) continue;
      throw new SessionChangedError();
    }
    const actual = response.headers.get(SESSION_CONTEXT_HEADER);
    if (actual === expected) {
      return response;
    }
    // Error answers without any marker carry no data of another context.
    if (actual === null && !response.ok && response.status !== 401) {
      return response;
    }
    const fresh = await loadSession({ force: true }).catch(() => undefined);
    if (fresh === undefined) {
      discard(response);
      throw new SessionChangedError(); // cannot verify: fail closed
    }
    if (fresh === null) {
      // Really signed out: an honest 401 stays one, anything else is dropped.
      if (response.status === 401) return response;
      discard(response);
      throw new SessionChangedError();
    }
    discard(response);
    if (
      attempt > 0 ||
      !mayRetryInNewContext() ||
      state.status !== "authenticated" ||
      identityOf(state.session) !== identityOf(fresh)
    ) {
      throw new SessionChangedError();
    }
  }
}

/**
 * Sends a request on behalf of the page's current identity.
 *
 * - Nothing is sent once the identity has changed.
 * - Safe methods (GET/HEAD/OPTIONS) are bound to the session context (see
 *   sendBoundToContext) and retried at most once under the same person.
 * - A state-changing request is retried at most once, and only when the
 *   server answered with the CSRF code (any other 403 is final). Before that
 *   retry the session is re-read; if it now belongs to another user or
 *   organization, the request is abandoned with SessionChangedError instead
 *   of being re-sent under the new identity.
 *
 * The server binds every CSRF token to exactly one session, so a cookie that
 * changed between the page's last session check and the request itself is
 * always rejected (403 CSRF_INVALID) before any handler runs.
 */
export async function sendAsCurrentIdentity(
  method: string,
  send: Sender,
): Promise<Response> {
  assertIdentityUnchanged();
  if (SAFE_METHODS.has(method.toUpperCase())) {
    return sendBoundToContext(send);
  }

  const csrfToken = await getCsrfToken();
  const issuedAs = currentIdentity();
  const response = await send(csrfToken, undefined);
  if (!(await isCsrfRejection(response))) {
    return response;
  }

  const fresh = await loadSession({ force: true }).catch(() => null);
  if (!fresh) {
    return response;
  }
  if (issuedAs === null || identityOf(fresh) !== issuedAs) {
    if (state.status === "authenticated") {
      setState({ ...state, identityChanged: true });
    }
    throw new SessionChangedError();
  }
  assertIdentityUnchanged();
  // Same user and organization, new session (e.g. a re-login in another tab):
  // one retry with that session's token; a second rejection is final.
  return send(fresh.csrfToken, undefined);
}

/** Called with the login response body (which carries no credential). */
export function startSession(session: SessionInfo) {
  startedLoads += 1; // older session checks must not override this login
  safeSessionStorage()?.setItem(HAD_SESSION_KEY, "1");
  safeSessionStorage()?.removeItem(SESSION_NOTICE_KEY);
  setState({ status: "authenticated", session, identityChanged: false });
  announceSessionChange();
}

/** True when this tab was signed in before, so a 401 means "expired". */
export function hadSession() {
  return safeSessionStorage()?.getItem(HAD_SESSION_KEY) === "1";
}

function goToLogin(notice: string | null) {
  startedLoads += 1;
  const storage = safeSessionStorage();
  storage?.removeItem(HAD_SESSION_KEY);
  if (notice) {
    storage?.setItem(SESSION_NOTICE_KEY, notice);
  } else {
    storage?.removeItem(SESSION_NOTICE_KEY);
  }
  setState({ status: "anonymous" });
  // A full navigation also discards every module-level cache of this tab.
  window.location.href = "/login";
}

/** The server rejected the session (expired, revoked, locked account). */
export function handleSessionExpired() {
  if (typeof window === "undefined") return;
  goToLogin("Sitzung abgelaufen, bitte neu anmelden.");
}

/**
 * Ends the session on the server first. Only when the server confirmed it
 * (or reported that there was no session left) is the user sent to /login;
 * a network failure is reported instead of pretending the logout worked.
 */
export async function logout(): Promise<void> {
  let response: Response;
  try {
    // Same rules as every mutation: never log out a different identity.
    response = await sendAsCurrentIdentity("POST", (csrfToken) =>
      fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
      }),
    );
  } catch (error) {
    if (error instanceof SessionChangedError) throw error;
    throw new Error(
      "Abmelden fehlgeschlagen: Server nicht erreichbar. Die Sitzung ist weiterhin aktiv.",
    );
  }
  if (response.status !== 204) {
    throw new Error(
      "Abmelden fehlgeschlagen. Die Sitzung ist weiterhin aktiv, bitte erneut versuchen.",
    );
  }
  announceSessionChange();
  goToLogin(null);
}

let noticeForThisPage: string | null | undefined;

/**
 * The notice left for the login page ("Sitzung abgelaufen"). It is read and
 * removed from sessionStorage once per page load and then stays stable, so it
 * can serve as a useSyncExternalStore snapshot.
 */
export function getSessionNotice(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (noticeForThisPage === undefined) {
    const storage = safeSessionStorage();
    noticeForThisPage = storage?.getItem(SESSION_NOTICE_KEY) ?? null;
    storage?.removeItem(SESSION_NOTICE_KEY);
  }
  return noticeForThisPage;
}
