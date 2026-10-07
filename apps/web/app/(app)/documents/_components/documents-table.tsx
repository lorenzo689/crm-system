"use client";

import { useState } from "react";
import {
  documentTypeLabels,
  formatFileSize,
  openDocumentDownload,
  type DocumentListItem,
} from "@/lib/documents";
import { DocumentAssignment } from "./document-assignment";

type DocumentsTableProps = {
  documents: DocumentListItem[] | null;
  error: string | null;
  isRefreshing: boolean;
  hasActiveFilter: boolean;
  customerNameByProject: Map<string, string>;
  onRetry: () => void;
  onSelect: (document: DocumentListItem) => void;
};

const columns = [
  { label: "Titel", className: "w-[28%]" },
  { label: "Typ", className: "w-[11%]" },
  { label: "Zuordnung", className: "w-[19%]" },
  { label: "Version", className: "w-[8%]" },
  { label: "Größe", className: "w-[9%]" },
  { label: "Hochgeladen", className: "w-[17%]" },
  { label: "Aktion", className: "w-[8%]" },
];

export function TypeBadge({ type }: { type: DocumentListItem["type"] }) {
  return (
    <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      {documentTypeLabels[type]}
    </span>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <tr key={index} className="border-b border-zinc-100 last:border-0">
          {columns.map((column) => (
            <td key={column.label} className="px-4 py-3">
              <div className="h-4 animate-pulse rounded bg-zinc-100" />
              {column.label === "Titel" && (
                <div className="mt-1.5 h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Message({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-4 py-12 text-center">
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-zinc-400">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function DocumentsTable({
  documents,
  error,
  isRefreshing,
  hasActiveFilter,
  customerNameByProject,
  onRetry,
  onSelect,
}: DocumentsTableProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload(document: DocumentListItem) {
    if (!document.currentVersion) return;
    setDownloadingId(document.id);
    setDownloadError(null);
    try {
      await openDocumentDownload(document.id);
    } catch (caughtError) {
      setDownloadError(
        caughtError instanceof Error
          ? caughtError.message
          : "Download fehlgeschlagen",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  let body: React.ReactNode;
  let showTable = true;

  if (error) {
    showTable = false;
    body = (
      <Message
        title="Dokumente konnten nicht geladen werden"
        hint={error}
        action={
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Erneut versuchen
          </button>
        }
      />
    );
  } else if (documents && documents.length === 0) {
    showTable = false;
    body = hasActiveFilter ? (
      <Message
        title="Keine Treffer"
        hint="Passe Suche oder Filter an, um Dokumente zu finden."
      />
    ) : (
      <Message
        title="Noch keine Dokumente"
        hint="Lade ein Dokument hoch oder ziehe eine Datei auf diese Seite."
      />
    );
  } else if (documents === null) {
    body = <SkeletonRows />;
  } else {
    body = documents.map((document) => (
      <tr
        key={document.id}
        tabIndex={0}
        onClick={() => onSelect(document)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && event.target === event.currentTarget) {
            onSelect(document);
          }
        }}
        className="cursor-pointer border-b border-zinc-100 outline-none transition-colors last:border-0 hover:bg-zinc-50 focus-visible:bg-zinc-50"
      >
        <td className="px-4 py-3 align-top">
          <p className="truncate font-medium text-zinc-900">{document.title}</p>
          {document.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {document.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </td>
        <td className="px-4 py-3 align-top">
          <TypeBadge type={document.type} />
        </td>
        <td className="px-4 py-3 align-top text-zinc-600">
          <DocumentAssignment
            document={document}
            customerNameByProject={customerNameByProject}
          />
        </td>
        <td className="px-4 py-3 align-top text-zinc-600">
          {document.currentVersion
            ? `v${document.currentVersion.versionNumber}`
            : "–"}
        </td>
        <td className="px-4 py-3 align-top text-zinc-600">
          {document.currentVersion
            ? formatFileSize(document.currentVersion.sizeBytes)
            : "–"}
        </td>
        <td className="px-4 py-3 align-top text-zinc-600">
          {document.currentVersion ? (
            <>
              <p className="truncate">
                {document.currentVersion.uploadedBy.displayName}
              </p>
              <p className="text-xs text-zinc-400">
                {new Date(document.currentVersion.createdAt).toLocaleDateString(
                  "de-DE",
                )}
              </p>
            </>
          ) : (
            "–"
          )}
        </td>
        <td className="px-4 py-3 align-top">
          {document.currentVersion && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void handleDownload(document);
              }}
              disabled={downloadingId === document.id}
              className="text-xs text-zinc-500 hover:text-zinc-800 hover:underline disabled:opacity-50"
            >
              {downloadingId === document.id ? "Lädt …" : "Download"}
            </button>
          )}
        </td>
      </tr>
    ));
  }

  return (
    <div>
      <div
        className={`overflow-hidden rounded-xl border border-zinc-200 bg-white transition-opacity ${
          isRefreshing ? "opacity-60" : "opacity-100"
        }`}
      >
        {showTable ? (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-400">
                {columns.map((column) => (
                  <th
                    key={column.label}
                    className={`px-4 py-3 font-medium ${column.className}`}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{body}</tbody>
          </table>
        ) : (
          body
        )}
      </div>
      {downloadError && (
        <p className="mt-2 text-sm text-red-600">{downloadError}</p>
      )}
    </div>
  );
}
