"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { captureDrafts, type Draft } from "@/lib/draft-capture";
import { SESSION_CHANGED_MESSAGE } from "@/lib/session";
import { useAuthGuard } from "@/lib/use-auth-guard";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { state, retry } = useAuthGuard();
  const contentRef = useRef<HTMLDivElement>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const blocked = state.status === "authenticated" && state.identityChanged;

  // Runs right after the page was switched to "blocked" and before it is
  // painted hidden: the DOM still holds what the user typed.
  useLayoutEffect(() => {
    if (blocked && contentRef.current) {
      setDrafts(captureDrafts(contentRef.current));
    }
  }, [blocked]);

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
      {/*
        While blocked the page stays mounted (so form state is not lost) but is
        hidden and inert: no data of the old session is visible and nothing can
        be edited or submitted.
      */}
      <div
        ref={contentRef}
        className="contents"
        style={{ visibility: blocked ? "hidden" : "visible" }}
        inert={blocked}
        aria-hidden={blocked}
      >
        {children}
      </div>
      {blocked && <SessionChangedNotice drafts={drafts} />}
    </>
  );
}

/**
 * Shown when the browser's session now belongs to someone else (or another
 * organization). Nothing reloads by itself: the user decides, and can first
 * copy what they had typed.
 */
function SessionChangedNotice({ drafts }: { drafts: Draft[] }) {
  const [copied, setCopied] = useState(false);

  async function copyDrafts() {
    const text = drafts.map((d) => `${d.label}:\n${d.value}`).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-changed-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white/95 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-[#f0d9a8] bg-[#fff7e8] p-5 text-sm text-[#805b10] shadow-lg">
        <h2 id="session-changed-title" className="mb-2 text-base font-semibold">
          Anmeldung geändert
        </h2>
        <p>{SESSION_CHANGED_MESSAGE}</p>
        <p className="mt-2">
          Aus Sicherheitsgründen sind die Daten dieser Seite ausgeblendet und
          nichts wird mehr gesendet. Es wird nichts automatisch neu geladen.
        </p>
        {drafts.length > 0 && (
          <div className="mt-3 rounded-lg border border-[#e0c48a] bg-white p-3">
            <p className="mb-2 font-medium">
              Nicht gespeicherte Eingaben ({drafts.length})
            </p>
            <ul className="max-h-32 space-y-1 overflow-auto text-xs">
              {drafts.map((draft, index) => (
                <li key={index} className="break-words">
                  <span className="font-medium">{draft.label}:</span>{" "}
                  {draft.value.length > 200
                    ? `${draft.value.slice(0, 200)} …`
                    : draft.value}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => void copyDrafts()}
              className="mt-2 rounded-lg border border-[#e0c48a] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[#fff1d6]"
            >
              {copied ? "Kopiert" : "Eingaben kopieren"}
            </button>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-[#e0c48a] bg-white px-3 py-1.5 font-medium hover:bg-[#fff1d6]"
          >
            Seite neu laden
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/login";
            }}
            className="rounded-lg border border-[#e0c48a] bg-white px-3 py-1.5 font-medium hover:bg-[#fff1d6]"
          >
            Zur Anmeldung
          </button>
        </div>
      </div>
    </div>
  );
}
