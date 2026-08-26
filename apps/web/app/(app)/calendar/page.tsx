"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-api";
import {
  CalendarEventFormModal,
  type CalendarEvent,
  type CalendarEventStatus,
  type CustomerOption,
  type ProjectOption,
} from "./_components/calendar-event-form-modal";
import {
  getMonthGridRange,
  MonthView,
} from "./_components/month-view";

type CalendarView = "agenda" | "month" | "week";

type VisibleMonth = {
  year: number;
  month: number;
};

type MonthData = {
  key: string;
  events: CalendarEvent[];
  error: string | null;
};

const statusStyles: Record<CalendarEventStatus, string> = {
  SCHEDULED: "bg-emerald-50 text-emerald-700",
  COMPLETED: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-zinc-100 text-zinc-400",
};

const statusLabels: Record<CalendarEventStatus, string> = {
  SCHEDULED: "Geplant",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Storniert",
};

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayLabel(dateString: string) {
  const date = new Date(dateString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (isSameDay(date, today)) return "Heute";
  if (isSameDay(date, tomorrow)) return "Morgen";

  return date.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function formatTimeRange(
  startsAt: string,
  endsAt: string,
  allDay: boolean,
) {
  if (allDay) return "Ganztägig";

  const start = new Date(startsAt).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const end = new Date(endsAt).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${start} – ${end}`;
}

function groupByDay(events: CalendarEvent[]) {
  const groups: {
    label: string;
    dateKey: string;
    items: CalendarEvent[];
  }[] = [];

  for (const event of events) {
    const date = new Date(event.startsAt);
    const dateKey = date.toDateString();
    const existingGroup = groups.find((group) => group.dateKey === dateKey);

    if (existingGroup) {
      existingGroup.items.push(event);
    } else {
      groups.push({
        label: formatDayLabel(event.startsAt),
        dateKey,
        items: [event],
      });
    }
  }

  return groups;
}

function getAgendaRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 60);

  return { from, to };
}

function eventOverlapsRange(
  event: CalendarEvent,
  range: { from: Date; to: Date },
) {
  return (
    new Date(event.endsAt) >= range.from &&
    new Date(event.startsAt) <= range.to
  );
}

function sortEvents(events: CalendarEvent[]) {
  return [...events].sort(
    (a, b) =>
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}

export default function CalendarPage() {
  const [agendaEvents, setAgendaEvents] = useState<CalendarEvent[]>([]);
  const [monthData, setMonthData] = useState<MonthData | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | CalendarEventStatus
  >("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [view, setView] = useState<CalendarView>("agenda");
  const [visibleMonth, setVisibleMonth] = useState<VisibleMonth>(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });

  useEffect(() => {
    const { from, to } = getAgendaRange();

    Promise.all([
      apiFetch<CalendarEvent[]>(
        `/calendar-events?from=${from.toISOString()}&to=${to.toISOString()}`,
      ),
      apiFetch<CustomerOption[]>("/customers"),
      apiFetch<ProjectOption[]>("/projects"),
    ])
      .then(([loadedEvents, loadedCustomers, loadedProjects]) => {
        setAgendaEvents(loadedEvents);
        setCustomers(loadedCustomers);
        setProjects(loadedProjects);
      })
      .catch((caughtError: unknown) =>
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Termine konnten nicht geladen werden.",
        ),
      )
      .finally(() => setIsLoading(false));
  }, []);

  const monthKey = `${visibleMonth.year}-${visibleMonth.month}`;

  useEffect(() => {
    if (view !== "month") {
      return;
    }

    const { from, to } = getMonthGridRange(
      visibleMonth.year,
      visibleMonth.month,
    );
    const controller = new AbortController();

    apiFetch<CalendarEvent[]>(
      `/calendar-events?from=${from.toISOString()}&to=${to.toISOString()}`,
      { signal: controller.signal },
    )
      .then((loadedEvents) =>
        setMonthData({ key: monthKey, events: loadedEvents, error: null }),
      )
      .catch((caughtError: unknown) => {
        if (
          caughtError instanceof DOMException &&
          caughtError.name === "AbortError"
        ) {
          return;
        }

        setMonthData({
          key: monthKey,
          events: [],
          error:
            caughtError instanceof Error
              ? caughtError.message
              : "Monat konnte nicht geladen werden.",
        });
      });

    return () => controller.abort();
  }, [monthKey, view, visibleMonth.month, visibleMonth.year]);

  const activeEvents =
    view === "month" && monthData?.key === monthKey
      ? monthData.events
      : agendaEvents;

  const filteredEvents = useMemo(
    () =>
      activeEvents.filter((event) => {
        if (statusFilter !== "all" && event.status !== statusFilter) {
          return false;
        }
        if (
          customerFilter !== "all" &&
          event.customer?.id !== customerFilter
        ) {
          return false;
        }
        if (
          projectFilter !== "all" &&
          event.project?.id !== projectFilter
        ) {
          return false;
        }
        return true;
      }),
    [activeEvents, customerFilter, projectFilter, statusFilter],
  );

  function resetFilters() {
    setStatusFilter("all");
    setCustomerFilter("all");
    setProjectFilter("all");
  }

  function addEvent(savedEvent: CalendarEvent) {
    if (eventOverlapsRange(savedEvent, getAgendaRange())) {
      setAgendaEvents((current) => sortEvents([...current, savedEvent]));
    }

    const monthRange = getMonthGridRange(
      visibleMonth.year,
      visibleMonth.month,
    );
    if (eventOverlapsRange(savedEvent, monthRange)) {
      setMonthData((current) =>
        current?.key === monthKey
          ? {
              ...current,
              events: sortEvents([...current.events, savedEvent]),
            }
          : current,
      );
    }
  }

  if (isLoading) {
    return <p className="p-6 text-sm text-zinc-400 sm:p-8">Lädt…</p>;
  }

  if (error) {
    return <p className="p-6 text-sm text-red-600 sm:p-8">{error}</p>;
  }

  const groups = groupByDay(filteredEvents);
  const isMonthLoading = view === "month" && monthData?.key !== monthKey;
  const monthError =
    view === "month" && monthData?.key === monthKey
      ? monthData.error
      : null;

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <p className="text-xs font-medium tracking-wider text-amber-600">
            KALENDER
          </p>
          <h1 className="text-2xl font-semibold text-zinc-900">Termine</h1>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + Neuer Termin
        </button>
      </div>

      <div className="mb-4 flex w-fit gap-1 rounded-lg bg-zinc-200/70 p-1">
        {(["agenda", "month", "week"] as const).map((calendarView) => (
          <button
            key={calendarView}
            type="button"
            onClick={() => setView(calendarView)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === calendarView
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {calendarView === "agenda"
              ? "Agenda"
              : calendarView === "month"
                ? "Monat"
                : "Woche"}
          </button>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as typeof statusFilter)
          }
          aria-label="Nach Status filtern"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 focus:border-amber-400 focus:outline-none"
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
          aria-label="Nach Kunde filtern"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 focus:border-amber-400 focus:outline-none"
        >
          <option value="all">Alle Kunden</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>

        <select
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
          aria-label="Nach Projekt filtern"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 focus:border-amber-400 focus:outline-none"
        >
          <option value="all">Alle Projekte</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={resetFilters}
          className="text-sm text-zinc-500 hover:text-zinc-700 hover:underline"
        >
          Filter zurücksetzen
        </button>
      </div>

      {view === "agenda" &&
        (groups.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
            <p className="text-sm text-zinc-500">
              Keine anstehenden Termine.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.dateKey}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                  {group.label}
                </p>
                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                  <div className="divide-y divide-zinc-100">
                    {group.items.map((event) => (
                      <article key={event.id} className="px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-zinc-900">
                              {event.title}
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[event.status]}`}
                            >
                              {statusLabels[event.status]}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {formatTimeRange(
                              event.startsAt,
                              event.endsAt,
                              event.allDay,
                            )}
                            {event.location && ` · ${event.location}`}
                          </p>
                          {(event.customer || event.project) && (
                            <p className="mt-1 truncate text-xs text-amber-600">
                              {event.project?.name ?? event.customer?.name}
                            </p>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </div>
        ))}

      {view === "month" &&
        (isMonthLoading ? (
          <p className="py-8 text-center text-sm text-zinc-400">
            Monat wird geladen…
          </p>
        ) : monthError ? (
          <p className="py-8 text-center text-sm text-red-600">
            {monthError}
          </p>
        ) : (
          <MonthView
            events={filteredEvents}
            year={visibleMonth.year}
            month={visibleMonth.month}
            onMonthChange={(year, month) =>
              setVisibleMonth({ year, month })
            }
          />
        ))}

      {view === "week" && (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white/60 p-8 text-center">
          <p className="text-sm font-medium text-zinc-700">
            Wochenansicht
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Das Stundenraster folgt im nächsten Schritt.
          </p>
        </div>
      )}

      {isModalOpen && (
        <CalendarEventFormModal
          customers={customers}
          projects={projects}
          onClose={() => setIsModalOpen(false)}
          onSaved={addEvent}
        />
      )}
    </div>
  );
}
