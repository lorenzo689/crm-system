"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/auth-api";
import {
  documentTypeLabels,
  type DocumentListItem,
  type DocumentType,
} from "@/lib/documents";
import { DocumentPreview } from "./document-preview";
import {
  DocumentUploadDialog,
  type CustomerOption,
  type ProjectOption,
} from "./document-upload-dialog";
import { DocumentsTable } from "./documents-table";

type Scope = "all" | "global" | "customer" | "project";

const scopeTabs: { key: Scope; label: string }[] = [
  { key: "all", label: "Alle" },
  { key: "global", label: "Global" },
  { key: "customer", label: "Kunden" },
  { key: "project", label: "Projekte" },
];

const SEARCH_DEBOUNCE_MS = 250;

function hasFiles(event: React.DragEvent) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export function DocumentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loaded, setLoaded] = useState<{
    key: string;
    documents: DocumentListItem[];
  } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(
    null,
  );
  const [reloadKey, setReloadKey] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [typeFilter, setTypeFilter] = useState<DocumentType | null>(null);

  // Ergebnisse tragen den Schlüssel ihrer Anfrage: Solange der aktuelle Schlüssel
  // noch nicht beantwortet ist, bleibt die letzte Liste sichtbar (kein Springen).
  const requestKey = `${scope}|${typeFilter ?? ""}|${query}|${reloadKey}`;
  const documents = loaded?.documents ?? null;
  const error = failed?.key === requestKey ? failed.message : null;
  const isFetching = loaded?.key !== requestKey && failed?.key !== requestKey;

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadSession, setUploadSession] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  const [previewDocument, setPreviewDocument] =
    useState<DocumentListItem | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setQuery(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (scope !== "all") params.set("scope", scope);
    if (typeFilter) params.set("type", typeFilter);
    if (query) params.set("q", query);

    apiFetch<DocumentListItem[]>(`/documents?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((loaded) => setLoaded({ key: requestKey, documents: loaded }))
      .catch((caughtError: unknown) => {
        if (controller.signal.aborted) return;
        setFailed({
          key: requestKey,
          message:
            caughtError instanceof Error
              ? caughtError.message
              : "Dokumente konnten nicht geladen werden.",
        });
      });

    return () => controller.abort();
  }, [scope, typeFilter, query, requestKey]);

  // Deep link from the global search: /documents?open=<id> opens that preview.
  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;

    apiFetch<DocumentListItem>(`/documents/${openId}`)
      .then(setPreviewDocument)
      .catch(() => undefined)
      .finally(() => router.replace("/documents", { scroll: false }));
  }, [router, searchParams]);

  useEffect(() => {
    Promise.all([
      apiFetch<CustomerOption[]>("/customers"),
      apiFetch<ProjectOption[]>("/projects"),
    ])
      .then(([loadedCustomers, loadedProjects]) => {
        setCustomers(loadedCustomers);
        setProjects(loadedProjects);
      })
      .catch(() => undefined);
  }, []);

  const customerNameByProject = useMemo(
    () =>
      new Map(
        projects.map((project) => [project.id, project.customer.name] as const),
      ),
    [projects],
  );

  const hasActiveFilter = scope !== "all" || typeFilter !== null || query !== "";

  function applyUpdate(updated: DocumentListItem) {
    setLoaded((current) =>
      current && {
        ...current,
        documents: current.documents.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      },
    );
    setPreviewDocument(updated);
  }

  function applyArchived(documentId: string) {
    setLoaded((current) =>
      current && {
        ...current,
        documents: current.documents.filter((item) => item.id !== documentId),
      },
    );
    setPreviewDocument(null);
  }

  function openUpload(file: File | null) {
    setUploadFile(file);
    setUploadSession((current) => current + 1);
    setIsUploadOpen(true);
  }

  function handleDragEnter(event: React.DragEvent) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    if (!isUploadOpen) setIsDragging(true);
  }

  function handleDragOver(event: React.DragEvent) {
    if (hasFiles(event)) event.preventDefault();
  }

  function handleDragLeave(event: React.DragEvent) {
    if (!hasFiles(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (isUploadOpen) return;
    const file = event.dataTransfer.files[0];
    if (file) openUpload(file);
  }

  return (
    <div
      className="relative min-h-full p-8"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="mb-6 flex items-center justify-end">
        <button
          type="button"
          onClick={() => openUpload(null)}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Hochladen
        </button>
      </div>

      <input
        type="search"
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        placeholder="Nach Titel, Tag oder Dateiname suchen…"
        aria-label="Dokumente durchsuchen"
        className="mb-4 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"
      />

      <div className="mb-3 flex gap-1 self-start rounded-lg bg-zinc-100 p-1 w-fit">
        {scopeTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setScope(tab.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              scope === tab.key
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(Object.entries(documentTypeLabels) as [DocumentType, string][]).map(
          ([value, label]) => {
            const isActive = typeFilter === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={isActive}
                onClick={() => setTypeFilter(isActive ? null : value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {label}
              </button>
            );
          },
        )}
      </div>

      <div className="mb-2 flex h-5 items-center justify-between text-xs text-zinc-400">
        <span>
          {documents && !error
            ? `${documents.length} Dokument${documents.length === 1 ? "" : "e"}`
            : ""}
        </span>
        <span
          aria-live="polite"
          className={`transition-opacity ${
            isFetching && documents ? "opacity-100" : "opacity-0"
          }`}
        >
          Aktualisiert …
        </span>
      </div>

      <DocumentsTable
        documents={documents}
        error={error}
        isRefreshing={isFetching && documents !== null}
        hasActiveFilter={hasActiveFilter}
        customerNameByProject={customerNameByProject}
        onRetry={() => setReloadKey((current) => current + 1)}
        onSelect={setPreviewDocument}
      />

      {isDragging && (
        <div className="pointer-events-none absolute inset-4 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-amber-400 bg-white/80">
          <p className="text-sm font-medium text-zinc-700">
            Datei hier ablegen, um sie hochzuladen
          </p>
        </div>
      )}

      {isUploadOpen && (
        <DocumentUploadDialog
          key={uploadSession}
          initialFile={uploadFile}
          customers={customers}
          projects={projects}
          onClose={() => setIsUploadOpen(false)}
          onUploaded={() => setReloadKey((current) => current + 1)}
        />
      )}

      {previewDocument && (
        <DocumentPreview
          key={previewDocument.id}
          document={previewDocument}
          customerNameByProject={customerNameByProject}
          onClose={() => setPreviewDocument(null)}
          onChanged={applyUpdate}
          onArchived={applyArchived}
        />
      )}
    </div>
  );
}
