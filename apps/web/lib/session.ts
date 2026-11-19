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
  expiresAt: string;
};

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
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const SESSION_NOTICE_KEY = "sessionNotice";
/** Marks that this tab was signed in, so a later 401 reads as "expired". */
const HAD_SESSION_KEY = "hadSession";
/** Pre-sprint-2 storage of the JWT; removed on sight, never migrated. */
const LEGACY_TOKEN_KEY = "accessToken";
const CHANNEL_NAME = "bissinger-session";

let state: SessionState = { status: "unknown" };
let inflight: Promise<SessionInfo | null> | null = null;
const listeners = new Set<() => void>();

function setState(next: SessionState) {
  state = next;
  for (const listener of listeners) listener();
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
  const request = (async () => {
    // A failed re-check must not tear down a page that is in use; only the
    // first check (nothing rendered yet) shows the error screen.
    const fail = (message: string): never => {
      if (state.status !== "authenticated") {
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
      setState({ status: "anonymous" });
      return null;
    }
    if (!response.ok) {
      return fail("Sitzung konnte nicht geprüft werden.");
    }
    const session = (await response.json()) as SessionInfo;
    if (
      state.status === "authenticated" &&
      (state.identityChanged ||
        identityOf(state.session) !== identityOf(session))
    ) {
      // Keep the page's own session (and its now useless CSRF token); callers
      // compare identities and must not act on the new one.
      setState({ ...state, identityChanged: true });
      return session;
    }
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

/**
 * Sends a request on behalf of the page's current identity.
 *
 * - Nothing is sent once the identity has changed.
 * - Safe methods (GET/HEAD/OPTIONS) are never retried.
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
  send: (csrfToken: string | null) => Promise<Response>,
): Promise<Response> {
  assertIdentityUnchanged();
  if (SAFE_METHODS.has(method.toUpperCase())) {
    return send(null);
  }

  const csrfToken = await getCsrfToken();
  const issuedAs = currentIdentity();
  const response = await send(csrfToken);
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
  return send(fresh.csrfToken);
}

/** Called with the login response body (which carries no credential). */
export function startSession(session: SessionInfo) {
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
