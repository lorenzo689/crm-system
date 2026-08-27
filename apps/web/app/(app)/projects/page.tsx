"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import {
  ProjectFormModal,
  type CustomerOption,
  type Project,
} from "./_components/project-form-modal";
import {
  statusLabels,
  statusStyles,
} from "./_components/project-constants";

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [archiveFilter, setArchiveFilter] =
    useState<ArchiveFilter>("active");
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
  }, [
    archiveFilter,
    customerFilter,
    projects,
    searchQuery,
    statusFilter,
  ]);

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
    <div className="p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium tracking-wider text-amber-600">
            PROJEKTE
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900">
            Projektübersicht
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
            {archiveTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
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

      <div className="mb-4 flex flex-wrap gap-3">
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

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-400">
              <th className="px-4 py-3 font-medium">Projektnummer</th>
              <th className="px-4 py-3 font-medium">Projektname</th>
              <th className="px-4 py-3 font-medium">Kunde</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Verantwortlich</th>
              <th className="px-4 py-3 font-medium">Fällig</th>
            </tr>
          </thead>
          <tbody>
            {filteredProjects.map((project) => {
              const owner = project.members[0]?.user.displayName ?? "–";

              return (
                <tr
                  key={project.id}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                >
                  <td className="px-4 py-3 text-zinc-600">
                    {project.projectNumber}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-medium text-zinc-900 transition hover:text-amber-600 hover:underline"
                    >
                      {project.name}
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
