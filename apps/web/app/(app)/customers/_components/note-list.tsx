"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-api";

type CustomerNote = {
  id: string;
  content: string;
  createdAt: string;
  archivedAt: string | null;
  author: {
    id: string;
    displayName: string;
  };
};

type NoteListProps = {
  customerId: string;
  isOpen: boolean;
};

export function NoteList({ customerId, isOpen }: NoteListProps) {
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setIsLoading(true);
    setError(null);

    apiFetch<CustomerNote[]>(`/customer-notes?customerId=${customerId}`)
      .then((loadedNotes) => setNotes(loadedNotes))
      .catch((caughtError) => {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Notizen konnten nicht geladen werden.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [customerId, isOpen]);

  async function handleAddNote(event: React.FormEvent) {
    event.preventDefault();

    if (!newNoteContent.trim()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const createdNote = await apiFetch<CustomerNote>("/customer-notes", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          content: newNoteContent.trim(),
        }),
      });

      setNotes((current) => [createdNote, ...current]);
      setNewNoteContent("");
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
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
        Notizen
      </p>
      <p className="mt-2 text-sm text-zinc-500">
        {visibleNotes.length} Notiz{visibleNotes.length === 1 ? "" : "en"}
      </p>

      <form onSubmit={handleAddNote} className="mt-3 flex flex-col gap-2">
        <textarea
          value={newNoteContent}
          onChange={(event) => setNewNoteContent(event.target.value)}
          rows={2}
          placeholder="Neue Notiz hinzufügen..."
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-300 focus:border-amber-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isSubmitting || !newNoteContent.trim()}
          className="self-end rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
        >
          {isSubmitting ? "Wird gespeichert..." : "Notiz hinzufügen"}
        </button>
      </form>

      <div className="mt-3 rounded-2xl border border-zinc-200 bg-white">
        {isLoading ? (
          <p className="px-4 py-4 text-sm text-zinc-500">Lädt...</p>
        ) : error ? (
          <p className="px-4 py-4 text-sm text-red-600">{error}</p>
        ) : visibleNotes.length === 0 ? (
          <p className="px-4 py-4 text-sm text-zinc-500">
            Noch keine Notizen vorhanden.
          </p>
        ) : (
          <div className="divide-y divide-zinc-200">
            {visibleNotes.map((note) => (
              <article key={note.id} className="px-4 py-3">
                <p className="text-sm text-zinc-700">{note.content}</p>
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
