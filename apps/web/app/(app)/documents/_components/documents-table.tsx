"use client";

import { FiDownload, FiFile, FiImage } from "react-icons/fi";
import { useState } from "react";
import {
  documentTypeLabels,
  formatFileSize,
  openDocumentDownload,
  type DocumentListItem,
} from "@/lib/documents";

type DocumentsTableProps = {
  selectedId?: string;
  view?: "list" | "grid";
  documents: DocumentListItem[] | null;
  error: string | null;
  isRefreshing: boolean;
  hasActiveFilter: boolean;
  customerNameByProject: Map<string, string>;
  onRetry: () => void;
  onSelect: (document: DocumentListItem) => void;
};

const columns = [
  { label: "Name ↑", className: "w-[43%]" },
  { label: "Typ", className: "w-[9%]" },
  { label: "Größe", className: "w-[10%]" },
  { label: "Version", className: "w-[10%]" },
  { label: "Geändert am", className: "w-[14%]" },
  { label: "Von", className: "w-[8%]" },
  { label: "", className: "w-[6%]" },
];

export function FileIcon({ document }: { document: DocumentListItem }) {
  const extension =
    document.currentVersion?.fileName.split(".").pop()?.toUpperCase() ??
    "DATEI";
  const kind = document.currentVersion?.mimeType.startsWith("image/")
    ? "image"
    : extension === "PDF"
      ? "pdf"
      : ["XLS", "XLSX"].includes(extension)
        ? "sheet"
        : "other";
  return (
    <span className={`documents-file-icon ${kind}`}>
      {kind === "image" ? <FiImage /> : <FiFile />}
      <small>{extension.slice(0, 4)}</small>
    </span>
  );
}

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
  selectedId,
  view = "list",
  error,
  isRefreshing,
  hasActiveFilter,
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
        aria-selected={selectedId === document.id}
        onClick={() => onSelect(document)}
        onKeyDown={(event) => {
          if (
            (event.key === "Enter" || event.key === " ") &&
            event.target === event.currentTarget
          ) {
            event.preventDefault();
            onSelect(document);
          }
        }}
        className="documents-file-row"
      >
        <td>
          <div className="documents-file-name">
            <FileIcon document={document} />
            <div>
              <p title={document.title}>{document.title}</p>
              <span>
                {document.tags.length
                  ? document.tags.join(" \u00b7 ")
                  : (document.project?.name ??
                    document.customer?.name ??
                    documentTypeLabels[document.type])}
              </span>
            </div>
          </div>
        </td>
        <td>
          {document.currentVersion?.fileName.split(".").pop()?.toUpperCase() ??
            "–"}
        </td>
        <td>
          {document.currentVersion
            ? formatFileSize(document.currentVersion.sizeBytes)
            : "–"}
        </td>
        <td>
          <span className="documents-version-badge">
            {document.currentVersion
              ? `v${document.currentVersion.versionNumber}.0`
              : "–"}
          </span>
        </td>
        <td>{new Date(document.updatedAt).toLocaleDateString("de-DE")}</td>
        <td>
          <span
            className="documents-avatar"
            title={
              document.currentVersion?.uploadedBy.displayName ??
              document.author.displayName
            }
          >
            {(
              document.currentVersion?.uploadedBy.displayName ??
              document.author.displayName
            )
              .split(/\s+/)
              .map((part) => part[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </span>
        </td>
        <td>
          <button
            type="button"
            aria-label={`${document.title} herunterladen`}
            disabled={!document.currentVersion || downloadingId === document.id}
            onClick={(event) => {
              event.stopPropagation();
              void handleDownload(document);
            }}
            className="documents-row-action"
          >
            <FiDownload />
          </button>
        </td>
      </tr>
    ));
  }

  if (view === "grid" && documents?.length && !error)
    return (
      <div className="documents-file-grid" aria-busy={isRefreshing}>
        {documents.map((document) => (
          <button
            key={document.id}
            className={`documents-file-card ${selectedId === document.id ? "active" : ""}`}
            onClick={() => onSelect(document)}
          >
            <FileIcon document={document} />
            <strong>{document.title}</strong>
            <span>
              {documentTypeLabels[document.type]} ·{" "}
              {document.currentVersion
                ? formatFileSize(document.currentVersion.sizeBytes)
                : "Keine Datei"}
            </span>
            <span>
              {document.project?.name ?? document.customer?.name ?? "Global"}
            </span>
          </button>
        ))}
      </div>
    );

  return (
    <div>
      <div
        className={`documents-table-wrap transition-opacity ${
          isRefreshing ? "opacity-60" : "opacity-100"
        }`}
      >
        {showTable ? (
          <table className="documents-table w-full table-fixed">
            <thead>
              <tr className="text-left">
                {columns.map((column) => (
                  <th
                    key={column.label}
                    className={`font-medium ${column.className}`}
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
