"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  getServerSessionSnapshot,
  getSessionSnapshot,
  handleSessionExpired,
  hadSession,
  loadSession,
  subscribeSession,
} from "@/lib/session";

/** Current session state; re-renders whenever the in-memory session changes. */
export function useSession() {
  return useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getServerSessionSnapshot,
  );
}

/**
 * Asks the server whether this browser has a valid session. Protected content
 * is only rendered once the answer is "authenticated", so nothing flashes
 * before the check. The session is re-checked when the tab becomes visible
 * again, which picks up role changes, expiry and logouts from other tabs.
 */
export function useAuthGuard() {
  const router = useRouter();
  const state = useSession();

  useEffect(() => {
    void loadSession().catch(() => undefined);

    function revalidate() {
      if (document.visibilityState === "visible") {
        void loadSession({ force: true }).catch(() => undefined);
      }
    }
    document.addEventListener("visibilitychange", revalidate);
    return () => document.removeEventListener("visibilitychange", revalidate);
  }, []);

  useEffect(() => {
    if (state.status !== "anonymous") return;
    if (hadSession()) {
      handleSessionExpired();
    } else {
      router.replace("/login");
    }
  }, [state.status, router]);

  return {
    state,
    retry: () => void loadSession({ force: true }).catch(() => undefined),
  };
}
