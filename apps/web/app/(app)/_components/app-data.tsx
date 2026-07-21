import type { ReactNode } from "react";
import {
  FiCalendar,
  FiFileText,
  FiFolder,
  FiGrid,
  FiList,
  FiSettings,
  FiUsers,
} from "react-icons/fi";

export type MenuItem = {
  title: string;
  href: string;
  icon: ReactNode;
  gap?: boolean;
};

export type KpiItem = {
  label: string;
  value: string;
  detail: string;
};

export type TaskItem = {
  title: string;
  project: string;
  priority: string;
  due: string;
  status: string;
};

export type AttentionProject = {
  title: string;
  client: string;
  detail: string;
  owner: string;
  due: string;
};

export const menuItems: MenuItem[] = [
  { title: "Übersicht", href: "/dashboard", icon: <FiGrid /> },
  { title: "Kunden", href: "/customers", icon: <FiUsers />, gap: true },
  { title: "Projekte", href: "/projects", icon: <FiFolder /> },
  { title: "Aufgaben", href: "/tasks", icon: <FiList /> },
  { title: "Kalender", href: "/calendar", icon: <FiCalendar /> },
  { title: "Dokumente", href: "/documents", icon: <FiFileText /> },
  { title: "Einstellungen", href: "/settings", icon: <FiSettings /> },
];

export const kpiItems: KpiItem[] = [
  {
    label: "Aktive Projekte",
    value: "12",
    detail: "3 Projekte in der finalen Abstimmung",
  },
  {
    label: "Offene Aufgaben",
    value: "28",
    detail: "8 davon mit hoher Priorität",
  },
  {
    label: "Heute fällig",
    value: "6",
    detail: "2 Rückmeldungen bis 16:00 Uhr erwartet",
  },
  {
    label: "Wartet auf Kunden",
    value: "4",
    detail: "Angebote und Freigaben in Rücksprache",
  },
];

export const tasks: TaskItem[] = [
  {
    title: "Präsentationsfreigabe für Messestand finalisieren",
    project: "Light Forum Hamburg",
    priority: "Hoch",
    due: "Heute, 14:00",
    status: "In Arbeit",
  },
  {
    title: "Budgetabgleich mit Einkauf abstimmen",
    project: "Showroom Düsseldorf",
    priority: "Mittel",
    due: "17. Juli 2026",
    status: "Abstimmung",
  },
  {
    title: "Kundenfeedback zur Lichtszene dokumentieren",
    project: "Retail Concept Wien",
    priority: "Mittel",
    due: "18. Juli 2026",
    status: "Offen",
  },
  {
    title: "Technische Freigabe für Sonderleuchte einholen",
    project: "Hotelprojekt Zürich",
    priority: "Hoch",
    due: "Heute, 17:30",
    status: "Blockiert",
  },
  {
    title: "Montageplanung mit Partner abstimmen",
    project: "Flagship Store München",
    priority: "Niedrig",
    due: "22. Juli 2026",
    status: "Offen",
  },
];

export const attentionProjects: AttentionProject[] = [
  {
    title: "Hotelprojekt Zürich",
    client: "Atelier Moser",
    detail: "Freigabe für Sonderanfertigung steht noch aus.",
    owner: "Max Mustermann",
    due: "Heute",
  },
  {
    title: "Light Forum Hamburg",
    client: "Nord Event GmbH",
    detail: "Präsentationspaket benötigt finale Kundenfreigabe.",
    owner: "Lea Schneider",
    due: "Heute",
  },
  {
    title: "Retail Concept Wien",
    client: "Studio Form",
    detail: "Rückfragen zur Materialbemusterung offen.",
    owner: "Max Mustermann",
    due: "18. Juli",
  },
  {
    title: "Showroom Düsseldorf",
    client: "Bissinger Vertrieb",
    detail: "Kostenrahmen muss vor Angebotsversand bestätigt werden.",
    owner: "Tobias Kern",
    due: "19. Juli",
  },
  {
    title: "Flagship Store München",
    client: "Kollektiv Nord",
    detail: "Montagefenster mit externem Partner abstimmen.",
    owner: "Eva Lorenz",
    due: "22. Juli",
  },
];
