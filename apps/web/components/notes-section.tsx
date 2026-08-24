"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-api";

type NoteType = "GENERAL" | "PHONE" | "MEETING" | "INTERNAL" | "DECISION";

type Note = {
  id: string;
  title: string | null;
  content: string;
  type: NoteType;
  createdAt: string;
  archivedAt: string | null;
  author: {
    id: string;
    displayName: string;
  };
};

type NotesSectionProps = {
  contextParam: "customerId" | "projectId" | "taskId";
  contextId: string;
  isOpen?: boolean;
};

const noteTypeLabels: Record<NoteType, string> = {
  GENERAL: "Allgemein",
  PHONE: "Telefonat",
  MEETING: "Meeting",
  INTERNAL: "Intern",
  DECISION: "Entscheidung",
};

const noteTypeStyles: Record<NoteType, string> = {
  GENERAL: "bg-zinc-100 text-zinc-600",
  PHONE: "bg-blue-50 text-blue-700",
  MEETING: "bg-emerald-50 text-emerald-700",
  INTERNAL: "bg-zinc-100 text-zinc-500",
  DECISION: "bg-amber-50 text-amber-700",
};

export function NotesSection({ contextParam, contextId, isOpen = true }: NotesSectionProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteType, setNewNoteType] = useState<NoteType>("GENERAL");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    setError(null);

    apiFetch<Note[]>(`/notes?${contextParam}=${contextId}`)
      .then(setNotes)
      .catch((caughtError) => {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Notizen konnten nicht geladen werden.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [contextParam, contextId, isOpen]);

  async function handleAddNote(event: React.FormEvent) {
    event.preventDefault();
    if (!newNoteContent.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const createdNote = await apiFetch<Note>("/notes", {
        method: "POST",
        body: JSON.stringify({
          [contextParam]: contextId,
          content: newNoteContent.trim(),
          type: newNoteType,
        }),
      });

      setNotes((current) => [createdNote, ...current]);
      setNewNoteContent("");
      setNewNoteType("GENERAL");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Notiz konnte nicht gespeichert werden.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const visibleNotes = notes.filter((note) => !note.archivedAt);

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  return (
    <section>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">Notizen</p>
      <p className="mt-2 text-sm text-zinc-500">
        {visibleNotes.length} Notiz{visibleNotes.length === 1 ? "" : "en"}
      </p>

      <form onSubmit={handleAddNote} className="mt-3 flex flex-col gap-2">
        <textarea
          value={newNoteContent}
          onChange={(event) => setNewNoteContent(event.target.value)}
          rows={2}
          placeholder="Neue Notiz hinzufügen…"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-300 focus:border-amber-400 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <select
            value={newNoteType}
            onChange={(event) => setNewNoteType(event.target.value as NoteType)}
            className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs text-zinc-600 focus:border-amber-400 focus:outline-none"
          >
            {Object.entries(noteTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isSubmitting || !newNoteContent.trim()}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
          >
            {isSubmitting ? "Wird gespeichert…" : "Notiz hinzufügen"}
          </button>
        </div>
      </form>

      <div className="mt-3 rounded-2xl border border-zinc-200 bg-white">
        {isLoading ? (
          <p className="px-4 py-4 text-sm text-zinc-500">Lädt…</p>
        ) : error ? (
          <p className="px-4 py-4 text-sm text-red-600">{error}</p>
        ) : visibleNotes.length === 0 ? (
          <p className="px-4 py-4 text-sm text-zinc-500">Noch keine Notizen vorhanden.</p>
        ) : (
          <div className="divide-y divide-zinc-200">
            {visibleNotes.map((note) => (
              <article key={note.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {note.title && <p className="text-sm font-medium text-zinc-900">{note.title}</p>}
                    <p className="text-sm text-zinc-700">{note.content}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${noteTypeStyles[note.type]}`}>
                    {noteTypeLabels[note.type]}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-400">
                  {note.author.displayName} · {formatDate(note.createdAt)}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
