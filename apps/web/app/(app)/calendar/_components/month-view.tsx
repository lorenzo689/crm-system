"use client";

import type {
  CalendarEvent,
  CalendarEventStatus,
} from "./calendar-event-form-modal";

type MonthViewProps = {
  events: CalendarEvent[];
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
  onDayClick?: (date: Date) => void;
};

const statusDotColors: Record<CalendarEventStatus, string> = {
  SCHEDULED: "bg-emerald-500",
  COMPLETED: "bg-blue-500",
  CANCELLED: "bg-zinc-300",
};

const weekdayLabels = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function getMonthGrid(year: number, month: number) {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(day.getDate() + index);
    return day;
  });
}

export function getMonthGridRange(year: number, month: number) {
  const days = getMonthGrid(year, month);
  const from = new Date(days[0]);
  from.setHours(0, 0, 0, 0);
  const to = new Date(days[days.length - 1]);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function MonthView({
  events,
  year,
  month,
  onMonthChange,
  onDayClick,
}: MonthViewProps) {
  const today = new Date();
  const days = getMonthGrid(year, month);

  function changeMonth(offset: number) {
    const nextMonth = new Date(year, month + offset, 1);
    onMonthChange(nextMonth.getFullYear(), nextMonth.getMonth());
  }

  function eventsForDay(day: Date) {
    return events.filter((event) =>
      isSameDay(new Date(event.startsAt), day),
    );
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => changeMonth(-1)}
          aria-label="Vorheriger Monat"
          className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
        >
          ←
        </button>
        <p className="text-sm font-medium text-zinc-900">{monthLabel}</p>
        <button
          type="button"
          onClick={() => changeMonth(1)}
          aria-label="Nächster Monat"
          className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
        >
          →
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <div className="grid min-w-[700px] grid-cols-7 gap-px bg-zinc-200">
          {weekdayLabels.map((label) => (
            <div
              key={label}
              className="bg-zinc-50 px-2 py-2 text-center text-xs font-medium text-zinc-400"
            >
              {label}
            </div>
          ))}

          {days.map((day) => {
            const dayEvents = eventsForDay(day);
            const isCurrentMonth = day.getMonth() === month;
            const isToday = isSameDay(day, today);

            return (
              <div
                key={day.toISOString()}
                onClick={() => onDayClick?.(day)}
                className={`min-h-[96px] bg-white p-1.5 transition hover:bg-zinc-50 ${
                  onDayClick ? "cursor-pointer" : ""
                } ${!isCurrentMonth ? "opacity-40" : ""}`}
              >
                <p
                  className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    isToday
                      ? "bg-amber-500 font-medium text-white"
                      : "text-zinc-600"
                  }`}
                >
                  {day.getDate()}
                </p>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center gap-1 truncate text-xs text-zinc-600"
                      title={event.title}
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotColors[event.status]}`}
                      />
                      <span className="truncate">{event.title}</span>
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <p className="text-xs text-zinc-400">
                      +{dayEvents.length - 3} weitere
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
