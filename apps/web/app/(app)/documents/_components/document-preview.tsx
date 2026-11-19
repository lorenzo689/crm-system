"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import {
  archiveDocument,
  documentTypeLabels,
  fileTooLargeMessage,
  formatFileSize,
  getDocumentUrl,
  MAX_FILE_SIZE_BYTES,
  openDocumentDownload,
  updateDocument,
  uploadDocumentVersion,
  type DocumentDetail,
  type DocumentListItem,
  type DocumentType,
  type DocumentVersion,
} from "@/lib/documents";
import { DocumentAssignment } from "./document-assignment";
import { FileIcon } from "./documents-table";
import { TagInput, withPendingTag } from "./tag-input";

type DocumentPreviewProps = {
  document: DocumentListItem;
  customerNameByProject: Map<string, string>;
  onClose: () => void;
  onChanged: (document: DocumentListItem) => void;
  onArchived: (documentId: string) => void;
};

type PreviewUrlState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

const inputClassName =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3 py-1">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="min-w-0 text-xs break-words text-slate-800">{children}</dd>
    </div>
  );
}

export function DocumentPreview({
  document,
  customerNameByProject,
  onClose,
  onChanged,
  onArchived,
}: DocumentPreviewProps) {
  const version = document.currentVersion;
  const versionId = version?.id;
  const isImage = version?.mimeType.startsWith("image/") ?? false;
  const isPdf = version?.mimeType === "application/pdf";

  const [previewResult, setPreviewResult] = useState<{
    versionId: string;
    state: PreviewUrlState;
  } | null>(null);
  const preview: PreviewUrlState =
    previewResult && previewResult.versionId === versionId
      ? previewResult.state
      : { status: "loading" };

  const [versions, setVersions] = useState<DocumentVersion[] | null>(null);
  const [versionsError, setVersionsError] = useState<string | null>(null);

  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [isUploadingVersion, setIsUploadingVersion] = useState(false);
  const [versionUploadError, setVersionUploadError] = useState<string | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(document.title);
  const [type, setType] = useState<DocumentType>(document.type);
  const [tags, setTags] = useState<string[]>(document.tags);
  const [tagInput, setTagInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isConfirmingArchive, setIsConfirmingArchive] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!versionId || (!isImage && !isPdf)) return;

    const controller = new AbortController();
    getDocumentUrl(document.id)
      .then((url) =>
        setPreviewResult({ versionId, state: { status: "ready", url } }),
      )
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) return;
        setPreviewResult({
          versionId,
          state: {
            status: "error",
            message: errorMessage(
              caughtError,
              "Vorschau konnte nicht geladen werden.",
            ),
          },
        });
      });

    return () => controller.abort();
  }, [document.id, versionId, isImage, isPdf]);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<DocumentDetail>(`/documents/${document.id}`, {
      signal: controller.signal,
    })
      .then((detail) => setVersions(detail.versions))
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) return;
        setVersionsError(
          errorMessage(caughtError, "Versionen konnten nicht geladen werden."),
        );
      });
    return () => controller.abort();
  }, [document.id]);

  async function handleDownload(targetVersionId?: string) {
    setIsDownloading(targetVersionId ?? "current");
    setDownloadError(null);
    try {
      await openDocumentDownload(document.id, targetVersionId);
    } catch (caughtError) {
      setDownloadError(errorMessage(caughtError, "Download fehlgeschlagen"));
    } finally {
      setIsDownloading(null);
    }
  }

  async function handleVersionSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setVersionUploadError(fileTooLargeMessage());
      return;
    }

    setIsUploadingVersion(true);
    setVersionUploadError(null);
    try {
      await uploadDocumentVersion(document.id, file);
      const detail = await apiFetch<DocumentDetail>(
        `/documents/${document.id}`,
      );
      setVersions(detail.versions);
      // Versionen sind absteigend sortiert, die erste ist die aktuelle.
      onChanged({
        ...document,
        currentVersion: detail.versions[0] ?? document.currentVersion,
        _count: { versions: detail.versions.length },
        updatedAt: detail.updatedAt,
      });
    } catch (caughtError) {
      setVersionUploadError(
        errorMessage(caughtError, "Datei-Upload fehlgeschlagen"),
      );
    } finally {
      setIsUploadingVersion(false);
    }
  }

  function startEditing() {
    setTitle(document.title);
    setType(document.type);
    setTags(document.tags);
    setTagInput("");
    setSaveError(null);
    setIsEditing(true);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setSaveError("Bitte einen Titel angeben");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await updateDocument(document.id, {
        title: title.trim(),
        type,
        tags: withPendingTag(tags, tagInput),
      });
      onChanged({
        ...document,
        title: updated.title,
        type: updated.type,
        tags: updated.tags,
        updatedAt: updated.updatedAt,
      });
      setIsEditing(false);
    } catch (caughtError) {
      setSaveError(errorMessage(caughtError, "Speichern fehlgeschlagen"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive() {
    setIsArchiving(true);
    setArchiveError(null);
    try {
      await archiveDocument(document.id);
      onArchived(document.id);
    } catch (caughtError) {
      setArchiveError(errorMessage(caughtError, "Archivieren fehlgeschlagen"));
      setIsArchiving(false);
    }
  }

  const versionCount = versions?.length ?? document._count?.versions ?? 0;

  return (
    <div className="documents-preview documents-panel">
      <aside
        aria-label={`Vorschau: ${document.title}`}
        className="flex h-full w-full min-w-0 flex-col"
      >
        <div className="documents-preview-heading flex items-start gap-3 border-b border-zinc-200 p-4">
          <FileIcon document={document} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-zinc-900">
              {document.title}
            </h2>
            <div className="mt-1">
              <span className="text-xs text-slate-600">
                {version?.fileName.split(".").pop()?.toUpperCase() ??
                  documentTypeLabels[document.type]}
                {version &&
                  ` · ${formatFileSize(version.sizeBytes)} · Version ${version.versionNumber}.0`}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isEditing && (
              <button
                type="button"
                onClick={startEditing}
                className="text-sm text-zinc-500 hover:text-zinc-800 hover:underline"
              >
                Bearbeiten
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Schließen"
              className="text-zinc-400 hover:text-zinc-600"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="documents-preview-body flex-1 overflow-y-auto p-4">
          {isEditing && (
            <form
              onSubmit={handleSave}
              className="mb-5 space-y-3 rounded-lg border border-zinc-200 p-4"
            >
              <div>
                <label
                  htmlFor="edit-title"
                  className="mb-1 block text-xs font-medium text-zinc-600"
                >
                  Titel
                </label>
                <input
                  id="edit-title"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  maxLength={200}
                  className={inputClassName}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-type"
                  className="mb-1 block text-xs font-medium text-zinc-600"
                >
                  Typ
                </label>
                <select
                  id="edit-type"
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as DocumentType)
                  }
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
                <label
                  htmlFor="edit-tags"
                  className="mb-1 block text-xs font-medium text-zinc-600"
                >
                  Tags
                </label>
                <TagInput
                  id="edit-tags"
                  tags={tags}
                  pending={tagInput}
                  onTagsChange={setTags}
                  onPendingChange={setTagInput}
                />
              </div>
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {isSaving ? "Speichert …" : "Speichern"}
                </button>
              </div>
            </form>
          )}

          {version && (isImage || isPdf) && (
            <div className="mb-5 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
              {preview.status === "loading" && (
                <div className="h-80 animate-pulse bg-zinc-100" />
              )}
              {preview.status === "error" && (
                <p className="p-6 text-sm text-red-600">{preview.message}</p>
              )}
              {preview.status === "ready" && isImage && (
                // eslint-disable-next-line @next/next/no-img-element -- signierte Storage-URL, next/image nicht sinnvoll
                <img
                  src={preview.url}
                  alt={document.title}
                  className="h-[230px] w-full object-contain"
                />
              )}
              {preview.status === "ready" && isPdf && (
                <iframe
                  src={preview.url}
                  title={document.title}
                  className="h-[230px] w-full"
                />
              )}
            </div>
          )}

          {version && !isImage && !isPdf && (
            <p className="mb-5 rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400">
              Für diesen Dateityp ist keine Vorschau verfügbar.
            </p>
          )}

          {!version && (
            <p className="mb-5 rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-400">
              Dieses Dokument hat noch keine Datei.
            </p>
          )}

          {version && (
            <div className="documents-preview-actions">
              {preview.status === "ready" && (
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="documents-button"
                >
                  Vorschau ↗
                </a>
              )}
              <button
                className="documents-button"
                onClick={() => handleDownload()}
                disabled={isDownloading === "current"}
              >
                {isDownloading === "current" ? "Lädt …" : "↓ Herunterladen"}
              </button>
            </div>
          )}
          <h3 className="documents-details-title">Details</h3>
          <dl>
            <MetaRow label="Zuordnung">
              <DocumentAssignment
                document={document}
                customerNameByProject={customerNameByProject}
              />
            </MetaRow>
            {version && (
              <>
                <MetaRow label="Datei">{version.fileName}</MetaRow>
                <MetaRow label="Version">
                  v{version.versionNumber}
                  {versionCount > 1 && ` (${versionCount} Versionen)`}
                </MetaRow>
                <MetaRow label="Größe">
                  {formatFileSize(version.sizeBytes)}
                </MetaRow>
                <MetaRow label="Hochgeladen">
                  {version.uploadedBy.displayName},{" "}
                  {new Date(version.createdAt).toLocaleDateString("de-DE")}
                </MetaRow>
              </>
            )}
            <MetaRow label="Angelegt von">
              {document.author.displayName},{" "}
              {new Date(document.createdAt).toLocaleDateString("de-DE")}
            </MetaRow>
            <MetaRow label="Tags">
              {document.tags.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {document.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500"
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              ) : (
                "–"
              )}
            </MetaRow>
          </dl>

          <section className="mt-6" aria-label="Versionen">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Versionsverlauf ({versionCount})
              </h3>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingVersion}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {isUploadingVersion ? "Lädt hoch …" : "Neue Version hochladen"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                aria-label="Neue Version auswählen"
                onChange={handleVersionSelected}
                className="hidden"
              />
            </div>
            {versionUploadError && (
              <p className="mb-2 text-sm text-red-600">{versionUploadError}</p>
            )}
            {versionsError && (
              <p className="text-sm text-red-600">{versionsError}</p>
            )}
            {!versions && !versionsError && (
              <div className="h-12 animate-pulse rounded-lg bg-zinc-100" />
            )}
            {versions && (
              <ul className="documents-version-history">
                {versions.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-800">
                        v{entry.versionNumber}
                        {entry.id === versionId && (
                          <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            aktuell
                          </span>
                        )}
                        <span className="ml-2 text-zinc-500">
                          {entry.fileName}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-400">
                        {formatFileSize(entry.sizeBytes)} ·{" "}
                        {entry.uploadedBy.displayName} ·{" "}
                        {new Date(entry.createdAt).toLocaleDateString("de-DE")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownload(entry.id)}
                      disabled={isDownloading === entry.id}
                      aria-label={`Version ${entry.versionNumber} herunterladen`}
                      className="shrink-0 text-xs text-zinc-500 hover:text-zinc-800 hover:underline disabled:opacity-50"
                    >
                      {isDownloading === entry.id ? "Lädt …" : "Download"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="border-t border-zinc-200 p-3">
          {(downloadError || archiveError) && (
            <p className="mb-2 text-sm text-red-600">
              {archiveError ?? downloadError}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            {isConfirmingArchive ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-600">
                  Dokument archivieren?
                </span>
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={isArchiving}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {isArchiving ? "Archiviert …" : "Ja, archivieren"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingArchive(false)}
                  disabled={isArchiving}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
                >
                  Abbrechen
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingArchive(true)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100 hover:text-red-600"
              >
                Archivieren
              </button>
            )}

            {version && (
              <div className="flex gap-2">
                {isPdf && preview.status === "ready" && (
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    In neuem Tab öffnen
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => handleDownload()}
                  disabled={isDownloading === "current"}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {isDownloading === "current" ? "Lädt …" : "Herunterladen"}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
