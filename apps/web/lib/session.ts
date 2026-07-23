"use client";

export const ACCESS_TOKEN_KEY = "accessToken";
const SESSION_NOTICE_KEY = "sessionNotice";

export function storeAccessToken(token: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function logout(options?: { expired?: boolean; redirectTo?: string }) {
  if (typeof window === "undefined") {
    return;
  }

  clearAccessToken();

  if (options?.expired) {
    window.sessionStorage.setItem(
      SESSION_NOTICE_KEY,
      "Sitzung abgelaufen, bitte neu anmelden.",
    );
  } else {
    window.sessionStorage.removeItem(SESSION_NOTICE_KEY);
  }

  window.location.href = options?.redirectTo ?? "/login";
}

export function consumeSessionNotice() {
  if (typeof window === "undefined") {
    return null;
  }

  const notice = window.sessionStorage.getItem(SESSION_NOTICE_KEY);
  if (!notice) {
    return null;
  }

  window.sessionStorage.removeItem(SESSION_NOTICE_KEY);
  return notice;
}
