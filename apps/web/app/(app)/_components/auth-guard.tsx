"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { advanceContentKey, type ContentKey } from "@/lib/context-key";
import { captureDrafts, type Draft } from "@/lib/draft-capture";
import {
  getContextEpoch,
  getSessionSnapshot,
  subscribeContext,
} from "@/lib/session";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { GuardedContent } from "./guard-view";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { state, retry } = useAuthGuard();
  const contentRef = useRef<HTMLDivElement>(null);
  const blocked = state.status === "authenticated" && state.identityChanged;

  // New session or role of the SAME person: every component under the guard is
  // rebuilt, so data loaded under the old context cannot stay on screen (many
  // pages keep their own API state). Typed-in drafts are captured first.
  const epoch = useSyncExternalStore(subscribeContext, getContextEpoch, () => 0);
  const [content, setContent] = useState<ContentKey>({ epoch, key: 0 });
  const next = advanceContentKey(content, epoch, blocked);
  if (next !== content) setContent(next);
  const [refreshed, setRefreshed] = useState<Draft[] | null>(null);

  useEffect(
    () =>
      subscribeContext(() => {
        const current = getSessionSnapshot();
        if (current.status !== "authenticated") return;
        if (current.identityChanged) {
          // Another person/organization: nothing of the old context is kept.
          setRefreshed(null);
          return;
        }
        if (contentRef.current) {
          setRefreshed(captureDrafts(contentRef.current));
        }
      }),
    [],
  );

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
    <GuardedContent
      blocked={blocked}
      contentKey={content.key}
      contentRef={contentRef}
      refreshed={refreshed}
      onCloseRefreshed={() => setRefreshed(null)}
    >
      {children}
    </GuardedContent>
  );
}
