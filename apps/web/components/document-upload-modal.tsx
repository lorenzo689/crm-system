"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import { ACCESS_TOKEN_KEY } from "@/lib/session";

type DocumentType =
  | "GENERAL"
  | "OFFER"
  | "DRAWING"
  | "PLAN"
  | "PHOTO"
  | "SPECIFICATION"
  | "PROTOCOL"
  | "OTHER";

type DocumentUploadModalProps = {
  isOpen: boolean;
  contextParam: "customerId" | "projectId";
  contextId: string;
  onClose: () => void;
  onUploaded: () => void;
};

const documentTypeLabels: Record<DocumentType, string> = {
  GENERAL: "Allgemein",
  OFFER: "Angebot",
  DRAWING: "Zeichnung",
  PLAN: "Plan",
  PHOTO: "Foto",
  SPECIFICATION: "Spezifikation",
  PROTOCOL: "Protokoll",
  OTHER: "Sonstiges",
};

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

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
      setError(
        `Datei zu groß (max. ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`,
      );
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
      const document = await apiFetch<{ id: string }>("/documents", {
        method: "POST",
        body: JSON.stringify({
          [contextParam]: contextId,
          title: title.trim(),
          type,
        }),
      });

      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

      const uploadResponse = await fetch(
        `${apiUrl}/documents/${document.id}/versions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      if (!uploadResponse.ok) {
        const errorBody = (await uploadResponse.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          errorBody?.message ??
            "Datei-Upload fehlgeschlagen, Dokument wurde ohne Datei angelegt",
        );
      }

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
