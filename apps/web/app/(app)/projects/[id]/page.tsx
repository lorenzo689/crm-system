"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/auth-api";
import { ActivityTimeline } from "@/components/activity-timeline";
import { DocumentsSection } from "@/components/documents-section";
import { NotesSection } from "@/components/notes-section";
import {
  priorityLabels,
  statusLabels,
  statusStyles,
  type ProjectPriority,
  type ProjectStatus,
} from "../_components/project-constants";
import {
  ProjectFormModal,
  type CustomerOption,
} from "../_components/project-form-modal";
import {
  ProjectTeam,
  type ProjectMember,
} from "../_components/project-team";
import { ProjectTasks } from "../_components/project-tasks";

type Project = {
  id: string;
  name: string;
  projectNumber: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  customer: { id: string; name: string };
  members: ProjectMember[];
};

type ProjectMutationResponse = Omit<Project, "customer" | "members">;
type Tab =
  | "overview"
  | "team"
  | "tasks"
  | "notes"
  | "activities"
  | "documents";

const tabs: { key: Tab; label: string }[] = [
  { key: "overview", label: "Übersicht" },
  { key: "team", label: "Team" },
  { key: "tasks", label: "Aufgaben" },
  { key: "notes", label: "Notizen" },
  { key: "activities", label: "Aktivitaeten" },
  { key: "documents", label: "Dokumente" },
];

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Project>(`/projects/${projectId}`),
      apiFetch<CustomerOption[]>("/customers"),
    ])
      .then(([loadedProject, loadedCustomers]) => {
        setProject(loadedProject);
        setCustomers(loadedCustomers);
      })
      .catch((caughtError: unknown) =>
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Projekt konnte nicht geladen werden.",
        ),
      )
      .finally(() => setIsLoading(false));
  }, [projectId]);

  async function reloadProject() {
    const reloadedProject = await apiFetch<Project>(`/projects/${projectId}`);
    setProject(reloadedProject);
  }

  async function handleArchiveToggle() {
    if (!project) {
      return;
    }

    setError(null);

    try {
      const action = project.archivedAt ? "unarchive" : "archive";
      const updated = await apiFetch<ProjectMutationResponse>(
        `/projects/${project.id}/${action}`,
        {
          method: "POST",
        },
      );
      setProject((current) =>
        current ? { ...current, ...updated } : current,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Archivstatus konnte nicht geändert werden.",
      );
    }
  }

  if (isLoading) {
    return <p className="p-8 text-sm text-zinc-400">Lädt…</p>;
  }

  if (error) {
    return <p className="p-8 text-sm text-red-600">{error}</p>;
  }

  if (!project) {
    return null;
  }

  return (
    <div className="p-8">
      <button
        type="button"
        onClick={() => router.push("/projects")}
        className="mb-4 text-sm text-zinc-500 hover:text-zinc-700"
      >
        ← Zurück zu Projekten
      </button>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs font-medium tracking-wider text-amber-600">
            {project.projectNumber}
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900">
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {project.customer.name}
          </p>
        </div>
      </div>

      <div className="mb-6 flex gap-1 border-b border-zinc-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-amber-500 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="max-w-2xl space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Status
              </p>
              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[project.status]}`}
              >
                {statusLabels[project.status]}
              </span>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Priorität
              </p>
              <span className="mt-2 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                {priorityLabels[project.priority]}
              </span>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Startdatum
              </p>
              <p className="mt-2 text-sm text-zinc-700">
                {project.startsAt
                  ? new Date(project.startsAt).toLocaleDateString("de-DE")
                  : "–"}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Zieldatum
              </p>
              <p className="mt-2 text-sm text-zinc-700">
                {project.endsAt
                  ? new Date(project.endsAt).toLocaleDateString("de-DE")
                  : "–"}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Beschreibung
            </p>
            <p className="mt-2 text-sm text-zinc-700">
              {project.description || (
                <span className="text-zinc-300">
                  Keine Beschreibung hinterlegt.
                </span>
              )}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Zuletzt geändert
            </p>
            <p className="mt-2 text-sm text-zinc-700">
              {new Date(project.updatedAt).toLocaleString("de-DE")}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Bearbeiten
            </button>
            <button
              type="button"
              onClick={handleArchiveToggle}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              {project.archivedAt ? "Entarchivieren" : "Archivieren"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "team" && (
        <ProjectTeam
          projectId={project.id}
          members={project.members}
          onMembersChange={(members) =>
            setProject((current) =>
              current ? { ...current, members } : current,
            )
          }
        />
      )}

      {activeTab === "tasks" && (
        <ProjectTasks projectId={project.id} projectName={project.name} />
      )}

      {activeTab === "notes" && (
        <NotesSection contextParam="projectId" contextId={project.id} />
      )}

      {activeTab === "activities" && (
        <div className="max-w-2xl">
          <ActivityTimeline contextParam="projectId" contextId={project.id} />
        </div>
      )}

      {activeTab === "documents" && (
        <div className="max-w-2xl">
          <DocumentsSection contextParam="projectId" contextId={project.id} />
        </div>
      )}

      <ProjectFormModal
        isOpen={isEditModalOpen}
        project={project}
        customers={customers}
        onClose={() => setIsEditModalOpen(false)}
        onSaved={async () => {
          await reloadProject();
        }}
      />
    </div>
  );
}
