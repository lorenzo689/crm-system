"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import {
  TaskFormModal,
  type Task,
  type TaskStatus,
  type UserOption,
} from "../../tasks/_components/task-form-modal";

type ProjectTasksProps = {
  projectId: string;
  projectName: string;
};

const statusLabels: Record<TaskStatus, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Arbeit",
  WAITING: "Wartet",
  BLOCKED: "Blockiert",
  COMPLETED: "Erledigt",
  CANCELLED: "Storniert",
};

const statusStyles: Record<TaskStatus, string> = {
  OPEN: "bg-zinc-100 text-zinc-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  WAITING: "bg-amber-50 text-amber-700",
  BLOCKED: "bg-red-50 text-red-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-zinc-100 text-zinc-400",
};

export function ProjectTasks({ projectId, projectName }: ProjectTasksProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<Task[]>(`/tasks?projectId=${projectId}`),
      apiFetch<UserOption[]>("/users"),
    ])
      .then(([loadedTasks, loadedUsers]) => {
        setTasks(loadedTasks);
        setUsers(loadedUsers);
      })
      .catch((caughtError: unknown) =>
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Aufgaben konnten nicht geladen werden.",
        ),
      )
      .finally(() => setIsLoading(false));
  }, [projectId]);

  function upsertTask(updatedTask: Task) {
    // The modal can move a task to another project or remove it from this one.
    if (updatedTask.project?.id !== projectId) {
      setTasks((current) => current.filter((task) => task.id !== updatedTask.id));
      return;
    }
    setTasks((current) => {
      const exists = current.some((task) => task.id === updatedTask.id);
      return exists
        ? current.map((task) =>
            task.id === updatedTask.id ? updatedTask : task,
          )
        : [...current, updatedTask];
    });
  }

  const openTasks = tasks.filter(
    (task) =>
      task.status !== "COMPLETED" && task.status !== "CANCELLED",
  );
  const doneTasks = tasks.filter(
    (task) =>
      task.status === "COMPLETED" || task.status === "CANCELLED",
  );

  if (isLoading) {
    return <p className="text-sm text-zinc-400">Lädt…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  function renderTaskRow(task: Task) {
    const responsible =
      task.assignments.find(
        (assignment) => assignment.role === "RESPONSIBLE",
      )?.user.displayName ?? "–";

    return (
      <button
        key={task.id}
        type="button"
        onClick={() => {
          setEditingTask(task);
          setIsModalOpen(true);
        }}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-50"
      >
        <span>
          <span className="block text-sm font-medium text-zinc-900">
            {task.title}
          </span>
          <span className="block text-xs text-zinc-400">{responsible}</span>
        </span>
        <span className="flex items-center gap-3">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[task.status]}`}
          >
            {statusLabels[task.status]}
          </span>
          <span className="text-xs text-zinc-400">
            {task.dueAt
              ? new Date(task.dueAt).toLocaleDateString("de-DE")
              : "–"}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-500">
          {openTasks.length} offen · {doneTasks.length} erledigt
        </p>
        <button
          type="button"
          onClick={() => {
            setEditingTask(null);
            setIsModalOpen(true);
          }}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + Neue Aufgabe
        </button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white">
        <p className="border-b border-zinc-100 px-4 py-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
          Offene Aufgaben
        </p>
        {openTasks.length === 0 ? (
          <p className="px-4 py-4 text-sm text-zinc-500">
            Keine offenen Aufgaben.
          </p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {openTasks.map(renderTaskRow)}
          </div>
        )}
      </div>

      {doneTasks.length > 0 && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white">
          <p className="border-b border-zinc-100 px-4 py-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
            Erledigte Aufgaben
          </p>
          <div className="divide-y divide-zinc-100">
            {doneTasks.map(renderTaskRow)}
          </div>
        </div>
      )}

      <TaskFormModal
        isOpen={isModalOpen}
        task={editingTask}
        projects={[{ id: projectId, name: projectName }]}
        users={users}
        defaultProjectId={projectId}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTask(null);
        }}
        onSaved={upsertTask}
      />
    </div>
  );
}
