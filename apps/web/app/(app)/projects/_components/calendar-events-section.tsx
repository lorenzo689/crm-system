"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-api";

type CalendarEventStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

type CalendarEvent = {
  id: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  status: CalendarEventStatus;
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

function formatDateTime(startsAt: string, endsAt: string, allDay: boolean) {
  const date = new Date(startsAt).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
  });
  if (allDay) return `${date} · Ganztägig`;
  const start = new Date(startsAt).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const end = new Date(endsAt).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${start}–${end}`;
}

export function CalendarEventsSection({ projectId }: { projectId: string }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<CalendarEvent[]>(`/calendar-events?projectId=${projectId}`)
      .then(setEvents)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Fehler beim Laden"),
      )
      .finally(() => setIsLoading(false));
  }, [projectId]);

  if (isLoading) return <p className="text-sm text-zinc-400">Lädt…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div>
      <p className="mb-3 text-sm text-zinc-500">
        {events.length} Termin{events.length === 1 ? "" : "e"}
      </p>

      <div className="rounded-2xl border border-zinc-200 bg-white">
        {events.length === 0 ? (
          <p className="px-4 py-4 text-sm text-zinc-500">
            Noch keine Termine für dieses Projekt.
          </p>
        ) : (
          <div className="divide-y divide-zinc-200">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {event.title}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {formatDateTime(
                      event.startsAt,
                      event.endsAt,
                      event.allDay,
                    )}
                    {event.location && ` · ${event.location}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[event.status]}`}
                >
                  {statusLabels[event.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
