"use client";

import { useApiResource } from "@/lib/use-api-resource";

type ActivityType =
  | "CUSTOMER_CREATED"
  | "CUSTOMER_UPDATED"
  | "CUSTOMER_ARCHIVED"
  | "PROJECT_CREATED"
  | "PROJECT_UPDATED"
  | "PROJECT_STATUS_CHANGED"
  | "PROJECT_ARCHIVED"
  | "TASK_CREATED"
  | "TASK_ASSIGNED"
  | "TASK_COMPLETED"
  | "TASK_CANCELLED"
  | "TASK_ARCHIVED"
  | "NOTE_CREATED";

type Activity = {
  id: string;
  type: ActivityType;
  message: string;
  occurredAt: string;
  actor: {
    id: string;
    displayName: string;
  } | null;
};

type ActivityTimelineProps = {
  contextParam: "customerId" | "projectId" | "taskId";
  contextId: string;
};

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayLabel(dateString: string) {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, today)) return "Heute";
  if (isSameDay(date, yesterday)) return "Gestern";

  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function groupByDay(activities: Activity[]) {
  const groups: { label: string; items: Activity[] }[] = [];

  for (const activity of activities) {
    const label = formatDayLabel(activity.occurredAt);
    const existingGroup = groups.find((g) => g.label === label);
    if (existingGroup) {
      existingGroup.items.push(activity);
    } else {
      groups.push({ label, items: [activity] });
    }
  }

  return groups;
}

export function ActivityTimeline({ contextParam, contextId }: ActivityTimelineProps) {
  const { data, isLoading, error } = useApiResource<Activity[]>(
    `/activities?${contextParam}=${contextId}`,
    "Fehler beim Laden",
  );
  const activities = data ?? [];

  if (isLoading) return <p className="text-sm text-zinc-400">Lädt…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  if (activities.length === 0) {
    return <p className="text-sm text-zinc-500">Noch keine Aktivitäten.</p>;
  }

  const groups = groupByDay(activities);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
            {group.label}
          </p>
          <div className="space-y-3 border-l-2 border-zinc-100 pl-4">
            {group.items.map((activity) => (
              <div key={activity.id} className="relative">
                <div className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-amber-400" />
                <p className="text-sm text-zinc-700">{activity.message}</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {formatTime(activity.occurredAt)}
                  {activity.actor && ` · ${activity.actor.displayName}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
