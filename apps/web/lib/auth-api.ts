import { ACCESS_TOKEN_KEY, logout } from "@/lib/session";

export type AuthResponse = {
  accessToken: string;
};

export type ForgotPasswordResponse = {
  message: string;
  resetToken?: string;
  resetUrl?: string;
  expiresAt?: string;
};

export type ResetPasswordResponse = {
  message: string;
};

type AuthRequestBody =
  | LoginInput
  | RegisterInput
  | { email: string }
  | { token: string; password: string };

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = LoginInput & {
  displayName: string;
  registrationCode: string;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

async function handleResponse<T>(
  response: Response,
  { redirectOnUnauthorized = true }: { redirectOnUnauthorized?: boolean } = {},
): Promise<T> {
  if (response.status === 401) {
    if (redirectOnUnauthorized) {
      logout({ expired: true });
    }

    throw new Error("Sitzung abgelaufen");
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(" ")
      : payload?.message;

    throw new Error(message ?? "Anfrage fehlgeschlagen. Bitte erneut versuchen.");
  }

  return (await response.json()) as T;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem(ACCESS_TOKEN_KEY)
      : null;

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  return handleResponse<T>(response);
}

async function requestAuth(
  path: "login" | "register" | "forgot-password" | "reset-password",
  body: AuthRequestBody,
): Promise<AuthResponse | ForgotPasswordResponse | ResetPasswordResponse> {
  const response = await fetch(`${API_URL}/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return handleResponse(response, { redirectOnUnauthorized: false });
}

export function login(input: LoginInput) {
  return requestAuth("login", input) as Promise<AuthResponse>;
}

export function register(input: RegisterInput) {
  return requestAuth("register", input) as Promise<AuthResponse>;
}

export function forgotPassword(input: { email: string }) {
  return requestAuth("forgot-password", input) as Promise<ForgotPasswordResponse>;
}

export function resetPassword(input: { token: string; password: string }) {
  return requestAuth("reset-password", input) as Promise<ResetPasswordResponse>;
}

/** Like apiFetch, but returns the raw Response (for streams and file downloads). */
export async function apiFetchRaw(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const token =
    typeof window !== "undefined" ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    // Reuse the shared error handling (401 redirect, message extraction).
    await handleResponse(response);
  }
  return response;
}
