import { apiFetch } from "@/lib/auth-api";

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

/** Signed URL; `inline` is for previews, `attachment` forces a file download. */
export async function getDocumentUrl(
  documentId: string,
  options: {
    signal?: AbortSignal;
    disposition?: "inline" | "attachment";
    versionId?: string;
  } = {},
): Promise<string> {
  const params = new URLSearchParams();
  params.set("disposition", options.disposition ?? "inline");
  if (options.versionId) params.set("version", options.versionId);

  const { url } = await apiFetch<{ url: string }>(
    `/documents/${documentId}/download-url?${params.toString()}`,
    { signal: options.signal },
  );
  return url;
}

export async function openDocumentDownload(
  documentId: string,
  versionId?: string,
): Promise<void> {
  const url = await getDocumentUrl(documentId, {
    disposition: "attachment",
    versionId,
  });
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  link.click();
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
