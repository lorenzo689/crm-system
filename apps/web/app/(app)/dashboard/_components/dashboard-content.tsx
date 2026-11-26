"use client";

import Link from "next/link";
import {
  FiCheckSquare,
  FiCalendar,
  FiAlertTriangle,
  FiArrowRight,
} from "react-icons/fi";
import { useEffect, useState } from "react";
import { FinanceOverview } from "@/components/finance-overview";
import { useCurrentUser } from "@/lib/use-current-user";
import { apiFetch } from "@/lib/auth-api";

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
  const { isAdmin, user } = useCurrentUser();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<DashboardResponse>("/dashboard")
      .then(setDashboard)
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
    return <div className="crm-page dashboard-page" role="status" aria-label="Übersicht wird geladen"><div className="app-skeleton app-skeleton-title" /><div className="app-skeleton app-skeleton-row" /><div className="app-skeleton app-skeleton-panel" /></div>;
  }

  if (error) {
    return <div className="crm-page"><div className="app-error" role="alert"><strong>Übersicht konnte nicht geladen werden</strong><p>{/Too Many Requests/i.test(error) ? "Zu viele Anfragen. Bitte kurz warten und erneut versuchen." : error}</p><button type="button" onClick={() => window.location.reload()}>Erneut laden</button></div></div>;
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
  const statusParts = [
    dashboard.dayStatus.projectsOnTrack > 0
      ? `${dashboard.dayStatus.projectsOnTrack} ${dashboard.dayStatus.projectsOnTrack === 1 ? "Projekt läuft" : "Projekte laufen"} planmäßig`
      : null,
    dashboard.dayStatus.projectsNeedingAttention > 0
      ? `${dashboard.dayStatus.projectsNeedingAttention} ${dashboard.dayStatus.projectsNeedingAttention === 1 ? "Projekt benötigt" : "Projekte benötigen"} Aufmerksamkeit`
      : null,
  ].filter(Boolean);
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
      </div>
      <div className="dashboard-kpis">
        {kpiItems.map((item, index) => {
          return (
            <Link
              href={index === 0 ? "/projects" : "/tasks"}
              className="crm-card dashboard-kpi"
              data-urgent={index >= 2 && item.value > 0 ? true : undefined}
              key={item.label}
              title={item.detail}
            >
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            </Link>
          );
        })}
      </div>
      <section className="crm-card dashboard-attention">
        <div className="crm-section-heading">
          <div>
            <h2>Handlungsbedarf</h2>
            <p>{dashboard.projectsRequiringAttention.length ? dashboard.projectsRequiringAttention.length === 1 ? "1 Projekt benötigt Ihre Aufmerksamkeit." : `${dashboard.projectsRequiringAttention.length} Projekte benötigen Ihre Aufmerksamkeit.` : "Alle Projekte laufen planmäßig."}</p>
          </div>
          <Link href="/projects">Alle Projekte <FiArrowRight /></Link>
        </div>
        {dashboard.projectsRequiringAttention.length > 0 && (
          <div className="crm-table-container">
            <table>
              <thead><tr><th>Projekt</th><th>Kunde</th><th>Grund</th><th><span className="sr-only">Öffnen</span></th></tr></thead>
              <tbody>
                {dashboard.projectsRequiringAttention.map((project) => (
                  <tr key={project.id}>
                    <td><Link className="crm-name" href={`/projects/${project.id}`}><FiAlertTriangle />{project.name}</Link></td>
                    <td>{project.customerName ?? "Ohne Kundenbezug"}</td>
                    <td>{project.reasons.map((reason) => <span className="crm-badge" key={reason.code}>{reason.label}</span>)}</td>
                    <td><Link href={`/projects/${project.id}`}>Öffnen <span aria-hidden>→</span></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="dashboard-middle">
        <section className="crm-card">
          <h2>Projektstatus</h2>
          <div className="dashboard-status-summary">
            <strong>{totalProjects}</strong>
            <span>{totalProjects === 1 ? "aktives Projekt im Blick" : "aktive Projekte im Blick"}</span>
          </div>
          {totalProjects > 0 && (
            <>
              <div className="dashboard-status-bar" role="img" aria-label={`${dashboard.dayStatus.projectsOnTrack} Projekte im Plan, ${dashboard.dayStatus.projectsNeedingAttention} mit Handlungsbedarf`}>
                <span style={{ width: `${onTrackPercent}%` }} />
              </div>
              <div className="dashboard-chart-layout">
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
            </>
          )}
          <p className="dashboard-status">{statusParts.length ? `${statusParts.join(", ")}.` : "Noch keine aktiven Projekte vorhanden."}</p>
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
            {!dashboard.myTasks.length && <p className="crm-empty">Keine offenen Aufgaben für Sie.</p>}
          </div>
        </section>
      </div>
      {isAdmin && <FinanceOverview />}
      <details className="crm-card dashboard-activity" open>
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
