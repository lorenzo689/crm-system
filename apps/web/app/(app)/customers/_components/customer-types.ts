export type Customer = {
  id: string;
  name: string;
  customerNumber: string;
  website: string | null;
  status: "ACTIVE" | "INACTIVE" | "LEAD";
  description: string | null;
  archivedAt: string | null;
  updatedAt: string;
};

export const statusStyles: Record<Customer["status"], string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700",
  LEAD: "bg-amber-50 text-amber-700",
  INACTIVE: "bg-zinc-100 text-zinc-500",
};

export const statusLabels: Record<Customer["status"], string> = {
  ACTIVE: "Aktiv",
  LEAD: "Lead",
  INACTIVE: "Inaktiv",
};

export type ArchiveFilter = "active" | "archived" | "all";
export type StatusFilter = "all" | Customer["status"];
export type SortKey = "name" | "customerNumber" | "status" | "updatedAt";
