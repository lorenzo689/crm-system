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
import {
  FiChevronDown,
  FiChevronRight,
  FiFolder,
  FiHome,
  FiSearch,
  FiUpload,
  FiGrid,
  FiList,
  FiFilter,
  FiFileText,
} from "react-icons/fi";
import "./documents.css";
import { DocumentsTable } from "./documents-table";

type Scope = "all" | "global" | "customer" | "project";

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
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderSearch, setFolderSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [view, setView] = useState<"list" | "grid">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState({ customer: true, project: true });
  const [typeFilter, setTypeFilter] = useState<DocumentType | null>(null);

  // Ergebnisse tragen den Schlüssel ihrer Anfrage: Solange der aktuelle Schlüssel
  // noch nicht beantwortet ist, bleibt die letzte Liste sichtbar (kein Springen).
  const requestKey = `${scope}|${query}|${reloadKey}`;
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
  }, [scope, query, requestKey]);

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

  const folderDocuments =
    documents?.filter(
      (doc) =>
        !folderId ||
        (scope === "project"
          ? doc.projectId === folderId
          : doc.customerId === folderId),
    ) ?? null;
  const filteredDocuments =
    folderDocuments
      ?.filter((doc) => !typeFilter || doc.type === typeFilter)
      .sort((a, b) =>
        sort === "name"
          ? a.title.localeCompare(b.title, "de")
          : sort === "newest"
            ? Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
            : (b.currentVersion?.sizeBytes ?? 0) -
              (a.currentVersion?.sizeBytes ?? 0),
      ) ?? null;
  const pageCount = Math.max(
    1,
    Math.ceil((filteredDocuments?.length ?? 0) / 10),
  );
  const currentPage = Math.min(page, pageCount);
  const visibleDocuments =
    filteredDocuments?.slice((currentPage - 1) * 10, currentPage * 10) ?? null;
  const folderName = folderId
    ? ((scope === "project" ? projects : customers).find(
        (item) => item.id === folderId,
      )?.name ?? "Ordner")
    : {
        all: "Alle Dokumente",
        global: "Allgemeine Dokumente",
        customer: "Kunden",
        project: "Projekte",
      }[scope];
  function selectFolder(nextScope: Scope, id: string | null = null) {
    setScope(nextScope);
    setFolderId(id);
    setTypeFilter(null);
    setPage(1);
  }
  const hasActiveFilter =
    scope !== "all" || typeFilter !== null || query !== "";

  function applyUpdate(updated: DocumentListItem) {
    setLoaded(
      (current) =>
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
    setLoaded(
      (current) =>
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
      className="documents-page relative min-h-full"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="documents-heading">
        <h1>Dokumente</h1>
        <p>
          Projektdokumente, Planungen, technische Unterlagen und weitere Dateien
          zentral verwalten.
        </p>
      </div>
      <div className="documents-toolbar">
        <nav aria-label="Brotkrümelnavigation" className="documents-breadcrumb">
          <button
            aria-label="Alle Dokumente"
            onClick={() => selectFolder("all")}
          >
            <FiHome />
          </button>
          <FiChevronRight />
          <button onClick={() => selectFolder(scope)}>
            {scope === "project"
              ? "Projekte"
              : scope === "customer"
                ? "Kunden"
                : "Dokumente"}
          </button>
          <FiChevronRight />
          <strong>{folderName}</strong>
        </nav>
        <div className="documents-tools">
          <div className="documents-view-toggle">
            <button
              aria-label="Kachelansicht"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <FiGrid />
            </button>
            <button
              aria-label="Listenansicht"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <FiList />
            </button>
          </div>
          <select
            aria-label="Dokumente sortieren"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            <option value="name">Sortieren: Name (A–Z)</option>
            <option value="newest">Zuletzt geändert</option>
            <option value="size">Größe absteigend</option>
          </select>
          <button
            className="documents-button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <FiFilter />
            Filtern{query ? " •" : ""}
          </button>
          <button
            className="documents-button documents-gold"
            onClick={() => openUpload(null)}
          >
            <FiUpload />
            Dokument hochladen
          </button>
        </div>
      </div>
      {filtersOpen && (
        <div className="documents-filter-bar">
          <FiSearch />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPage(1);
            }}
            placeholder="Nach Titel, Tag oder Dateiname suchen …"
            aria-label="Dokumente durchsuchen"
          />
          <button
            onClick={() => {
              setSearchInput("");
              setTypeFilter(null);
              setPage(1);
            }}
          >
            Filter zurücksetzen
          </button>
        </div>
      )}
      <div
        className={`documents-workspace ${previewDocument ? "has-preview" : ""}`}
      >
        <aside className="documents-folders documents-panel">
          <h2>Ordner</h2>
          <label className="documents-folder-search">
            <FiSearch />
            <input
              value={folderSearch}
              onChange={(event) => setFolderSearch(event.target.value)}
              placeholder="Ordner durchsuchen …"
              aria-label="Ordner durchsuchen"
            />
          </label>
          <nav aria-label="Dokumentordner">
            <button
              className={`documents-folder root ${scope === "all" ? "active" : ""}`}
              onClick={() => selectFolder("all")}
            >
              <FiChevronDown />
              <FiFolder />
              <span>Bissinger Lights</span>
            </button>
            {(["customer", "project"] as const).map((kind) => (
              <div key={kind}>
                <div
                  className={`documents-folder-group ${scope === kind && !folderId ? "active" : ""}`}
                >
                  <button
                    aria-label={`${kind === "customer" ? "Kunden" : "Projekte"} ${expanded[kind] ? "einklappen" : "ausklappen"}`}
                    aria-expanded={expanded[kind]}
                    onClick={() =>
                      setExpanded((value) => ({
                        ...value,
                        [kind]: !value[kind],
                      }))
                    }
                  >
                    {expanded[kind] ? <FiChevronDown /> : <FiChevronRight />}
                  </button>
                  <button onClick={() => selectFolder(kind)}>
                    <FiFolder />
                    <span>{kind === "customer" ? "Kunden" : "Projekte"}</span>
                  </button>
                </div>
                {expanded[kind] &&
                  (kind === "project" ? projects : customers)
                    .filter((item) =>
                      item.name
                        .toLocaleLowerCase()
                        .includes(folderSearch.toLocaleLowerCase()),
                    )
                    .map((item) => (
                      <button
                        key={item.id}
                        title={item.name}
                        className={`documents-folder child ${scope === kind && folderId === item.id ? "active" : ""}`}
                        onClick={() => selectFolder(kind, item.id)}
                      >
                        <FiFolder />
                        <span>{item.name}</span>
                      </button>
                    ))}
              </div>
            ))}
            <button
              className={`documents-folder ${scope === "global" ? "active" : ""}`}
              onClick={() => selectFolder("global")}
            >
              <FiChevronRight />
              <FiFolder />
              <span>Allgemeine Dokumente</span>
            </button>
          </nav>
        </aside>
        <section
          className="documents-files documents-panel"
          aria-label="Dateien"
        >
          <div className="documents-folder-heading">
            <FiFolder />
            <div>
              <h2>{folderName}</h2>
              <p>
                {scope === "project"
                  ? "Planungsunterlagen, Angebote und Projektdateien"
                  : "Alle Unterlagen und Dateien an einem Ort"}
              </p>
            </div>
          </div>
          <div className="documents-type-tabs">
            <button
              aria-pressed={!typeFilter}
              onClick={() => {
                setTypeFilter(null);
                setPage(1);
              }}
            >
              Alle ({folderDocuments?.length ?? 0})
            </button>
            {(Object.entries(documentTypeLabels) as [DocumentType, string][])
              .filter(([value]) =>
                folderDocuments?.some((doc) => doc.type === value),
              )
              .map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={typeFilter === value}
                  onClick={() => {
                    setTypeFilter(typeFilter === value ? null : value);
                    setPage(1);
                  }}
                >
                  {label} (
                  {folderDocuments?.filter((doc) => doc.type === value).length})
                </button>
              ))}
          </div>
          <DocumentsTable
            documents={visibleDocuments}
            error={error}
            isRefreshing={isFetching && documents !== null}
            hasActiveFilter={hasActiveFilter || !!folderId}
            customerNameByProject={customerNameByProject}
            onRetry={() => setReloadKey((current) => current + 1)}
            onSelect={setPreviewDocument}
            selectedId={previewDocument?.id}
            view={view}
          />
          <footer className="documents-pagination">
            <span aria-live="polite">
              {isFetching
                ? "Dokumente werden geladen …"
                : `${visibleDocuments?.length ?? 0} von ${filteredDocuments?.length ?? 0} Dateien`}
            </span>
            <div>
              <button
                aria-label="Vorherige Seite"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                <FiChevronRight className="rotate-180" />
              </button>
              <span className="documents-page-number">{currentPage}</span>
              <span>/ {pageCount}</span>
              <button
                aria-label="Nächste Seite"
                disabled={currentPage >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                <FiChevronRight />
              </button>
            </div>
          </footer>
        </section>
        {previewDocument ? (
          <DocumentPreview
            key={previewDocument.id}
            document={previewDocument}
            customerNameByProject={customerNameByProject}
            onClose={() => setPreviewDocument(null)}
            onChanged={applyUpdate}
            onArchived={applyArchived}
          />
        ) : (
          <aside className="documents-preview-empty documents-panel">
            <FiFileText />
            <h2>Dokumentvorschau</h2>
            <p>
              Wähle eine Datei aus, um die Vorschau, Details und den
              Versionsverlauf anzuzeigen.
            </p>
          </aside>
        )}
      </div>

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
    </div>
  );
}
