import {
  API_URL,
  handleSessionExpired,
  sendAsCurrentIdentity,
  startSession,
  type SessionInfo,
} from "@/lib/session";

export { SessionChangedError } from "@/lib/session";

export type ForgotPasswordResponse = {
  message: string;
};

export type ResetPasswordResponse = {
  message: string;
};

type AuthRequestBody =
  | LoginInput
  | { email: string }
  | { token: string; password: string };

export type LoginInput = {
  email: string;
  password: string;
};

async function readErrorMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;
  return Array.isArray(payload?.message)
    ? payload.message.join(" ")
    : payload?.message;
}

async function handleResponse<T>(
  response: Response,
  { redirectOnUnauthorized = true }: { redirectOnUnauthorized?: boolean } = {},
): Promise<T> {
  if (response.status === 401) {
    if (redirectOnUnauthorized) {
      handleSessionExpired();
    }

    throw new Error("Sitzung abgelaufen");
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message ?? "Anfrage fehlgeschlagen. Bitte erneut versuchen.");
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function isRawBody(body: BodyInit | null | undefined) {
  return (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer
  );
}

/**
 * Every authenticated browser request goes through here: the session cookie
 * is sent by the browser (credentials: "include"), mutations get the session's
 * CSRF token in the X-CSRF-Token header. FormData/Blob bodies keep the
 * browser's own Content-Type (multipart boundary). Retry and identity rules
 * live in sendAsCurrentIdentity (lib/session.ts).
 */
function sendWithSession(
  path: string,
  init: RequestInit | undefined,
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  return sendAsCurrentIdentity(method, (csrfToken, contextSignal) => {
    const headers = new Headers(init?.headers);
    if (init?.body && !isRawBody(init.body) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
    // Safe requests are aborted when the page's session context changes.
    const signals = [init?.signal, contextSignal].filter(
      (signal): signal is AbortSignal => Boolean(signal),
    );
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
      signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
    });
  });
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return handleResponse<T>(await sendWithSession(path, init));
}

/** Like apiFetch, but returns the raw Response (for streams and file downloads). */
export async function apiFetchRaw(path: string, init?: RequestInit) {
  const response = await sendWithSession(path, init);
  if (!response.ok) {
    // Reuse the shared error handling (401 redirect, message extraction).
    await handleResponse(response);
  }
  return response;
}

async function requestAuth<T>(
  path: "login" | "forgot-password" | "reset-password",
  body: AuthRequestBody,
): Promise<T> {
  const response = await fetch(`${API_URL}/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  return handleResponse<T>(response, { redirectOnUnauthorized: false });
}

/** Signs in; the server sets the HttpOnly session cookie. */
export async function login(input: LoginInput) {
  const session = await requestAuth<SessionInfo>("login", input);
  startSession(session);
  return session;
}

export function forgotPassword(input: { email: string }) {
  return requestAuth<ForgotPasswordResponse>("forgot-password", input);
}

export function resetPassword(input: { token: string; password: string }) {
  return requestAuth<ResetPasswordResponse>("reset-password", input);
}
