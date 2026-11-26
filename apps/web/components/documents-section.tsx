"use client";

import { useState } from "react";
import { useApiResource } from "@/lib/use-api-resource";
import { DocumentUploadModal } from "@/components/document-upload-modal";
import { VersionUploadModal } from "@/components/version-upload-modal";
import {
  documentTypeLabels,
  formatFileSize,
  openDocumentDownload,
  type DocumentType,
  type DocumentVersion,
} from "@/lib/documents";

type Document = {
  id: string;
  title: string;
  type: DocumentType;
  archivedAt: string | null;
  author: { id: string; displayName: string };
  currentVersion: DocumentVersion | null;
  _count?: { versions: number };
};

type DocumentsSectionProps = {
  contextParam: "customerId" | "projectId";
  contextId: string;
};

export function DocumentsSection({
  contextParam,
  contextId,
}: DocumentsSectionProps) {
  const {
    data,
    isLoading,
    error,
    reload,
    setError,
  } = useApiResource<Document[]>(
    `/documents?${contextParam}=${contextId}`,
    "Fehler beim Laden",
  );
  const documents = data ?? [];
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [versionUploadTarget, setVersionUploadTarget] = useState<string | null>(
    null,
  );

  async function handleDownload(documentId: string) {
    setOpenMenuId(null);
    setDownloadingId(documentId);
    try {
      await openDocumentDownload(documentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download fehlgeschlagen");
    } finally {
      setDownloadingId(null);
    }
  }

  if (isLoading) return <p className="text-sm text-zinc-400">Lädt…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {documents.length} Dokument{documents.length === 1 ? "" : "e"}
        </p>
        <button
          type="button"
          onClick={() => setIsUploadOpen(true)}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + Dokument hochladen
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white">
        {documents.length === 0 ? (
          <p className="px-4 py-4 text-sm text-zinc-500">
            Noch keine Dokumente vorhanden.
          </p>
        ) : (
          <div className="divide-y divide-zinc-200">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {doc.title}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {documentTypeLabels[doc.type]}
                    {doc.currentVersion && (
                      <>
                        {" · v"}
                        {doc.currentVersion.versionNumber}
                        {" · "}
                        {formatFileSize(doc.currentVersion.sizeBytes)}
                      </>
                    )}
                  </p>
                </div>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMenuId((current) =>
                        current === doc.id ? null : doc.id,
                      )
                    }
                    className="rounded-full p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600"
                    aria-label="Aktionen"
                  >
                    ⋮
                  </button>

                  {openMenuId === doc.id && (
                    <div
                      className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
                      onMouseLeave={() => setOpenMenuId(null)}
                    >
                      {doc.currentVersion && (
                        <button
                          type="button"
                          onClick={() => handleDownload(doc.id)}
                          disabled={downloadingId === doc.id}
                          className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                        >
                          {downloadingId === doc.id
                            ? "Lädt…"
                            : "Herunterladen"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setVersionUploadTarget(doc.id);
                          setOpenMenuId(null);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                      >
                        Neue Version hochladen
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DocumentUploadModal
        isOpen={isUploadOpen}
        contextParam={contextParam}
        contextId={contextId}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={reload}
      />

      {versionUploadTarget && (
        <VersionUploadModal
          documentId={versionUploadTarget}
          isOpen={true}
          onClose={() => setVersionUploadTarget(null)}
          onUploaded={reload}
        />
      )}
    </div>
  );
}
