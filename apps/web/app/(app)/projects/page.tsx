"use client";

import Link from "next/link";
import { FiFolder } from "react-icons/fi";
import type { Task } from "../tasks/_components/task-form-modal";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import {
  ProjectFormModal,
  type CustomerOption,
  type Project,
} from "./_components/project-form-modal";
import { statusLabels, statusStyles } from "./_components/project-constants";

type ArchiveFilter = "active" | "archived" | "all";
type StatusFilter = "all" | Project["status"];

const archiveTabs: { key: ArchiveFilter; label: string }[] = [
  { key: "active", label: "Laufend" },
  { key: "archived", label: "Archiviert" },
  { key: "all", label: "Alle" },
];

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [projectTasks, setProjectTasks] = useState<Task[] | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("create") !== "1") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsModalOpen(true);
      router.replace("/projects", { scroll: false });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [router, searchParams]);

  useEffect(() => {
    Promise.all([
      apiFetch<Project[]>("/projects"),
      apiFetch<CustomerOption[]>("/customers"),
    ])
      .then(([loadedProjects, loadedCustomers]) => {
        setProjects(loadedProjects);
        setCustomers(loadedCustomers);
      })
      .catch((caughtError: unknown) =>
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Projekte konnten nicht geladen werden.",
        ),
      )
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<Task[]>("/tasks", { signal: controller.signal })
      .then(setProjectTasks)
      .catch((error) => {
        if (!controller.signal.aborted)
          setProgressError(
            error instanceof Error
              ? error.message
              : "Fortschritt konnte nicht geladen werden.",
          );
      });
    return () => controller.abort();
  }, []);
  const progressByProject = useMemo(() => {
    const counts = new Map<string, { total: number; done: number }>();
    projectTasks?.forEach((task) => {
      if (!task.project || task.archivedAt || task.status === "CANCELLED")
        return;
      const count = counts.get(task.project.id) ?? { total: 0, done: 0 };
      count.total++;
      if (task.status === "COMPLETED") count.done++;
      counts.set(task.project.id, count);
    });
    return counts;
  }, [projectTasks]);

  const filteredProjects = useMemo(() => {
    let result = projects;

    if (archiveFilter === "archived") {
      result = result.filter((project) => project.archivedAt);
    } else if (archiveFilter === "active") {
      result = result.filter((project) => !project.archivedAt);
    }

    if (statusFilter !== "all") {
      result = result.filter((project) => project.status === statusFilter);
    }

    if (customerFilter !== "all") {
      result = result.filter(
        (project) => project.customer.id === customerFilter,
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (project) =>
          project.name.toLowerCase().includes(query) ||
          project.projectNumber.toLowerCase().includes(query),
      );
    }

    return result;
  }, [archiveFilter, customerFilter, projects, searchQuery, statusFilter]);

  function upsertProject(updatedProject: Project) {
    setProjects((current) => {
      const exists = current.some(
        (project) => project.id === updatedProject.id,
      );

      return exists
        ? current.map((project) =>
            project.id === updatedProject.id ? updatedProject : project,
          )
        : [...current, updatedProject];
    });
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  if (isLoading) {
    return <p className="p-8 text-sm text-zinc-400">Lädt…</p>;
  }

  if (error) {
    return <p className="p-8 text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="crm-page projects-page">
      <div className="crm-page-heading flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Projekte</h1>
          <p className="crm-subtitle">
            Alle Lichttechnik-Projekte von der Anfrage bis zur Abnahme.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            + Projekt anlegen
          </button>
        </div>
      </div>

      <div className="crm-tabs">
        {archiveTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={archiveFilter === tab.key}
            onClick={() => setArchiveFilter(tab.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              archiveFilter === tab.key
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="crm-filter-bar mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Projekt oder Projektnummer suchen…"
          className="w-full max-w-sm rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"
        />

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as StatusFilter)
          }
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 focus:border-amber-400 focus:outline-none"
        >
          <option value="all">Alle Status</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={customerFilter}
          onChange={(event) => setCustomerFilter(event.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 focus:border-amber-400 focus:outline-none"
        >
          <option value="all">Alle Kunden</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </div>

      {progressError && (
        <p role="status" className="mb-3 text-xs text-amber-700">
          Aufgabenfortschritt konnte nicht geladen werden.
        </p>
      )}
      <div className="crm-table-container overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-400">
              <th className="px-4 py-3 font-medium">Projekt</th>
              <th className="px-4 py-3 font-medium">Kunde</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Fortschritt</th>
              <th className="px-4 py-3 font-medium">Verantwortlich</th>
              <th className="px-4 py-3 font-medium">Fällig</th>
            </tr>
          </thead>
          <tbody>
            {filteredProjects.map((project) => {
              const counts = progressByProject.get(project.id);
              const progress = counts?.total
                ? Math.round((counts.done / counts.total) * 100)
                : null;
              const owner = project.members[0]?.user.displayName ?? "–";

              return (
                <tr
                  key={project.id}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${project.id}`}
                      className="crm-name font-medium text-zinc-900 transition hover:text-amber-600 hover:underline"
                    >
                      <FiFolder />
                      <span>
                        {project.name}
                        <small className="crm-project-number">
                          {project.projectNumber}
                        </small>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {project.customer.name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[project.status]}`}
                    >
                      {statusLabels[project.status]}
                    </span>
                  </td>
                  <td>
                    {progress !== null && projectTasks ? (
                      <span
                        className="crm-project-progress"
                        title={`${counts?.done} von ${counts?.total} Aufgaben erledigt`}
                      >
                        <progress
                          value={progress}
                          max={100}
                          aria-label={`Aufgabenfortschritt ${project.name}`}
                        />
                        <span>{progress} %</span>
                      </span>
                    ) : (
                      <span
                        title={
                          progressError ??
                          (projectTasks
                            ? "Keine auswertbaren Aufgaben"
                            : "Wird geladen")
                        }
                      >
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{owner}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {project.endsAt
                      ? new Date(project.endsAt).toLocaleDateString("de-DE")
                      : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredProjects.length === 0 && (
          <p className="p-8 text-center text-sm text-zinc-400">
            Keine Projekte gefunden.
          </p>
        )}
      </div>

      <ProjectFormModal
        isOpen={isModalOpen}
        project={null}
        customers={customers}
        onClose={closeModal}
        onSaved={upsertProject}
      />
    </div>
  );
}
