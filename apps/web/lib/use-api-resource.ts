"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/auth-api";
import {
  SessionChangedError,
  getContextEpoch,
  subscribeContext,
} from "@/lib/session";

type Result<T> = { key: string; data: T | null; error: string | null };

/**
 * Loads `path` (null = don't load) and reloads whenever it changes or
 * `reload()` is called.
 *
 * State is only written from the request's callbacks; "loading" is derived
 * from whether the stored result belongs to the current request, so no
 * synchronous setState in an effect is needed. Answers to outdated requests
 * are discarded.
 */
export function useApiResource<T>(path: string | null, fallbackError: string) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  // A result belongs to the session context it was loaded in: when the
  // context changes the key changes, the old result is no longer "current"
  // and the data is loaded again for the new context.
  const contextEpoch = useSyncExternalStore(
    subscribeContext,
    getContextEpoch,
    () => 0,
  );
  const key = path === null ? null : `${contextEpoch}:${version}:${path}`;

  useEffect(() => {
    if (key === null || path === null) {
      return;
    }
    let active = true;
    apiFetch<T>(path)
      .then((data) => {
        if (active) setResult({ key, data, error: null });
      })
      .catch((caught: unknown) => {
        // Session change: the blocking notice explains it; no data, no error.
        if (caught instanceof SessionChangedError) return;
        if (active) {
          setResult({
            key,
            data: null,
            error: caught instanceof Error ? caught.message : fallbackError,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [key, path, fallbackError]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  /** Local update of the loaded data (e.g. after a successful mutation). */
  const setData = useCallback((update: (current: T) => T) => {
    setResult((current) =>
      current?.data == null
        ? current
        : { ...current, data: update(current.data) },
    );
  }, []);

  /** Shows an error for the current data (e.g. a failed follow-up action). */
  const setError = useCallback((error: string | null) => {
    setResult((current) => (current ? { ...current, error } : current));
  }, []);

  const isCurrent = result !== null && result.key === key;
  return {
    data: isCurrent ? result.data : null,
    error: isCurrent ? result.error : null,
    isLoading: key !== null && !isCurrent,
    reload,
    setData,
    setError,
  };
}
