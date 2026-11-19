"use client";

import { SESSION_CHANGED_MESSAGE } from "@/lib/session";
import { useAuthGuard } from "@/lib/use-auth-guard";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { state, retry } = useAuthGuard();

  if (state.status === "error") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <p className="text-sm text-zinc-500">{state.message}</p>
        <button
          type="button"
          onClick={retry}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (state.status !== "authenticated") {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-zinc-400">Wird geladen…</p>
      </div>
    );
  }

  return (
    <>
      {state.identityChanged && <SessionChangedBanner />}
      {children}
    </>
  );
}

/**
 * Shown when the browser's session now belongs to someone else. The page and
 * its unsaved input stay; every request is blocked until the user reloads.
 */
function SessionChangedBanner() {
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[100] flex flex-wrap items-center justify-center gap-3 border-b border-[#f0d9a8] bg-[#fff7e8] px-4 py-3 text-sm text-[#805b10] shadow-sm"
    >
      <span>{SESSION_CHANGED_MESSAGE}</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg border border-[#e0c48a] bg-white px-3 py-1.5 text-sm font-medium text-[#805b10] hover:bg-[#fff1d6]"
      >
        Seite neu laden
      </button>
    </div>
  );
}
