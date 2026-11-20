"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/auth-api";

export type TaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startAt: string | null;
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  project: { id: string; name: string; projectNumber: string } | null;
  assignments: {
    userId: string;
    role: string;
    user: { id: string; displayName: string };
  }[];
};

export type ProjectOption = { id: string; name: string };
export type UserOption = { id: string; displayName: string };

type TaskFormModalProps = {
  isOpen: boolean;
  task?: Task | null;
  projects: ProjectOption[];
  users: UserOption[];
  /** Preselected project when creating a new task (e.g. from a project page). */
  defaultProjectId?: string;
  onClose: () => void;
  onSaved: (task: Task) => void;
};

type FormState = {
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  responsibleUserId: string;
  startAt: string;
  dueAt: string;
};

const initialFormState: FormState = {
  projectId: "",
  title: "",
  description: "",
  status: "OPEN",
  priority: "MEDIUM",
  responsibleUserId: "",
  startAt: "",
  dueAt: "",
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

function toDateInputValue(isoString: string | null): string {
  if (!isoString) {
    return "";
  }
  return isoString.slice(0, 10);
}

function TaskFormModalContent({
  task,
  projects,
  users,
  defaultProjectId,
  onClose,
  onSaved,
}: TaskFormModalProps) {
  const [formState, setFormState] = useState<FormState>(() =>
    task
      ? {
          projectId: task.project?.id ?? "",
          title: task.title,
          description: task.description ?? "",
          status: task.status,
          priority: task.priority,
          responsibleUserId:
            task.assignments.find(
              (assignment) => assignment.role === "RESPONSIBLE",
            )?.userId ?? "",
          startAt: toDateInputValue(task.startAt),
          dueAt: toDateInputValue(task.dueAt),
        }
      : { ...initialFormState, projectId: defaultProjectId ?? "" },
  );
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setWarning(null);
    setIsSubmitting(true);

    try {
      const payload = {
        title: formState.title.trim(),
        description: formState.description.trim() || undefined,
        status: formState.status,
        priority: formState.priority,
        // Empty date field means "remove" when editing, "none" when creating.
        startAt: formState.startAt || (task ? null : undefined),
        dueAt: formState.dueAt || (task ? null : undefined),
      };

      let savedTask: Task;
      let assignmentFailed = false;
      const previousResponsibleId = task?.assignments.find(
        (assignment) => assignment.role === "RESPONSIBLE",
      )?.userId;

      if (task) {
        savedTask = await apiFetch<Task>(`/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...payload,
            projectId: formState.projectId || null,
          }),
        });
      } else {
        savedTask = await apiFetch<Task>("/tasks", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            projectId: formState.projectId || undefined,
          }),
        });
      }

      if (formState.responsibleUserId !== (previousResponsibleId ?? "")) {
        try {
          if (previousResponsibleId) {
            await apiFetch(
              `/tasks/${savedTask.id}/assignments/${previousResponsibleId}`,
              { method: "DELETE" },
            );
          }
          if (formState.responsibleUserId) {
            await apiFetch(`/tasks/${savedTask.id}/assignments`, {
              method: "POST",
              body: JSON.stringify({
                userId: formState.responsibleUserId,
                role: "RESPONSIBLE",
              }),
            });
          }
          savedTask = await apiFetch<Task>(`/tasks/${savedTask.id}`);
        } catch {
          assignmentFailed = true;
          setWarning(
            "Aufgabe wurde gespeichert, der Verantwortliche konnte aber nicht zugewiesen werden.",
          );
          try {
            savedTask = await apiFetch<Task>(`/tasks/${savedTask.id}`);
          } catch {
            // Der gespeicherte Task bleibt auch ohne erneuten Detailabruf erhalten.
          }
        }
      }

      onSaved(savedTask);
      if (!assignmentFailed) {
        onClose();
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Fehler beim Speichern",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">
            {task ? "Aufgabe bearbeiten" : "Neue Aufgabe anlegen"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="text-zinc-400 hover:text-zinc-600"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Projekt
            </label>
            <select
              value={formState.projectId}
              onChange={(event) =>
                updateField("projectId", event.target.value)
              }
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            >
              <option value="">Kein Projekt</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Titel
            </label>
            <input
              type="text"
              value={formState.title}
              onChange={(event) => updateField("title", event.target.value)}
              required
              maxLength={200}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Beschreibung
            </label>
            <textarea
              value={formState.description}
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              rows={2}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Verantwortlicher
            </label>
            <select
              value={formState.responsibleUserId}
              onChange={(event) =>
                updateField("responsibleUserId", event.target.value)
              }
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            >
              <option value="">Kein Verantwortlicher</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Status
              </label>
              <select
                value={formState.status}
                onChange={(event) =>
                  updateField("status", event.target.value as TaskStatus)
                }
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Priorität
              </label>
              <select
                value={formState.priority}
                onChange={(event) =>
                  updateField("priority", event.target.value as TaskPriority)
                }
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium text-zinc-600">
                  Startdatum
                </label>
                {formState.startAt && (
                  <button
                    type="button"
                    onClick={() => updateField("startAt", "")}
                    className="text-xs text-zinc-500 hover:text-zinc-800 hover:underline"
                  >
                    Datum entfernen
                  </button>
                )}
              </div>
              <input
                type="date"
                value={formState.startAt}
                onChange={(event) =>
                  updateField("startAt", event.target.value)
                }
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium text-zinc-600">
                  Fälligkeit
                </label>
                {formState.dueAt && (
                  <button
                    type="button"
                    onClick={() => updateField("dueAt", "")}
                    className="text-xs text-zinc-500 hover:text-zinc-800 hover:underline"
                  >
                    Datum entfernen
                  </button>
                )}
              </div>
              <input
                type="date"
                value={formState.dueAt}
                onChange={(event) =>
                  updateField("dueAt", event.target.value)
                }
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {warning && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {warning}
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              {warning ? "Schließen" : "Abbrechen"}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isSubmitting
                ? "Wird gespeichert…"
                : task
                  ? "Änderungen speichern"
                  : "Aufgabe anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Mounted only while open (and re-keyed per record), so every opening starts
 * from fresh form state without an effect that resets it.
 */
export function TaskFormModal(props: TaskFormModalProps) {
  if (!props.isOpen) {
    return null;
  }
  return <TaskFormModalContent key={`${props.task?.id ?? "new"}:${props.defaultProjectId ?? ""}`} {...props} />;
}
