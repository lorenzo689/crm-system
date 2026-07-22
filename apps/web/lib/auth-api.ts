export type AuthResponse = {
  accessToken: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = LoginInput & {
  displayName: string;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

async function requestAuth(
  path: "login" | "register",
  body: LoginInput | RegisterInput,
): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(payload?.message)
      ? payload.message.join(" ")
      : payload?.message;

    throw new Error(message ?? "Anfrage fehlgeschlagen. Bitte erneut versuchen.");
  }

  return (await response.json()) as AuthResponse;
}

export function login(input: LoginInput) {
  return requestAuth("login", input);
}

export function register(input: RegisterInput) {
  return requestAuth("register", input);
}
