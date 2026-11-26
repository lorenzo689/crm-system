"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/auth-api";
import {
  SessionChangedError,
  canRequestData,
  getContextEpoch,
  subscribeContext,
} from "@/lib/session";

/**
 * Small stale-while-revalidate cache for GET requests: a page shows the last
 * known data instantly (e.g. when navigating back) and refreshes it in the
 * background. Entries are shared across components.
 *
 * Session safety: the cache belongs to exactly ONE session context (user,
 * organization, role, session). When the context changes (login, logout, new
 * session, role change, identity change) the whole cache is dropped, running
 * requests are aborted and their answers are never written. A request may
 * only store its result while it still is the registered request of its key
 * AND the context epoch it started in is current.
 */
type Entry = { data?: unknown; error?: string; fetchedAt: number; promise?: Promise<void> };

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const FRESH_MS = 15_000;
const MAX_ENTRIES = 100;

function notify(path: string) {
  listeners.get(path)?.forEach((listener) => listener());
}

function load(path: string, force = false): Promise<void> {
  // Blocked or signed-out pages start no authenticated requests at all.
  if (!canRequestData()) return Promise.resolve();
  const entry = cache.get(path);
  if (entry?.promise) return entry.promise;
  if (!force && entry && Date.now() - entry.fetchedAt < FRESH_MS) {
    return Promise.resolve();
  }
  if (cache.size >= MAX_ENTRIES && !cache.has(path)) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }

  const startedIn = getContextEpoch();
  const promise: Promise<void> = apiFetch<unknown>(path)
    .then((data) => {
      if (isCurrent()) cache.set(path, { data, fetchedAt: Date.now() });
    })
    .catch((error: unknown) => {
      // A context change is not a load error and leaves no stale data behind.
      if (!isCurrent() || error instanceof SessionChangedError) return;
      cache.set(path, {
        data: entry?.data,
        error: error instanceof Error ? error.message : "Laden fehlgeschlagen",
        fetchedAt: Date.now(),
      });
    })
    .finally(() => notify(path));
  const isCurrent = () =>
    cache.get(path)?.promise === promise && getContextEpoch() === startedIn;

  cache.set(path, { ...(entry ?? { fetchedAt: 0 }), promise });
  return promise;
}

/** Context changed: nothing cached for the old context may be shown again. */
subscribeContext(() => {
  cache.clear();
  for (const [path, set] of listeners) {
    if (set.size === 0) continue;
    notify(path);
    void load(path); // mounted components get data of the NEW context (if any)
  }
});

/** Warm the cache before navigation, e.g. on link hover. */
export function prefetchApi(path: string) {
  void load(path);
}

/** Drop cached data so the next read refetches (call after mutations). */
export function invalidateApi(prefix: string) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key); // an older request of this key loses its registration
      void load(key, true);
    }
  }
}

/**
 * Non-React access to the same cache (used by the hook and by tests).
 * `peekApi` returns the cached entry, `loadApi` starts or joins a request,
 * `subscribeApi` registers interest in a key (what a mounted component does).
 */
export function peekApi(path: string): Entry | undefined {
  return cache.get(path);
}

export function loadApi(path: string, force = false): Promise<void> {
  return load(path, force);
}

export function subscribeApi(path: string, listener: () => void) {
  const set = listeners.get(path) ?? new Set();
  set.add(listener);
  listeners.set(path, set);
  return () => {
    set.delete(listener);
  };
}

export function useApi<T>(path: string | null) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!path) return () => undefined;
      const set = listeners.get(path) ?? new Set();
      set.add(listener);
      listeners.set(path, set);
      return () => set.delete(listener);
    },
    [path],
  );
  const entry = useSyncExternalStore(
    subscribe,
    () => (path ? cache.get(path) : undefined),
    () => undefined,
  );
  const [isRevalidating, setIsRevalidating] = useState(false);

  useEffect(() => {
    if (path) void load(path);
  }, [path]);

  const reload = useCallback(async () => {
    if (!path) return;
    setIsRevalidating(true);
    await load(path, true);
    setIsRevalidating(false);
  }, [path]);

  return {
    data: entry?.data as T | undefined,
    error: entry?.error ?? null,
    isLoading: entry?.data === undefined && !entry?.error,
    isRevalidating,
    reload,
  };
}
