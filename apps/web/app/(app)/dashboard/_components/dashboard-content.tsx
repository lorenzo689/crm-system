"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import type { CurrentUser } from "@/lib/user-profile";

type TaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED";

type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

type DashboardResponse = {
  summary: {
    activeProjects: number;
    openTasks: number;
    dueTodayTasks: number;
    waitingTasks: number;
  };
  dayStatus: {
    projectsOnTrack: number;
    projectsNeedingAttention: number;
    message: string;
  };
  nextEvent: {
    id: string;
    title: string;
    startsAt: string;
    location: string | null;
  } | null;
  myTasks: Array<{
    id: string;
    title: string;
    projectName: string | null;
    priority: TaskPriority;
    dueAt: string | null;
    status: TaskStatus;
    isOverdue: boolean;
  }>;
  projectsRequiringAttention: Array<{
    id: string;
    name: string;
    customerName: string | null;
    reasons: Array<{ code: string; label: string }>;
  }>;
  recentActivities: Array<{
    id: string;
    type: string;
    message: string;
    occurredAt: string;
  }>;
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

const activityTypeLabels: Record<string, string> = {
  CUSTOMER_CREATED: "Kunde erstellt",
  CUSTOMER_UPDATED: "Kunde aktualisiert",
  CUSTOMER_ARCHIVED: "Kunde archiviert",
  PROJECT_CREATED: "Projekt erstellt",
  PROJECT_UPDATED: "Projekt aktualisiert",
  PROJECT_STATUS_CHANGED: "Projektstatus geändert",
  PROJECT_ARCHIVED: "Projekt archiviert",
  TASK_CREATED: "Aufgabe erstellt",
  TASK_ASSIGNED: "Aufgabe zugewiesen",
  TASK_COMPLETED: "Aufgabe erledigt",
  TASK_CANCELLED: "Aufgabe storniert",
  TASK_ARCHIVED: "Aufgabe archiviert",
  NOTE_CREATED: "Notiz erstellt",
  DOCUMENT_CREATED: "Dokument erstellt",
  DOCUMENT_VERSION_ADDED: "Dokumentversion ergänzt",
  DOCUMENT_ARCHIVED: "Dokument archiviert",
  CALENDAR_EVENT_CREATED: "Termin erstellt",
  CALENDAR_EVENT_UPDATED: "Termin aktualisiert",
  CALENDAR_EVENT_CANCELLED: "Termin storniert",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getFocusText(summary: DashboardResponse["summary"]) {
  if (summary.dueTodayTasks === 0 && summary.waitingTasks === 0) {
    return "Heute sind keine Aufgaben fällig oder wartend.";
  }

  const dueText =
    summary.dueTodayTasks === 1
      ? "1 Aufgabe ist heute fällig"
      : `${summary.dueTodayTasks} Aufgaben sind heute fällig`;
  const waitingText =
    summary.waitingTasks === 1
      ? "1 Aufgabe wartet auf Rückmeldung"
      : `${summary.waitingTasks} Aufgaben warten auf Rückmeldung`;

  return `${dueText}, ${waitingText}.`;
}

export function DashboardContent() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<DashboardResponse>("/dashboard"),
      apiFetch<CurrentUser>("/users/me"),
    ])
      .then(([loadedDashboard, loadedUser]) => {
        setDashboard(loadedDashboard);
        setUser(loadedUser);
      })
      .catch((caughtError: unknown) =>
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Dashboard konnte nicht geladen werden.",
        ),
      )
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <p className="p-6 text-sm text-zinc-400 sm:p-8">Lädt…</p>;
  }

  if (error) {
    return <p className="p-6 text-sm text-red-600 sm:p-8">{error}</p>;
  }

  if (!dashboard || !user) {
    return (
      <p className="p-6 text-sm text-zinc-400 sm:p-8">
        Keine Dashboard-Daten verfügbar.
      </p>
    );
  }

  const kpiItems = [
    {
      label: "Aktive Projekte",
      value: dashboard.summary.activeProjects,
      detail: "Aktuell im Status Aktiv",
    },
    {
      label: "Offene Aufgaben",
      value: dashboard.summary.openTasks,
      detail: "Noch nicht erledigt oder storniert",
    },
    {
      label: "Heute fällig",
      value: dashboard.summary.dueTodayTasks,
      detail: "Offene Aufgaben mit heutigem Fälligkeitsdatum",
    },
    {
      label: "Wartet auf Rückmeldung",
      value: dashboard.summary.waitingTasks,
      detail: "Aufgaben im Status Wartet",
    },
  ];

  return (
    <div className="flex-1 overflow-auto bg-[linear-gradient(180deg,#f4f4f5_0%,#fafafa_100%)] px-4 py-6 sm:px-8 sm:py-8">
      <div className="space-y-5">
        <section className="grid min-h-[448px] overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.06)] xl:grid-cols-[1.08fr_0.92fr]">
          <div className="flex flex-col justify-between px-6 py-8 sm:px-10 sm:py-10">
            <div className="max-w-[560px]">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                Dashboard
              </p>
              <h2 className="mt-6 text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.07em] text-zinc-950 sm:text-[3.35rem]">
                Guten Morgen, {user.displayName}.
              </h2>
              <p className="mt-5 max-w-xl text-[1.05rem] leading-8 text-zinc-500">
                Kurzüberblick über deine Projekte und anstehenden Aufgaben.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <article className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-6 py-6">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                  Heute im Fokus
                </p>
                <p className="mt-4 max-w-[22ch] text-[1.12rem] font-semibold leading-8 tracking-[-0.03em] text-zinc-900">
                  {getFocusText(dashboard.summary)}
                </p>
              </article>

              <article className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-6 py-6">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                  Nächster Termin
                </p>
                {dashboard.nextEvent ? (
                  <div className="mt-4">
                    <p className="text-[1.12rem] font-semibold leading-8 tracking-[-0.03em] text-zinc-900">
                      {dashboard.nextEvent.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-zinc-500">
                      {formatDateTime(dashboard.nextEvent.startsAt)}
                      {dashboard.nextEvent.location
                        ? ` · ${dashboard.nextEvent.location}`
                        : ""}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-zinc-400">
                    Kein anstehender Termin
                  </p>
                )}
              </article>
            </div>
          </div>

          <div className="relative h-full min-h-[320px] overflow-hidden border-t border-zinc-200 xl:border-l xl:border-t-0">
            <Image
              src="/images/background.jpg"
              alt="Dashboard Hintergrund"
              fill
              priority
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(17,17,17,0.2)_0%,rgba(17,17,17,0.44)_52%,rgba(17,17,17,0.72)_100%)]" />

            <div className="absolute inset-x-6 bottom-6 sm:inset-x-8 sm:bottom-8">
              <div className="max-w-[390px] rounded-[1.5rem] border border-white/10 bg-[rgba(24,24,27,0.58)] px-6 py-6 shadow-[0_18px_40px_rgba(0,0,0,0.2)] backdrop-blur-md">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-300">
                  Tagesstatus
                </p>
                <p className="mt-4 text-[1.65rem] font-semibold leading-9 tracking-[-0.05em] text-white sm:text-[1.9rem] sm:leading-10">
                  {dashboard.dayStatus.message}
                </p>
                <p className="mt-4 text-[0.98rem] leading-7 text-white/72">
                  {dashboard.dayStatus.projectsNeedingAttention === 0
                    ? "Aktuell benötigt kein Projekt besondere Aufmerksamkeit."
                    : "Die priorisierten Projekte findest du direkt unterhalb der Aufgaben."}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpiItems.map((item) => (
            <article
              key={item.label}
              className="rounded-[1.5rem] border border-zinc-200 bg-white px-6 py-6 shadow-[0_12px_30px_rgba(15,23,42,0.04)]"
            >
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                {item.label}
              </p>
              <p className="mt-4 text-[2.35rem] font-semibold tracking-[-0.07em] text-zinc-950">
                {item.value}
              </p>
              <p className="mt-3 text-[0.98rem] leading-7 text-zinc-500">
                {item.detail}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.55fr_0.8fr]">
          <article className="min-w-0 rounded-[2rem] border border-zinc-200 bg-white px-5 py-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)] sm:px-8 sm:py-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                  Meine Aufgaben
                </p>
                <h3 className="mt-3 text-[2.05rem] font-semibold tracking-[-0.05em] text-zinc-950">
                  Fokus für heute
                </h3>
              </div>
              <p className="pb-1 text-sm text-zinc-400">
                {dashboard.myTasks.length} Einträge
              </p>
            </div>

            {dashboard.myTasks.length === 0 ? (
              <p className="mt-8 rounded-[1.5rem] border border-dashed border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">
                Keine offenen Aufgaben
              </p>
            ) : (
              <div className="mt-8 overflow-x-auto rounded-[1.5rem] border border-zinc-200">
                <table className="min-w-[720px] border-separate border-spacing-0">
                  <thead className="bg-[rgba(255,252,247,0.72)]">
                    <tr>
                      {["Titel", "Projekt", "Priorität", "Fällig", "Status"].map(
                        (heading) => (
                          <th
                            key={heading}
                            className="border-b border-zinc-200 px-4 py-4 text-left text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400"
                          >
                            {heading}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.myTasks.map((task) => (
                      <tr key={task.id} className="bg-white/55">
                        <td className="border-b border-zinc-200 px-4 py-5 text-[0.98rem] font-medium leading-7 text-zinc-900">
                          {task.title}
                        </td>
                        <td className="border-b border-zinc-200 px-4 py-5 text-[0.95rem] leading-7 text-zinc-500">
                          {task.projectName ?? "Ohne Projekt"}
                        </td>
                        <td className="border-b border-zinc-200 px-4 py-5">
                          <span className="inline-flex rounded-full border border-zinc-900 bg-zinc-900 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-white">
                            {priorityLabels[task.priority]}
                          </span>
                        </td>
                        <td className="border-b border-zinc-200 px-4 py-5 text-[0.95rem] leading-7 text-zinc-700">
                          {task.dueAt ? formatDateTime(task.dueAt) : "Ohne Termin"}
                          {task.isOverdue && (
                            <span className="ml-2 text-xs font-semibold text-red-600">
                              Überfällig
                            </span>
                          )}
                        </td>
                        <td className="border-b border-zinc-200 px-4 py-5 text-[0.95rem] font-medium leading-7 text-zinc-700">
                          {statusLabels[task.status]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="rounded-[2rem] border border-zinc-200 bg-white px-5 py-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)] sm:px-8 sm:py-8">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                Projekte mit Handlungsbedarf
              </p>
              <h3 className="mt-3 text-[2.05rem] font-semibold tracking-[-0.05em] text-zinc-950">
                Priorisierte Abstimmungen
              </h3>
            </div>

            {dashboard.projectsRequiringAttention.length === 0 ? (
              <p className="mt-7 rounded-[1.5rem] border border-dashed border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">
                Alle Projekte laufen planmäßig
              </p>
            ) : (
              <div className="mt-7 space-y-4">
                {dashboard.projectsRequiringAttention.map((project) => (
                  <article
                    key={project.id}
                    className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-6 py-6"
                  >
                    <h4 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-zinc-900">
                      {project.name}
                    </h4>
                    <p className="mt-1 text-[0.95rem] text-zinc-500">
                      {project.customerName ?? "Ohne Kundenbezug"}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {project.reasons.map((reason) => (
                        <span
                          key={reason.code}
                          className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-amber-800"
                        >
                          {reason.label}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>
        </section>

        <section className="rounded-[2rem] border border-zinc-200 bg-white px-5 py-6 shadow-[0_20px_50px_rgba(15,23,42,0.05)] sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                Letzte Aktivitäten
              </p>
              <h3 className="mt-3 text-[2.05rem] font-semibold tracking-[-0.05em] text-zinc-950">
                Was zuletzt passiert ist
              </h3>
            </div>
            <p className="pb-1 text-sm text-zinc-400">
              {dashboard.recentActivities.length} Einträge
            </p>
          </div>

          {dashboard.recentActivities.length === 0 ? (
            <p className="mt-7 rounded-[1.5rem] border border-dashed border-zinc-200 px-6 py-10 text-center text-sm text-zinc-400">
              Keine kürzlichen Aktivitäten
            </p>
          ) : (
            <div className="mt-7 divide-y divide-zinc-100 overflow-hidden rounded-[1.5rem] border border-zinc-200">
              {dashboard.recentActivities.map((activity) => (
                <article
                  key={activity.id}
                  className="flex flex-col gap-2 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                >
                  <div className="min-w-0">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
                      {activityTypeLabels[activity.type] ?? activity.type}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-zinc-700">
                      {activity.message}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-zinc-400">
                    {formatDateTime(activity.occurredAt)}
                  </time>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
