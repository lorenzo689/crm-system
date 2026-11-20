import { apiFetch, apiFetchRaw } from "@/lib/auth-api";
import { SessionChangedError, getContextEpoch } from "@/lib/session";

export type DocumentType =
  | "GENERAL"
  | "OFFER"
  | "PRICE_LIST"
  | "DATASHEET"
  | "DRAWING"
  | "PLAN"
  | "PHOTO"
  | "SPECIFICATION"
  | "PROTOCOL"
  | "OTHER";

export type DocumentVersion = {
  id: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: { id: string; displayName: string };
};

export type DocumentListItem = {
  id: string;
  title: string;
  type: DocumentType;
  tags: string[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customerId: string | null;
  projectId: string | null;
  author: { id: string; displayName: string };
  customer: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  currentVersion: DocumentVersion | null;
  _count?: { versions: number };
};

export const documentTypeLabels: Record<DocumentType, string> = {
  GENERAL: "Allgemein",
  OFFER: "Angebot",
  PRICE_LIST: "Preisliste",
  DATASHEET: "Datenblatt",
  DRAWING: "Zeichnung",
  PLAN: "Plan",
  PHOTO: "Foto",
  SPECIFICATION: "Spezifikation",
  PROTOCOL: "Protokoll",
  OTHER: "Sonstiges",
};

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function stripFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

export function suggestDocumentType(fileName: string): DocumentType {
  const name = fileName.toLocaleLowerCase();
  const extension = name.slice(name.lastIndexOf(".") + 1);

  if (name.includes("preisliste")) return "PRICE_LIST";
  if (name.includes("datenblatt")) return "DATASHEET";
  if (extension === "dwg") return "DRAWING";
  if (["jpg", "jpeg", "png"].includes(extension)) return "PHOTO";
  return "OTHER";
}

export function fileTooLargeMessage(): string {
  return `Datei zu groß (max. ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB)`;
}

function translateUploadError(message: string | undefined): string {
  if (!message) return "Datei-Upload fehlgeschlagen";
  if (/is not allowed/i.test(message)) {
    return "Dieser Dateityp wird nicht unterstützt. Erlaubt sind PDF, JPG, PNG, Word, Excel und DWG.";
  }
  if (/size|exceeds/i.test(message)) return fileTooLargeMessage();
  return message;
}

export async function uploadDocumentVersion(
  documentId: string,
  file: File,
): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);

  // apiFetch sends the session cookie and CSRF token and leaves the
  // multipart Content-Type to the browser.
  try {
    await apiFetch(`/documents/${documentId}/versions`, {
      method: "POST",
      body: formData,
    });
  } catch (error) {
    throw new Error(
      translateUploadError(error instanceof Error ? error.message : undefined),
    );
  }
}

export type DocumentDetail = DocumentListItem & {
  versions: DocumentVersion[];
};

/**
 * Loads a document through the session-bound client (never through a plain
 * URL the browser would fetch on its own): the request carries the session
 * context, is aborted when the context changes, and the bytes are only handed
 * out if the context was still the same after the LAST byte arrived.
 * `inline` is for previews (PDF/images only), `attachment` for downloads.
 */
export async function fetchDocumentBlob(
  documentId: string,
  options: {
    disposition?: "inline" | "attachment";
    versionId?: string;
    signal?: AbortSignal;
  } = {},
): Promise<{ blob: Blob; fileName: string | null }> {
  const params = new URLSearchParams();
  params.set("disposition", options.disposition ?? "inline");
  if (options.versionId) params.set("version", options.versionId);
  const startedIn = getContextEpoch();
  let blob: Blob;
  let fileName: string | null;
  try {
    const response = await apiFetchRaw(
      `/documents/${encodeURIComponent(documentId)}/download?${params.toString()}`,
      { signal: options.signal },
    );
    fileName = fileNameFromDisposition(response.headers.get("Content-Disposition"));
    blob = await response.blob();
    if (options.disposition !== "attachment" && !isPreviewableType(blob.type)) {
      throw new Error("Für diesen Dateityp ist keine Vorschau verfügbar.");
    }
  } catch (error) {
    if (getContextEpoch() !== startedIn) throw new SessionChangedError();
    throw error;
  }
  if (getContextEpoch() !== startedIn) throw new SessionChangedError();
  return { blob, fileName };
}

/**
 * Only these types may be shown inline from a blob: URL. A blob: URL belongs to
 * this origin, so anything that could run script (HTML, SVG, XML) must never
 * be rendered from one, whatever the server claims.
 */
export function isPreviewableType(mimeType: string): boolean {
  return /^(application\/pdf|image\/(png|jpeg|gif|webp))(;|$)/i.test(mimeType);
}

export function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      return null;
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : null;
}

export async function openDocumentDownload(
  documentId: string,
  versionId?: string,
): Promise<void> {
  const { blob, fileName } = await fetchDocumentBlob(documentId, {
    disposition: "attachment",
    versionId,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName ?? "dokument";
  link.rel = "noopener";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function archiveDocument(documentId: string) {
  return apiFetch(`/documents/${documentId}/archive`, { method: "POST" });
}

export function updateDocument(
  documentId: string,
  patch: { title?: string; type?: DocumentType; tags?: string[] },
) {
  return apiFetch<DocumentListItem>(`/documents/${documentId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/**
 * Creates the document and uploads its first file. If the upload fails the
 * empty document is archived again so no file-less entry stays in the list.
 */
export async function createDocumentWithFile(
  input: {
    title: string;
    type: DocumentType;
    tags?: string[];
    customerId?: string;
    projectId?: string;
  },
  file: File,
): Promise<void> {
  const created = await apiFetch<{ id: string }>("/documents", {
    method: "POST",
    body: JSON.stringify(input),
  });

  try {
    await uploadDocumentVersion(created.id, file);
  } catch (uploadError) {
    await archiveDocument(created.id).catch(() => undefined);
    throw uploadError;
  }
}
