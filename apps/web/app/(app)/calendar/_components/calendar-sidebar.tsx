"use client";

import { useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import type { CalendarEvent } from "./calendar-event-form-modal";

export function CalendarSidebar({
  selectedDate,
  events,
  onSelect,
}: {
  selectedDate: Date;
  events: CalendarEvent[];
  onSelect: (date: Date) => void;
}) {
  const [offset, setOffset] = useState(0);
  const month = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth() + offset,
    1,
  );
  const first = new Date(month);
  first.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return date;
  });
  const today = new Date();
  return (
    <aside className="crm-calendar-sidebar">
      <div className="crm-mini-calendar-heading">
        <strong>
          {month.toLocaleDateString("de-DE", {
            month: "long",
            year: "numeric",
          })}
        </strong>
        <button
          aria-label="Vorheriger Monat"
          onClick={() => setOffset(offset - 1)}
        >
          <FiChevronLeft />
        </button>
        <button
          aria-label="Nächster Monat"
          onClick={() => setOffset(offset + 1)}
        >
          <FiChevronRight />
        </button>
      </div>
      <div className="crm-mini-calendar">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => (
          <span key={day}>{day}</span>
        ))}
        {days.map((day) => (
          <button
            key={day.toISOString()}
            aria-label={day.toLocaleDateString("de-DE")}
            aria-current={
              day.toDateString() === today.toDateString() ? "date" : undefined
            }
            data-muted={day.getMonth() !== month.getMonth()}
            onClick={() => {
              setOffset(0);
              onSelect(day);
            }}
          >
            {day.getDate()}
          </button>
        ))}
      </div>
      <h2>Anstehende Termine</h2>
      {events
        .filter(
          (event) =>
            event.status === "SCHEDULED" && new Date(event.endsAt) >= today,
        )
        .slice(0, 6)
        .map((event) => (
          <button
            className="crm-sidebar-event"
            key={event.id}
            onClick={() => {
              setOffset(0);
              onSelect(new Date(event.startsAt));
            }}
          >
            <time>
              {new Date(event.startsAt).toLocaleDateString("de-DE", {
                weekday: "short",
                day: "2-digit",
                month: "2-digit",
              })}
              <b>
                {event.allDay
                  ? "Ganztägig"
                  : new Date(event.startsAt).toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
              </b>
            </time>
            <span>
              <strong>{event.title}</strong>
              <small>{event.project?.name ?? event.customer?.name}</small>
            </span>
          </button>
        ))}
      {!events.some(
        (event) =>
          event.status === "SCHEDULED" && new Date(event.endsAt) >= today,
      ) && <p className="crm-empty">Keine anstehenden Termine.</p>}
    </aside>
  );
}
