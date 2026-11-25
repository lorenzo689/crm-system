"use client";

import Image from "next/image";
import Link from "next/link";
import {
  FiFolder,
  FiCheckSquare,
  FiCalendar,
  FiClock,
  FiAlertTriangle,
  FiArrowRight,
} from "react-icons/fi";
import { useEffect, useState } from "react";
import { FinanceOverview } from "@/components/finance-overview";
import { useCurrentUser } from "@/lib/use-current-user";
import { apiFetch } from "@/lib/auth-api";
import type { CurrentUser } from "@/lib/user-profile";

type TaskStatus =
  "OPEN" | "IN_PROGRESS" | "WAITING" | "BLOCKED" | "COMPLETED" | "CANCELLED";

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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DashboardContent() {
  const { isAdmin } = useCurrentUser();
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

  const totalProjects =
    dashboard.dayStatus.projectsOnTrack +
    dashboard.dayStatus.projectsNeedingAttention;
  const onTrackPercent = totalProjects
    ? (dashboard.dayStatus.projectsOnTrack / totalProjects) * 100
    : 0;
  const icons = [FiFolder, FiCheckSquare, FiCalendar, FiClock];
  return (
    <div className="crm-page dashboard-page">
      <div className="dashboard-welcome">
        <div>
          <p className="dashboard-greeting">Hallo, {user.displayName}.</p>
          <h1>Übersicht</h1>
          <p className="crm-subtitle">
            Projekte, Aufgaben und Termine rund um Ihre Lichttechnik-Projekte.
          </p>
        </div>
        <div className="dashboard-banner">
          <Image
            src="/images/background.jpg"
            alt="Beleuchtete Bühnenstufen"
            fill
            priority
            sizes="(max-width: 760px) 100vw, 40vw"
          />
          <strong>
            The discreet light
            <br />
            behind every
            <br />
            great performance.
          </strong>
        </div>
      </div>
      {isAdmin && <FinanceOverview />}
      <div className="dashboard-kpis">
        {kpiItems.map((item, index) => {
          const Icon = icons[index];
          return (
            <Link
              href={index === 0 ? "/projects" : "/tasks"}
              className="crm-card dashboard-kpi"
              key={item.label}
            >
              <span className="crm-icon-disc">
                <Icon />
              </span>
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="dashboard-middle">
        <section className="crm-card">
          <h2>Projektstatus (aktiv)</h2>
          <div className="dashboard-chart-layout">
            <div
              className="dashboard-donut"
              role="img"
              aria-label={`${dashboard.dayStatus.projectsOnTrack} Projekte im Plan, ${dashboard.dayStatus.projectsNeedingAttention} mit Handlungsbedarf`}
              style={{
                background: `conic-gradient(#bc8127 0% ${onTrackPercent}%, #dedbd5 ${onTrackPercent}% 100%)`,
              }}
            >
              <div>
                <strong>{totalProjects}</strong>
                <span>Projekte</span>
              </div>
            </div>
            <ul className="dashboard-chart-legend">
              <li>
                <i />
                <span>Im Plan</span>
                <b>{dashboard.dayStatus.projectsOnTrack}</b>
              </li>
              <li>
                <i />
                <span>Handlungsbedarf</span>
                <b>{dashboard.dayStatus.projectsNeedingAttention}</b>
              </li>
            </ul>
          </div>
          <p className="dashboard-status">{dashboard.dayStatus.message}</p>
        </section>
        <section className="crm-card">
          <div className="crm-section-heading">
            <h2>Nächster Termin & aktuelle Aufgaben</h2>
            <Link href="/calendar">
              Alle Termine <FiArrowRight />
            </Link>
          </div>
          {dashboard.nextEvent ? (
            <Link className="dashboard-event" href="/calendar">
              <FiCalendar />
              <time>{formatDateTime(dashboard.nextEvent.startsAt)}</time>
              <strong>{dashboard.nextEvent.title}</strong>
            </Link>
          ) : (
            <p className="crm-empty">Keine anstehenden Termine.</p>
          )}
          <div className="dashboard-task-preview">
            {dashboard.myTasks.slice(0, 3).map((task) => (
              <Link key={task.id} href="/tasks">
                <FiCheckSquare />
                <span>
                  {task.title}
                  <small>{task.projectName ?? "Ohne Projekt"}</small>
                </span>
                <time className={task.isOverdue ? "crm-overdue" : ""}>
                  {task.dueAt
                    ? new Date(task.dueAt).toLocaleDateString("de-DE")
                    : "Ohne Termin"}
                </time>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <section className="crm-card dashboard-attention">
        <div className="crm-section-heading">
          <h2>Projekte mit Handlungsbedarf</h2>
          <Link href="/projects">
            Alle Projekte <FiArrowRight />
          </Link>
        </div>
        <div className="crm-table-container">
          <table>
            <thead>
              <tr>
                <th>Projekt</th>
                <th>Kunde</th>
                <th>Handlungsbedarf</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.projectsRequiringAttention.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link className="crm-name" href={`/projects/${project.id}`}>
                      <FiAlertTriangle />
                      {project.name}
                    </Link>
                  </td>
                  <td>{project.customerName ?? "Ohne Kundenbezug"}</td>
                  <td>
                    {project.reasons.map((reason) => (
                      <span className="crm-badge" key={reason.code}>
                        {reason.label}
                      </span>
                    ))}
                  </td>
                  <td>
                    <Link href={`/projects/${project.id}`}>
                      Projekt öffnen <span aria-hidden>→</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!dashboard.projectsRequiringAttention.length && (
          <p className="crm-empty">Alle Projekte laufen planmäßig.</p>
        )}
      </section>
      <details className="crm-card dashboard-activity">
        <summary>
          Letzte Aktivitäten ({dashboard.recentActivities.length})
        </summary>
        {dashboard.recentActivities.map((activity) => (
          <div key={activity.id}>
            <span>{activity.message}</span>
            <time>{formatDateTime(activity.occurredAt)}</time>
          </div>
        ))}
        {!dashboard.recentActivities.length && (
          <p className="crm-empty">Keine kürzlichen Aktivitäten.</p>
        )}
      </details>
    </div>
  );
}
