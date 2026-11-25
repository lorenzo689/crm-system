"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import type { SalesDocument } from "@/lib/sales";

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

export function SendDocumentDialog({
  document,
  onClose,
  onSent,
}: {
  document: SalesDocument;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const isDraft = document.status === "DRAFT";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSending(true);
    setError(null);
    try {
      await apiFetch(`/sales-documents/${document.id}/send`, {
        method: "POST",
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
      onSent();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Versand fehlgeschlagen");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Per E-Mail senden</h2>
          <button type="button" onClick={onClose} aria-label="Dialog schließen" className="text-zinc-400 hover:text-zinc-600">
            ×
          </button>
        </div>
        {isDraft && (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            Der Entwurf wird beim Senden ausgestellt und erhält seine endgültige Nummer.
            Danach ist er nicht mehr bearbeitbar.
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-xs font-medium text-zinc-600">
            Empfänger
            <input type="email" value={to} onChange={(event) => setTo(event.target.value)} required maxLength={254} placeholder="kunde@beispiel.de" className={inputClass} />
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            Betreff (optional)
            <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} className={inputClass} />
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            Nachricht (optional, sonst Standardtext)
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={5000} className={inputClass} />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
              Abbrechen
            </button>
            <button type="submit" disabled={isSending} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
              {isSending ? "Sendet…" : "PDF senden"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
