"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/auth-api";
import {
  TaskFormModal,
  type ProjectOption,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type UserOption,
} from "./_components/task-form-modal";

type ArchiveFilter = "active" | "archived" | "all";
type DueFilter = "all" | "overdue" | "today" | "upcoming";

const archiveTabs: { key: ArchiveFilter; label: string }[] = [
  { key: "active", label: "Laufend" },
  { key: "archived", label: "Archiviert" },
  { key: "all", label: "Alle" },
];

const statusStyles: Record<TaskStatus, string> = {
  OPEN: "bg-zinc-100 text-zinc-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  WAITING: "bg-amber-50 text-amber-700",
  BLOCKED: "bg-red-50 text-red-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-zinc-100 text-zinc-400",
};

const statusLabels: Record<TaskStatus, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Arbeit",
  WAITING: "Wartet",
  BLOCKED: "Blockiert",
  COMPLETED: "Erledigt",
  CANCELLED: "Storniert",
};

const priorityLabels: Record<TaskPriority, string> = {
  LOW: "Niedrig",
  MEDIUM: "Mittel",
  HIGH: "Hoch",
};

function isOpenStatus(status: TaskStatus) {
  return status !== "COMPLETED" && status !== "CANCELLED";
}

function getDayBounds() {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  return { startOfToday, endOfToday };
}

