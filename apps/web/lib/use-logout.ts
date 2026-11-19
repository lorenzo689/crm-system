"use client";

import { useState } from "react";
import { logout } from "@/lib/session";

/** Logout with honest feedback: a failure is shown, never treated as success. */
export function useLogout() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setIsPending(true);
    setError(null);
    try {
      // On success the page navigates to /login.
      await logout();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Abmelden fehlgeschlagen.",
      );
      setIsPending(false);
    }
  }

  return { logout: run, isPending, error };
}
