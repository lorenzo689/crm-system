"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/auth-api";

/**
 * Small stale-while-revalidate cache for GET requests: a page shows the last
 * known data instantly (e.g. when navigating back) and refreshes it in the
 * background. Entries are shared across components and live for the session.
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
  const entry = cache.get(path);
  if (entry?.promise) return entry.promise;
  if (!force && entry && Date.now() - entry.fetchedAt < FRESH_MS) {
    return Promise.resolve();
  }
  if (cache.size >= MAX_ENTRIES && !cache.has(path)) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }

  const promise = apiFetch<unknown>(path)
    .then((data) => {
      cache.set(path, { data, fetchedAt: Date.now() });
    })
    .catch((error: unknown) => {
      cache.set(path, {
        data: entry?.data,
        error: error instanceof Error ? error.message : "Laden fehlgeschlagen",
        fetchedAt: Date.now(),
      });
    })
    .finally(() => notify(path));

  cache.set(path, { ...(entry ?? { fetchedAt: 0 }), promise });
  return promise;
}

/** Warm the cache before navigation, e.g. on link hover. */
export function prefetchApi(path: string) {
  void load(path);
}

/** Drop cached data so the next read refetches (call after mutations). */
export function invalidateApi(prefix: string) {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      void load(key, true);
    }
  }
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
