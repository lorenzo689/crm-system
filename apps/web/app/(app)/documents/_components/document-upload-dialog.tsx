"use client";

import { useEffect, useState } from "react";
import {
  createDocumentWithFile,
  documentTypeLabels,
  fileTooLargeMessage,
  MAX_FILE_SIZE_BYTES,
  stripFileExtension,
  suggestDocumentType,
  type DocumentType,
} from "@/lib/documents";
import { TagInput, withPendingTag } from "./tag-input";

export type CustomerOption = { id: string; name: string };
export type ProjectOption = {
  id: string;
  name: string;
  customer: { id: string; name: string };
};

type DocumentUploadDialogProps = {
  initialFile: File | null;
  customers: CustomerOption[];
  projects: ProjectOption[];
  onClose: () => void;
  onUploaded: () => void;
};

const inputClassName =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";
const labelClassName = "mb-1 block text-xs font-medium text-zinc-600";

export function DocumentUploadDialog({
  initialFile,
  customers,
  projects,
  onClose,
  onUploaded,
}: DocumentUploadDialogProps) {
  const [file, setFile] = useState<File | null>(
    initialFile && initialFile.size <= MAX_FILE_SIZE_BYTES ? initialFile : null,
  );
  const [title, setTitle] = useState(
    initialFile ? stripFileExtension(initialFile.name) : "",
  );
  const [type, setType] = useState<DocumentType>(
    initialFile ? suggestDocumentType(initialFile.name) : "GENERAL",
  );
  const [isTitleEdited, setIsTitleEdited] = useState(false);
  const [isTypeEdited, setIsTypeEdited] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(
    initialFile && initialFile.size > MAX_FILE_SIZE_BYTES
      ? fileTooLargeMessage()
      : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSubmitting) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  const customerProjects = projects.filter(
    (project) => project.customer.id === customerId,
  );

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;

    if (selected && selected.size > MAX_FILE_SIZE_BYTES) {
      setError(fileTooLargeMessage());
      setFile(null);
      return;
    }

    setError(null);
    setFile(selected);
    if (selected && !isTitleEdited) setTitle(stripFileExtension(selected.name));
    if (selected && !isTypeEdited) setType(suggestDocumentType(selected.name));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!file) {
      setError("Bitte eine Datei auswählen");
      return;
    }
    if (!title.trim()) {
      setError("Bitte einen Titel angeben");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Ein Projekt bestimmt den Kunden bereits; nur dann nicht zusätzlich customerId senden.
      await createDocumentWithFile(
        {
          title: title.trim(),
          type,
          tags: withPendingTag(tags, tagInput),
          ...(projectId
            ? { projectId }
            : customerId
              ? { customerId }
              : {}),
        },
        file,
      );

      onUploaded();
      onClose();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Fehler beim Hochladen",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Dokument hochladen"
        className="max-h-full w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            Dokument hochladen
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Schließen"
            className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClassName} htmlFor="document-file">
              Datei
            </label>
            <input
              id="document-file"
              type="file"
              onChange={handleFileChange}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-2 file:py-1 file:text-xs"
            />
            {file && (
              <p className="mt-1 text-xs text-zinc-400">
                Ausgewählt: {file.name}
              </p>
            )}
          </div>

          <div>
            <label className={labelClassName} htmlFor="document-title">
              Titel
            </label>
            <input
              id="document-title"
              type="text"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setIsTitleEdited(true);
              }}
              required
              maxLength={200}
              className={inputClassName}
            />
          </div>

          <div>
            <label className={labelClassName} htmlFor="document-type">
              Typ
            </label>
            <select
              id="document-type"
              value={type}
              onChange={(event) => {
                setType(event.target.value as DocumentType);
                setIsTypeEdited(true);
              }}
              className={inputClassName}
            >
              {Object.entries(documentTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClassName} htmlFor="document-tags">
              Tags
            </label>
            <TagInput
              id="document-tags"
              tags={tags}
              pending={tagInput}
              onTagsChange={setTags}
              onPendingChange={setTagInput}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClassName} htmlFor="document-customer">
                Kunde
              </label>
              <select
                id="document-customer"
                value={customerId}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setProjectId("");
                }}
                className={inputClassName}
              >
                <option value="">Global (kein Kunde)</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClassName} htmlFor="document-project">
                Projekt
              </label>
              <select
                id="document-project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                disabled={!customerId}
                className={`${inputClassName} disabled:bg-zinc-50 disabled:text-zinc-400`}
              >
                <option value="">Kein Projekt</option>
                {customerProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isSubmitting ? "Lädt hoch …" : "Hochladen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
