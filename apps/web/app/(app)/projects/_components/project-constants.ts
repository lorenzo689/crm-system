export type ProjectStatus =
  | "PLANNED"
  | "ACTIVE"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED";

export type ProjectPriority = "LOW" | "MEDIUM" | "HIGH";

export const statusStyles: Record<ProjectStatus, string> = {
  PLANNED: "bg-zinc-100 text-zinc-600",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-blue-50 text-blue-700",
  CANCELLED: "bg-red-50 text-red-700",
};

export const statusLabels: Record<ProjectStatus, string> = {
  PLANNED: "Geplant",
  ACTIVE: "Aktiv",
  ON_HOLD: "Pausiert",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Abgebrochen",
};

export const priorityLabels: Record<ProjectPriority, string> = {
  LOW: "Niedrig",
  MEDIUM: "Mittel",
  HIGH: "Hoch",
};