export default function TasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [currentUser, setCurrentUser] = useState<UserOption | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>(
    "all",
  );
  const [priorityFilter, setPriorityFilter] = useState<
    "all" | TaskPriority
  >("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [archiveFilter, setArchiveFilter] =
    useState<ArchiveFilter>("active");
  const [hideCompleted, setHideCompleted] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const [quickTitle, setQuickTitle] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);
  const isQuickAddingRef = useRef(false);

  useEffect(() => {
    if (searchParams.get("create") !== "1") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSelectedTask(null);
      setIsModalOpen(true);
      router.replace("/tasks", { scroll: false });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [router, searchParams]);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) {
      return;
    }

    apiFetch<Task>(`/tasks/${openId}`)
      .then((task) => {
        setSelectedTask(task);
        setIsModalOpen(true);
      })
      .catch(() => undefined)
      .finally(() => {
        router.replace("/tasks", { scroll: false });
      });
  }, [router, searchParams]);

  useEffect(() => {
    Promise.all([
      apiFetch<Task[]>("/tasks"),
      apiFetch<ProjectOption[]>("/projects"),
      apiFetch<UserOption[]>("/users"),
      apiFetch<{ showCompletedTasks: boolean }>("/settings").catch(() => ({
        showCompletedTasks: true,
      })),
      apiFetch<UserOption>("/users/me").catch(() => null),
    ])
      .then(([loadedTasks, loadedProjects, loadedUsers, settings, me]) => {
        setTasks(loadedTasks);
        setProjects(loadedProjects);
        setUsers(loadedUsers);
        setCurrentUser(me);
        setHideCompleted(!settings.showCompletedTasks);
      })
      .catch((caughtError: unknown) =>
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Aufgaben konnten nicht geladen werden.",
        ),
      )
      .finally(() => setIsLoading(false));
  }, []);

  const filteredTasks = useMemo(() => {
    let result = tasks;

    if (archiveFilter === "archived") {
      result = result.filter((task) => task.archivedAt);
    } else if (archiveFilter === "active") {
      result = result.filter((task) => !task.archivedAt);
    }

    if (statusFilter !== "all") {
      result = result.filter((task) => task.status === statusFilter);
    }

    if (hideCompleted) {
      result = result.filter((task) => isOpenStatus(task.status));
    }

    if (priorityFilter !== "all") {
      result = result.filter((task) => task.priority === priorityFilter);
    }

    if (projectFilter === "none") {
      result = result.filter((task) => !task.project);
    } else if (projectFilter !== "all") {
      result = result.filter((task) => task.project?.id === projectFilter);
    }

    if (assigneeFilter !== "all") {
      result = result.filter((task) =>
        task.assignments.some(
          (assignment) => assignment.userId === assigneeFilter,
        ),
      );
    }

    if (dueFilter !== "all") {
      const { startOfToday, endOfToday } = getDayBounds();

      result = result.filter((task) => {
        if (!task.dueAt) {
          return false;
        }

        const due = new Date(task.dueAt);
        if (dueFilter === "overdue") {
          return due < startOfToday && isOpenStatus(task.status);
        }
        if (dueFilter === "today") {
          return due >= startOfToday && due < endOfToday;
        }
        if (dueFilter === "upcoming") {
          return due >= endOfToday;
        }
        return true;
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((task) =>
        task.title.toLowerCase().includes(query),
      );
    }

    return result;
  }, [
    archiveFilter,
    assigneeFilter,
    dueFilter,
    hideCompleted,
    priorityFilter,
    projectFilter,
    searchQuery,
    statusFilter,
    tasks,
  ]);

  function resetFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setProjectFilter("all");
    setAssigneeFilter("all");
    setDueFilter("all");
    setArchiveFilter("active");
  }

  function upsertTask(savedTask: Task) {
    setTasks((current) => {
      const exists = current.some((task) => task.id === savedTask.id);
      return exists
        ? current.map((task) =>
            task.id === savedTask.id ? savedTask : task,
          )
        : [...current, savedTask];
    });
  }

  function patchTask(taskId: string, patch: Partial<Task>) {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, ...patch } : task,
      ),
    );
  }

  async function handleQuickAdd(event: React.FormEvent) {
    event.preventDefault();
    const title = quickTitle.trim();
    if (!title || isQuickAddingRef.current) {
      return;
    }

    isQuickAddingRef.current = true;
    setQuickError(null);
    try {
      const created = await apiFetch<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify({ title, priority: "MEDIUM" }),
      });

      let saved = created;
      if (currentUser) {
        try {
          await apiFetch(`/tasks/${created.id}/assignments`, {
            method: "POST",
            body: JSON.stringify({
              userId: currentUser.id,
              role: "RESPONSIBLE",
            }),
          });
          saved = {
            ...created,
            assignments: [
              {
                userId: currentUser.id,
                role: "RESPONSIBLE",
                user: {
                  id: currentUser.id,
                  displayName: currentUser.displayName,
                },
              },
            ],
          };
        } catch {
          setQuickError(
            "Aufgabe wurde angelegt, konnte dir aber nicht zugewiesen werden.",
          );
        }
      }

      upsertTask(saved);
      setQuickTitle("");
    } catch (caughtError) {
      setQuickError(
        caughtError instanceof Error
          ? caughtError.message
          : "Aufgabe konnte nicht angelegt werden.",
      );
    } finally {
      isQuickAddingRef.current = false;
      quickInputRef.current?.focus();
    }
  }

  async function handleToggleDone(task: Task) {
    const wasCompleted = task.status === "COMPLETED";
    const previous = { status: task.status, completedAt: task.completedAt };

    setActionError(null);
    patchTask(task.id, {
      status: wasCompleted ? "OPEN" : "COMPLETED",
      completedAt: wasCompleted ? null : new Date().toISOString(),
    });

    try {
      const saved = wasCompleted
        ? await apiFetch<Task>(`/tasks/${task.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "OPEN" }),
          })
        : await apiFetch<Task>(`/tasks/${task.id}/complete`, {
            method: "POST",
          });
      patchTask(task.id, {
        status: saved.status,
        completedAt: saved.completedAt,
      });
    } catch (caughtError) {
      patchTask(task.id, previous);
      setActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "Status konnte nicht geändert werden.",
      );
    }
  }

  async function handleArchiveToggle(task: Task) {
    const restoring = Boolean(task.archivedAt);

    setActionError(null);
    try {
      // The archive endpoints return the bare task, so only take archivedAt.
      const saved = await apiFetch<{ archivedAt: string | null }>(
        `/tasks/${task.id}/${restoring ? "unarchive" : "archive"}`,
        { method: "POST" },
      );
      patchTask(task.id, { archivedAt: saved.archivedAt });
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "Archivieren fehlgeschlagen.",
      );
    }
  }

  function closeModal() {
    setIsModalOpen(false);
    setSelectedTask(null);
  }

  if (isLoading) {
    return <p className="p-8 text-sm text-zinc-400">Lädt…</p>;
  }

  if (error) {
    return <p className="p-8 text-sm text-red-600">{error}</p>;
  }

  const { startOfToday, endOfToday } = getDayBounds();

  return (
    <div className="p-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium tracking-wider text-amber-600">
            AUFGABEN
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900">
            Aufgabenübersicht
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
              setSelectedTask(null);
              setIsModalOpen(true);
            }}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            + Aufgabe anlegen
          </button>
        </div>
      </div>

      <form onSubmit={handleQuickAdd} className="mb-4">
        <input
          ref={quickInputRef}
          type="text"
          value={quickTitle}
          onChange={(event) => setQuickTitle(event.target.value)}
          placeholder="Neue Aufgabe … (Enter zum Anlegen)"
          maxLength={200}
          aria-label="Neue Aufgabe"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"
        />
        {quickError && (
          <p className="mt-1 text-sm text-red-600">{quickError}</p>
        )}
      </form>

      {actionError && (
        <p className="mb-3 text-sm text-red-600">{actionError}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Aufgabe suchen…"
          className="w-full max-w-xs rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none"
        />

        {currentUser && (
          <button
            type="button"
            aria-pressed={assigneeFilter === currentUser.id}
            onClick={() =>
              setAssigneeFilter((current) =>
                current === currentUser.id ? "all" : currentUser.id,
              )
            }
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              assigneeFilter === currentUser.id
                ? "border-amber-400 bg-amber-50 text-amber-800"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Meine Aufgaben
          </button>
        )}

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as typeof statusFilter)
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
          value={priorityFilter}
          onChange={(event) =>
            setPriorityFilter(event.target.value as typeof priorityFilter)
          }
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 focus:border-amber-400 focus:outline-none"
        >
          <option value="all">Alle Prioritäten</option>
          {Object.entries(priorityLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 focus:border-amber-400 focus:outline-none"
        >
          <option value="all">Alle Projekte</option>
          <option value="none">Ohne Projekt</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <select
          value={assigneeFilter}
          onChange={(event) => setAssigneeFilter(event.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 focus:border-amber-400 focus:outline-none"
        >
          <option value="all">Alle Verantwortlichen</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.displayName}
            </option>
          ))}
        </select>

        <select
          value={dueFilter}
          onChange={(event) => setDueFilter(event.target.value as DueFilter)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 focus:border-amber-400 focus:outline-none"
        >
          <option value="all">Alle Fälligkeiten</option>
          <option value="overdue">Überfällig</option>
          <option value="today">Heute fällig</option>
          <option value="upcoming">Bevorstehend</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(event) => setHideCompleted(event.target.checked)}
          />
          Erledigte ausblenden
        </label>

        <button
          type="button"
          onClick={resetFilters}
          className="text-sm text-zinc-500 hover:text-zinc-700 hover:underline"
        >
          Filter zurücksetzen
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wider text-zinc-400">
              <th className="w-10 px-4 py-3 font-medium">
                <span className="sr-only">Erledigt</span>
              </th>
              <th className="px-4 py-3 font-medium">Titel</th>
              <th className="px-4 py-3 font-medium">Projekt</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Priorität</th>
              <th className="px-4 py-3 font-medium">Verantwortlich</th>
              <th className="px-4 py-3 font-medium">Fällig</th>
              <th className="px-4 py-3 font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task) => {
              const responsible =
                task.assignments.find(
                  (assignment) => assignment.role === "RESPONSIBLE",
                )?.user.displayName ?? "–";
              const isDone = task.status === "COMPLETED";
              const due = task.dueAt ? new Date(task.dueAt) : null;
              const isOverdue =
                due !== null && due < startOfToday && isOpenStatus(task.status);
              const isDueToday =
                due !== null &&
                due >= startOfToday &&
                due < endOfToday &&
                isOpenStatus(task.status);

              return (
                <tr
                  key={task.id}
                  data-overdue={isOverdue || undefined}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isDone}
                      disabled={task.status === "CANCELLED"}
                      onChange={() => handleToggleDone(task)}
                      aria-label={
                        isDone
                          ? `„${task.title}“ wieder öffnen`
                          : `„${task.title}“ erledigen`
                      }
                      className="h-4 w-4 cursor-pointer accent-emerald-600"
                    />
                  </td>
                  <td
                    className={`px-4 py-3 font-medium ${
                      isDone ? "text-zinc-400 line-through" : "text-zinc-900"
                    }`}
                  >
                    {task.title}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {task.project && (
                      <Link
                        href={`/projects/${task.project.id}`}
                        className="hover:text-zinc-900 hover:underline"
                      >
                        {task.project.name}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[task.status]}`}
                    >
                      {statusLabels[task.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {priorityLabels[task.priority]}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {responsible}
                  </td>
                  <td
                    className={`px-4 py-3 ${
                      isOverdue
                        ? "font-medium text-red-600"
                        : isDueToday
                          ? "font-medium text-amber-700"
                          : "text-zinc-600"
                    }`}
                  >
                    {due ? (
                      <span className="inline-flex items-center gap-1.5">
                        {isOverdue && (
                          <span
                            title="Überfällig"
                            className="inline-block h-2 w-2 rounded-full bg-red-600"
                          />
                        )}
                        {due.toLocaleDateString("de-DE")}
                        {isDueToday && (
                          <span className="text-xs font-normal">heute</span>
                        )}
                      </span>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTask(task);
                          setIsModalOpen(true);
                        }}
                        className="text-xs text-zinc-500 hover:text-zinc-800 hover:underline"
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchiveToggle(task)}
                        className="text-xs text-zinc-500 hover:text-zinc-800 hover:underline"
                      >
                        {task.archivedAt ? "Wiederherstellen" : "Archivieren"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredTasks.length === 0 && (
          <p className="p-8 text-center text-sm text-zinc-400">
            Keine Aufgaben gefunden.
          </p>
        )}
      </div>

      <TaskFormModal
        isOpen={isModalOpen}
        task={selectedTask}
        projects={projects}
        users={users}
        onClose={closeModal}
        onSaved={upsertTask}
      />
    </div>
  );
}
