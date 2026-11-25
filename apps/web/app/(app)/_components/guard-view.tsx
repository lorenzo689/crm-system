"use client";

import { Fragment, useState, type ReactNode, type Ref } from "react";
import type { Draft } from "@/lib/draft-capture";
import { SESSION_CHANGED_MESSAGE } from "@/lib/session";

/**
 * What the AuthGuard puts on screen once the session is known.
 *
 * - blocked (another person or organization): the page content is NOT rendered
 *   at all, so nothing of the previous context stays in the DOM, and no typed
 *   input of that context is offered anywhere. Only the notice remains.
 * - otherwise the content, keyed so that a new session or role of the same
 *   person rebuilds it.
 */
export function GuardedContent({
  blocked,
  contentKey,
  contentRef,
  refreshed,
  onCloseRefreshed,
  children,
}: {
  blocked: boolean;
  contentKey: number;
  contentRef: Ref<HTMLDivElement>;
  refreshed: Draft[] | null;
  onCloseRefreshed: () => void;
  children: ReactNode;
}) {
  if (blocked) {
    return <SessionChangedNotice />;
  }
  return (
    <>
      <div ref={contentRef} className="contents">
        <Fragment key={contentKey}>{children}</Fragment>
      </div>
      {refreshed && (
        <RefreshedNotice drafts={refreshed} onClose={onCloseRefreshed} />
      )}
    </>
  );
}

/**
 * Shown when the browser's session now belongs to someone else (or another
 * organization). Nothing reloads by itself, the user decides. The previous
 * page and everything typed into it are gone: they belong to the other context.
 */
export function SessionChangedNotice() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-changed-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-[#f0d9a8] bg-[#fff7e8] p-5 text-sm text-[#805b10] shadow-lg">
        <h2 id="session-changed-title" className="mb-2 text-base font-semibold">
          Anmeldung geändert
        </h2>
        <p>{SESSION_CHANGED_MESSAGE}</p>
        <p className="mt-2">
          Aus Sicherheitsgründen wurde der Inhalt dieser Seite entfernt, auch
          nicht gespeicherte Eingaben, und nichts wird mehr gesendet. Es wird
          nichts automatisch neu geladen.
        </p>
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

async function copyDraftsToClipboard(drafts: Draft[]) {
  const text = drafts.map((d) => `${d.label}:\n${d.value}`).join("\n\n");
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Same person, new session or role: the page was rebuilt with fresh data. If
 * something had been typed, the person can still copy it (never shown).
 */
export function RefreshedNotice({
  drafts,
  onClose,
}: {
  drafts: Draft[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex flex-wrap items-center justify-center gap-3 border-b border-[#f0d9a8] bg-[#fff7e8] px-4 py-3 text-sm text-[#805b10] shadow-sm"
    >
      <span>
        Deine Sitzung oder Berechtigung hat sich geändert; die Seite wurde mit
        aktuellen Daten neu aufgebaut.
        {drafts.length > 0 &&
          ` ${drafts.length} nicht gespeicherte Eingabe(n) wurden verworfen.`}
      </span>
      {drafts.length > 0 && (
        <button
          type="button"
          onClick={() => void copyDraftsToClipboard(drafts).then(setCopied)}
          className="rounded-lg border border-[#e0c48a] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[#fff1d6]"
        >
          {copied ? "Kopiert" : "Eingaben kopieren"}
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-[#e0c48a] bg-white px-3 py-1.5 text-sm font-medium hover:bg-[#fff1d6]"
      >
        Schließen
      </button>
    </div>
  );
}
