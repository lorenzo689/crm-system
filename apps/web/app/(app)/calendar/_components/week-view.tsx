"use client";

import type {
  CalendarEvent,
  CalendarEventStatus,
} from "./calendar-event-form-modal";

type WeekViewProps = {
  events: CalendarEvent[];
  weekStart: Date;
  onWeekChange: (newWeekStart: Date) => void;
  onDayClick?: (date: Date) => void;
};

const GRID_START_HOUR = 7;
const GRID_END_HOUR = 20;
const HOUR_HEIGHT = 64;
const GRID_HEIGHT = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT;

const eventStyles: Record<CalendarEventStatus, string> = {
  SCHEDULED: "border-emerald-200 bg-emerald-50 text-emerald-900",
  COMPLETED: "border-blue-200 bg-blue-50 text-blue-900",
  CANCELLED: "border-zinc-200 bg-zinc-100 text-zinc-500",
};

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function getWeekRange(year: number, month: number, day: number) {
  const selectedDate = new Date(year, month, day);
  const weekdayFromMonday = (selectedDate.getDay() + 6) % 7;
  const from = new Date(selectedDate);
  from.setDate(from.getDate() - weekdayFromMonday);
  from.setHours(0, 0, 0, 0);

  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

function getWeekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    return date;
  });
}

function isAllDayOrMultiDay(event: CalendarEvent) {
  return (
    event.allDay ||
    !isSameDay(new Date(event.startsAt), new Date(event.endsAt))
  );
}

function eventOverlapsDay(event: CalendarEvent, day: Date) {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  return (
    new Date(event.startsAt) < dayEnd && new Date(event.endsAt) > dayStart
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getEventPosition(event: CalendarEvent) {
  const startsAt = new Date(event.startsAt);
  const endsAt = new Date(event.endsAt);
  const startMinutes = startsAt.getHours() * 60 + startsAt.getMinutes();
  const endMinutes = endsAt.getHours() * 60 + endsAt.getMinutes();
  const gridStartMinutes = GRID_START_HOUR * 60;
  const gridEndMinutes = GRID_END_HOUR * 60;
  const visibleStart = Math.max(startMinutes, gridStartMinutes);
  const visibleEnd = Math.min(endMinutes, gridEndMinutes);

  return {
    top: ((visibleStart - gridStartMinutes) / 60) * HOUR_HEIGHT,
    height: Math.max(
      28,
      ((Math.max(visibleEnd, visibleStart) - visibleStart) / 60) *
        HOUR_HEIGHT,
    ),
  };
}

function formatWeekLabel(weekStart: Date, weekEnd: Date) {
  const start = weekStart.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
  });
  const end = weekEnd.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `${start} – ${end}`;
}

export function WeekView({
  events,
  weekStart,
  onWeekChange,
  onDayClick,
}: WeekViewProps) {
  const today = new Date();
  const days = getWeekDays(weekStart);
  const weekEnd = days[6];
  const allDayEvents = events.filter(isAllDayOrMultiDay);
  const hourLabels = Array.from(
    { length: GRID_END_HOUR - GRID_START_HOUR + 1 },
    (_, index) => GRID_START_HOUR + index,
  );

  function changeWeek(offset: number) {
    const nextWeek = new Date(weekStart);
    nextWeek.setDate(nextWeek.getDate() + offset * 7);
    onWeekChange(nextWeek);
  }

  function goToCurrentWeek() {
    const { from } = getWeekRange(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    onWeekChange(from);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => changeWeek(-1)}
            aria-label="Vorherige Woche"
            className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            ←
          </button>
          <button
            type="button"
            onClick={goToCurrentWeek}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Heute
          </button>
          <button
            type="button"
            onClick={() => changeWeek(1)}
            aria-label="Nächste Woche"
            className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            →
          </button>
        </div>
        <p className="text-sm font-medium text-zinc-900">
          {formatWeekLabel(weekStart, weekEnd)}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-zinc-200 bg-zinc-50">
            <div className="border-r border-zinc-200" />
            {days.map((day) => {
              const isToday = isSameDay(day, today);
              const label = day.toLocaleDateString("de-DE", {
                weekday: "short",
              });

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => onDayClick?.(day)}
                  disabled={!onDayClick}
                  className="border-r border-zinc-200 px-2 py-3 text-center last:border-r-0 disabled:cursor-default"
                >
                  <span className="block text-xs font-medium uppercase tracking-wider text-zinc-400">
                    {label}
                  </span>
                  <span
                    className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
                      isToday
                        ? "bg-amber-500 text-white"
                        : "text-zinc-700"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          {allDayEvents.length > 0 && (
            <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-zinc-200">
              <div className="border-r border-zinc-200 px-2 py-3 text-[0.65rem] font-medium uppercase tracking-wider text-zinc-400">
                Ganztägig
              </div>
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className="min-h-12 space-y-1 border-r border-zinc-200 p-1.5 last:border-r-0"
                >
                  {allDayEvents
                    .filter((event) => eventOverlapsDay(event, day))
                    .map((event) => (
                      <div
                        key={event.id}
                        title={event.title}
                        className={`truncate rounded border px-2 py-1 text-xs font-medium ${eventStyles[event.status]}`}
                      >
                        {event.title}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))]">
            <div
              className="relative border-r border-zinc-200 bg-zinc-50"
              style={{ height: GRID_HEIGHT }}
            >
              {hourLabels.map((hour, index) => (
                <span
                  key={hour}
                  className="absolute right-2 -translate-y-1/2 text-[0.65rem] text-zinc-400"
                  style={{ top: index * HOUR_HEIGHT }}
                >
                  {String(hour).padStart(2, "0")}:00
                </span>
              ))}
            </div>

            {days.map((day) => {
              const timedEvents = events.filter(
                (event) =>
                  !isAllDayOrMultiDay(event) &&
                  isSameDay(new Date(event.startsAt), day),
              );
              const isToday = isSameDay(day, today);
              const nowMinutes = today.getHours() * 60 + today.getMinutes();
              const nowTop =
                ((nowMinutes - GRID_START_HOUR * 60) / 60) * HOUR_HEIGHT;

              return (
                <div
                  key={day.toISOString()}
                  className="relative border-r border-zinc-200 last:border-r-0"
                  style={{
                    height: GRID_HEIGHT,
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, transparent 0, transparent 63px, rgb(228 228 231) 64px)",
                  }}
                >
                  {isToday && nowTop >= 0 && nowTop <= GRID_HEIGHT && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 border-t border-amber-500"
                      style={{ top: nowTop }}
                    >
                      <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-amber-500" />
                    </div>
                  )}

                  {timedEvents.map((event) => {
                    const position = getEventPosition(event);

                    return (
                      <article
                        key={event.id}
                        title={`${event.title}, ${formatTime(event.startsAt)} bis ${formatTime(event.endsAt)}`}
                        className={`absolute inset-x-1 z-10 overflow-hidden rounded-md border px-2 py-1 shadow-sm ${eventStyles[event.status]}`}
                        style={position}
                      >
                        <p className="truncate text-xs font-semibold">
                          {event.title}
                        </p>
                        <p className="truncate text-[0.65rem] opacity-75">
                          {formatTime(event.startsAt)} – {formatTime(event.endsAt)}
                        </p>
                        {(event.project || event.customer) && (
                          <p className="truncate text-[0.65rem] opacity-75">
                            {event.project?.name ?? event.customer?.name}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
