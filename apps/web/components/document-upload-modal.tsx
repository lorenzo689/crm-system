"use client";

import { useState } from "react";
import {
  createDocumentWithFile,
  documentTypeLabels,
  fileTooLargeMessage,
  MAX_FILE_SIZE_BYTES,
  type DocumentType,
} from "@/lib/documents";

type DocumentUploadModalProps = {
  isOpen: boolean;
  contextParam: "customerId" | "projectId";
  contextId: string;
  onClose: () => void;
  onUploaded: () => void;
};

export function DocumentUploadModal({
  isOpen,
  contextParam,
  contextId,
  onClose,
  onUploaded,
}: DocumentUploadModalProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DocumentType>("GENERAL");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  function resetForm() {
    setTitle("");
    setType("GENERAL");
    setFile(null);
    setError(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE_BYTES) {
      setError(fileTooLargeMessage());
      setFile(null);
      return;
    }
    setError(null);
    setFile(selected);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!file) {
      setError("Bitte eine Datei auswählen");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createDocumentWithFile(
        { [contextParam]: contextId, title: title.trim(), type },
        file,
      );

      resetForm();
      onUploaded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Hochladen");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            Dokument hochladen
          </h2>
          <button
            type="button"
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="text-zinc-400 hover:text-zinc-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Titel
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Typ
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as DocumentType)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            >
              {Object.entries(documentTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Datei
            </label>
            <input
              type="file"
              onChange={handleFileChange}
              required
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-xs"
            />
            {file && (
              <p className="mt-1 text-xs text-zinc-400">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                onClose();
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isSubmitting ? "Wird hochgeladen…" : "Hochladen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
